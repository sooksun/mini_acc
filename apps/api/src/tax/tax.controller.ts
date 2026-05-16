import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TaxService } from './tax.service';
import { PeriodFilterDto } from './dto/period-filter.dto';

@Controller('tax')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxController {
  constructor(private tax: TaxService) {}

  @Get('dashboard')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  dashboard(@CurrentUser() user: AuthUser, @Query() filter: PeriodFilterDto) {
    return this.tax.dashboard(user.companyId, filter);
  }

  @Get('vat-report')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  vatReport(@CurrentUser() user: AuthUser, @Query() filter: PeriodFilterDto) {
    return this.tax.vatReport(user.companyId, filter);
  }

  @Get('wht-report')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  whtReport(@CurrentUser() user: AuthUser, @Query() filter: PeriodFilterDto) {
    return this.tax.whtReport(user.companyId, filter);
  }
}
