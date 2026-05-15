import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from '@hj/shared-types';
import { AUDIT_KEY, AuditMeta } from './audit-log.decorator';
import { AuditLogService } from './audit-log.service';

export const auditFailureCount = { value: 0 };

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private reflector: Reflector,
    private audit: AuditLogService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    return next.handle().pipe(
      tap(async (res) => {
        const user = req.user;
        const entityId = meta.getEntityId?.(req, res) ?? null;
        // companyId MUST come from the authenticated user — never fall back to "first company".
        // Routes without an auth guard (e.g. /auth/login on failure path) may legitimately
        // arrive without req.user; in that case we still try the response payload (login
        // returns res.user.companyId) before giving up.
        const companyId = user?.companyId ?? (res as { user?: AuthUser } | undefined)?.user?.companyId;
        if (!companyId) {
          this.logger.warn(
            `audit-log skipped (no companyId): action=${meta.action} entityType=${meta.entityType ?? '-'} entityId=${entityId ?? '-'}`,
          );
          auditFailureCount.value++;
          return;
        }

        // userId MUST be a real User.id or null — never reuse entityId there
        // (it would corrupt the AuditLog→User foreign key and pollute audit history).
        const userId = user?.id ?? (res as { user?: AuthUser } | undefined)?.user?.id ?? null;

        try {
          await this.audit.record({
            companyId,
            userId,
            action: meta.action,
            entityType: meta.entityType,
            entityId,
            reason: meta.getReason?.(req, res) ?? null,
            metadata: meta.getMetadata?.(req, res) ?? null,
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
          });
        } catch (err) {
          auditFailureCount.value++;
          this.logger.error(
            {
              event: 'audit_log_write_failed',
              action: meta.action,
              entityType: meta.entityType,
              entityId,
              companyId,
              userId,
              error: err instanceof Error ? err.message : String(err),
            },
            err instanceof Error ? err.stack : undefined,
          );
        }
      }),
    );
  }
}
