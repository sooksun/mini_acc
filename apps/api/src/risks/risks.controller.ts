import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { RisksService } from './risks.service';
import { ListRisksDto } from './dto/list-risks.dto';
import { ResolveRiskDto } from './dto/resolve-risk.dto';

@Controller('risks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RisksController {
  constructor(private risks: RisksService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser, @Query() dto: ListRisksDto) {
    return this.risks.list(user.companyId, dto);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.risks.findOne(user.companyId, id);
  }

  @Post('scan')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('SCAN_RISKS', {
    entityType: 'RiskItem',
    getMetadata: (_req, res) => ({ created: res?.created, detected: res?.detected?.length }),
  })
  scan(@CurrentUser() user: AuthUser) {
    return this.risks.scan(user.companyId);
  }

  @Post(':id/resolve')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('RESOLVE_RISK', {
    entityType: 'RiskItem',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.resolution,
  })
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveRiskDto,
  ) {
    return this.risks.resolve(user.companyId, user.id, id, dto);
  }

  @Post(':id/accept')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('ACCEPT_RISK', {
    entityType: 'RiskItem',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.resolution,
  })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveRiskDto,
  ) {
    return this.risks.accept(user.companyId, user.id, id, dto);
  }

  @Post(':id/dismiss')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('DISMISS_RISK', {
    entityType: 'RiskItem',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.resolution,
  })
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveRiskDto,
  ) {
    return this.risks.dismiss(user.companyId, user.id, id, dto);
  }
}
