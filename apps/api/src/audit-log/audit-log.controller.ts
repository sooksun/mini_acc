import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  ) {
    const limit = Math.min(Number(take ?? 100), 500);

    const rows = await this.prisma.auditLog.findMany({
      where: {
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
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });

    return rows;
  }
}
