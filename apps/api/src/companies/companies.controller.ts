import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateVatStatusDto } from './dto/update-vat-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';

@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private companies: CompaniesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.companies.getOwn(user.companyId);
  }

  @Patch()
  @Roles('OWNER')
  @AuditAction('UPDATE_COMPANY', { entityType: 'Company' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(user.companyId, dto);
  }

  @Get('vat-history')
  vatHistory(@CurrentUser() user: AuthUser) {
    return this.companies.listVatHistory(user.companyId);
  }

  @Post('vat-status')
  @Roles('OWNER')
  @AuditAction('UPDATE_VAT_STATUS', {
    entityType: 'CompanyVatStatus',
    getMetadata: (req) => ({ status: req.body?.status, effectiveFrom: req.body?.effectiveFrom }),
  })
  setVatStatus(@CurrentUser() user: AuthUser, @Body() dto: UpdateVatStatusDto) {
    return this.companies.setVatStatus(user.companyId, dto);
  }
}
