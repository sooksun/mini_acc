import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditInput {
  companyId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        reason: input.reason ?? null,
        metadata: (input.metadata as any) ?? undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async list(companyId: string, take = 100) {
    return this.prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
