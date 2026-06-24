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
   * Dashboard overview — this-month + year-to-date P&L and the "งานค้าง" counts.
   * `year`/`month` default to the current month in Asia/Bangkok (the +7h shift
   * avoids an off-by-one on the 1st of the month before 07:00 local).
   */
  @Get('dashboard')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  dashboard(
    @CurrentUser() user: AuthUser,
    @Query('year') yearRaw?: string,
    @Query('month') monthRaw?: string,
  ) {
    const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const year = yearRaw ? Number(yearRaw) : bkk.getUTCFullYear();
    const month = monthRaw ? Number(monthRaw) : bkk.getUTCMonth() + 1;
    return this.reports.dashboard(user.companyId, year, month);
  }

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
    return this.reports.profitLoss(user.companyId, year, this.parseMonth(monthRaw));
  }

  /**
   * Trial balance (งบทดลอง) as of the end of a period.
   *
   * - `year` is required (Gregorian, e.g. 2026).
   * - `month` (1-12) is optional — when set, the balance is as of that month's
   *   end; when omitted, as of year end. The figure is cumulative (since
   *   inception up to the as-of date), not just the period's activity.
   */
  @Get('trial-balance')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  trialBalance(
    @CurrentUser() user: AuthUser,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('month') monthRaw?: string,
  ) {
    return this.reports.trialBalance(user.companyId, year, this.parseMonth(monthRaw));
  }

  /**
   * Balance sheet (งบแสดงฐานะการเงิน) as of the end of a period. Same year/month
   * semantics as the trial balance; the figure is cumulative to the as-of date.
   */
  @Get('balance-sheet')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  balanceSheet(
    @CurrentUser() user: AuthUser,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('month') monthRaw?: string,
  ) {
    return this.reports.balanceSheet(user.companyId, year, this.parseMonth(monthRaw));
  }

  /**
   * General ledger (บัญชีแยกประเภท) for one account: opening balance + posted
   * lines in the period with a running balance + closing balance.
   * `accountCode` is required; `month` optional (whole year if omitted).
   */
  @Get('general-ledger')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  generalLedger(
    @CurrentUser() user: AuthUser,
    @Query('accountCode') accountCode: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('month') monthRaw?: string,
  ) {
    if (!accountCode) {
      throw new BadRequestException({ code: 'ACCOUNT_CODE_REQUIRED' });
    }
    return this.reports.generalLedger(user.companyId, accountCode, year, this.parseMonth(monthRaw));
  }

  /** Chart of accounts list — for the general-ledger account picker. */
  @Get('accounts')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  listAccounts(@CurrentUser() user: AuthUser) {
    return this.reports.listAccounts(user.companyId);
  }

  /** Parse the optional `month` query string → 1-12 number, or undefined for the
   * whole period. Shared by both report handlers. */
  private parseMonth(monthRaw?: string): number | undefined {
    if (monthRaw === undefined || monthRaw === '' || monthRaw === 'all') return undefined;
    const n = Number(monthRaw);
    if (!Number.isInteger(n) || n < 1 || n > 12) {
      throw new BadRequestException({ code: 'BAD_MONTH', month: monthRaw });
    }
    return n;
  }
}
