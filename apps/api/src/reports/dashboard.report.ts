import type { PrismaService } from '../prisma/prisma.service';
import type { LedgerAggregationService } from './ledger-aggregation.service';
import { buildProfitLoss } from './profit-loss.report';
import { THAI_MONTHS, assertYearMonth } from './report-common';
import type { DashboardSummary } from './types';

export async function buildDashboard(
  prisma: PrismaService,
  ledger: LedgerAggregationService,
  companyId: string,
  year: number,
  month: number,
): Promise<DashboardSummary> {
  assertYearMonth(year, month);

  const [
    pnl,
    draftSalesDocs,
    pendingExpenses,
    aiInboxPending,
    openRisks,
    criticalRisks,
    unmatchedBank,
  ] = await Promise.all([
    buildProfitLoss(prisma, ledger, companyId, year),
    prisma.salesDocument.count({ where: { companyId, status: 'DRAFT' } }),
    prisma.expenseReceipt.count({
      where: {
        companyId,
        status: { in: ['UPLOADED', 'PENDING_VENDOR_APPROVAL', 'READY_TO_ACCOUNT'] },
      },
    }),
    prisma.aiSuggestion.count({
      where: { companyId, status: 'PENDING', deletedAt: null },
    }),
    prisma.riskItem.count({ where: { companyId, status: 'OPEN' } }),
    prisma.riskItem.count({ where: { companyId, status: 'OPEN', level: 'CRITICAL' } }),
    prisma.bankStatementLine.count({ where: { companyId, matchedPaymentId: null } }),
  ]);

  const m = pnl.monthly[month - 1]!;

  return {
    period: { year, month, beYear: year + 543, monthLabel: THAI_MONTHS[month - 1]! },
    thisMonth: { revenue: m.revenue, expense: m.expense, profit: m.profit },
    thisYear: {
      revenue: pnl.totals.revenue,
      expense: pnl.totals.expense,
      profit: pnl.totals.profit,
    },
    monthly: pnl.monthly,
    pending: {
      draftSalesDocs,
      pendingExpenses,
      aiInboxPending,
      openRisks,
      criticalRisks,
      unmatchedBank,
    },
  };
}