import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildBalanceSheet } from './balance-sheet.report';
import { buildDashboard } from './dashboard.report';
import { buildGeneralLedger } from './general-ledger.report';
import { LedgerAggregationService } from './ledger-aggregation.service';
import { buildProfitLoss } from './profit-loss.report';
import { buildTrialBalance } from './trial-balance.report';

export type {
  AccountType,
  BalanceSheetRow,
  BalanceSheetSummary,
  ChartAccountListItem,
  DashboardSummary,
  GeneralLedgerLine,
  GeneralLedgerReport,
  ProfitLossBreakdown,
  ProfitLossMonthly,
  ProfitLossSummary,
  TrialBalanceRow,
  TrialBalanceSummary,
} from './types';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerAggregationService,
  ) {}

  profitLoss(companyId: string, year: number, month?: number) {
    return buildProfitLoss(this.prisma, this.ledger, companyId, year, month);
  }

  dashboard(companyId: string, year: number, month: number) {
    return buildDashboard(this.prisma, this.ledger, companyId, year, month);
  }

  trialBalance(companyId: string, year: number, month?: number) {
    return buildTrialBalance(this.ledger, companyId, year, month);
  }

  balanceSheet(companyId: string, year: number, month?: number) {
    return buildBalanceSheet(this.ledger, companyId, year, month);
  }

  generalLedger(companyId: string, accountCode: string, year: number, month?: number) {
    return buildGeneralLedger(this.prisma, this.ledger, companyId, accountCode, year, month);
  }

  listAccounts(companyId: string) {
    return this.ledger.listAccounts(companyId);
  }
}