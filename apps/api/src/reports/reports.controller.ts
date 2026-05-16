import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * Profit & Loss summary.
   *
   * - `year` is required (Gregorian, e.g. 2026).
   * - `month` (1-12) is optional — when omitted, returns yearly aggregation
   *   with a 12-month strip; when set, returns the same shape filtered to
   *   that single month with `mode='monthly'`.
   */
  @Get('profit-loss')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  profitLoss(
    @CurrentUser() user: AuthUser,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('month') monthRaw?: string,
  ) {
    let month: number | undefined;
    if (monthRaw !== undefined && monthRaw !== '' && monthRaw !== 'all') {
      const n = Number(monthRaw);
      if (!Number.isInteger(n) || n < 1 || n > 12) {
        throw new BadRequestException({ code: 'BAD_MONTH', month: monthRaw });
      }
      month = n;
    }
    return this.reports.profitLoss(user.companyId, year, month);
  }
}
