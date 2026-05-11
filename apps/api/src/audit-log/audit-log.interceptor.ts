import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from '@hj/shared-types';
import { AUDIT_KEY, AuditMeta } from './audit-log.decorator';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private audit: AuditLogService,
    private prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    return next.handle().pipe(
      tap(async (res) => {
        try {
          const user = req.user;
          let companyId = user?.companyId;
          if (!companyId) {
            const first = await this.prisma.company.findFirst({ select: { id: true } });
            companyId = first?.id;
          }
          if (!companyId) return;

          await this.audit.record({
            companyId,
            userId: user?.id ?? meta.getEntityId?.(req, res) ?? null,
            action: meta.action,
            entityType: meta.entityType,
            entityId: meta.getEntityId?.(req, res) ?? null,
            reason: meta.getReason?.(req, res) ?? null,
            metadata: meta.getMetadata?.(req, res) ?? null,
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
          });
        } catch (err) {
          console.error('audit-log failed:', err);
        }
      }),
    );
  }
}
