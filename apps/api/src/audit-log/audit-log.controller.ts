import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('OWNER', 'ACCOUNTANT')
  async list(
    @CurrentUser() user: AuthUser,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    // Paginated, not a bare `take`-capped array: AuditLog is the fastest-growing
    // table and previously the UI showed only the newest N rows with no way to
    // page back — older history was silently unreachable.
    const limit = Math.min(Math.max(Number(take ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(skip ?? 0) || 0, 0);

    const where: Prisma.AuditLogWhereInput = {
      companyId: user.companyId,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
