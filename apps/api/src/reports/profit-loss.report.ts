import { ACCOUNTS } from '../journal/accounts';
import type { LedgerAggregationService } from './ledger-aggregation.service';
import {
  SALES_DOC_TYPE_LABEL,
  THAI_MONTHS,
  assertYearMonth,
  round2,
  toMonthRange,
  toNumber,
  toYearRange,
} from './report-common';
import type {
  ProfitLossBreakdown,
  ProfitLossMonthly,
  ProfitLossSummary,
} from './types';
import type { PrismaService } from '../prisma/prisma.service';

export async function buildProfitLoss(
  prisma: PrismaService,
  ledger: LedgerAggregationService,
  companyId: string,
  year: number,
  month?: number,
): Promise<ProfitLossSummary> {
  assertYearMonth(year, month);

  const mode: 'monthly' | 'yearly' = month ? 'monthly' : 'yearly';
  const range = month ? toMonthRange(year, month) : toYearRange(year);

  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      sourceType: { not: 'CLOSING' },
      entryDate: { gte: range.start, lt: range.end },
    },
    select: {
      sourceType: true,
      sourceId: true,
      entryDate: true,
      lines: {
        select: { accountCode: true, accountName: true, debit: true, credit: true },
      },
    },
  });

  const chart = await ledger.chartByCode(companyId);

  let revenue = 0;
  let revenueGross = 0;
  let expense = 0;
  let expenseGross = 0;
  const expenseByCatMap = new Map<string, { amount: number; count: number }>();
  const monthlyRevenue: number[] = new Array(12).fill(0);
  const monthlyExpense: number[] = new Array(12).fill(0);
  const salesEntryRevenue: { sourceId: string; amount: number }[] = [];
  let adjustmentRevenue = 0;

  for (const entry of entries) {
    const m = entry.entryDate.getUTCMonth();
    let entryRevenue = 0;
    for (const line of entry.lines) {
      const code = line.accountCode;
      const debit = toNumber(line.debit);
      const credit = toNumber(line.credit);
      if (code === ACCOUNTS.OUTPUT_VAT.code) {
        revenueGross += credit - debit;
        continue;
      }
      if (code === ACCOUNTS.INPUT_VAT.code) {
        expenseGross += debit - credit;
        continue;
      }
      const { type } = ledger.resolveAccount(code, chart);
      if (type === 'REVENUE') {
        const v = credit - debit;
        revenue += v;
        revenueGross += v;
        monthlyRevenue[m] += v;
        entryRevenue += v;
      } else if (type === 'EXPENSE') {
        const v = debit - credit;
        expense += v;
        expenseGross += v;
        monthlyExpense[m] += v;
        const cat = line.accountName.trim() || 'ไม่ระบุหมวด';
        const cur = expenseByCatMap.get(cat) ?? { amount: 0, count: 0 };
        expenseByCatMap.set(cat, { amount: cur.amount + v, count: cur.count + 1 });
      }
    }
    if (entryRevenue !== 0) {
      if (entry.sourceType === 'SALES_DOCUMENT' && entry.sourceId) {
        salesEntryRevenue.push({ sourceId: entry.sourceId, amount: entryRevenue });
      } else {
        adjustmentRevenue += entryRevenue;
      }
    }
  }

  const revenueByTypeMap = new Map<string, { amount: number; count: number }>();
  if (salesEntryRevenue.length > 0) {
    const ids = [...new Set(salesEntryRevenue.map((s) => s.sourceId))];
    const docs = await prisma.salesDocument.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true },
    });
    const typeById = new Map(docs.map((d) => [d.id, d.type as string]));
    for (const s of salesEntryRevenue) {
      const key = typeById.get(s.sourceId) ?? 'ADJUSTMENT';
      const cur = revenueByTypeMap.get(key) ?? { amount: 0, count: 0 };
      revenueByTypeMap.set(key, { amount: cur.amount + s.amount, count: cur.count + 1 });
    }
  }
  if (adjustmentRevenue !== 0) {
    const cur = revenueByTypeMap.get('ADJUSTMENT') ?? { amount: 0, count: 0 };
    revenueByTypeMap.set('ADJUSTMENT', {
      amount: cur.amount + adjustmentRevenue,
      count: cur.count + 1,
    });
  }

  const profit = revenue - expense;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

  const monthly: ProfitLossMonthly[] = THAI_MONTHS.map((label, idx) => {
    const r = monthlyRevenue[idx]!;
    const e = monthlyExpense[idx]!;
    const p = r - e;
    return {
      month: idx + 1,
      monthLabel: label,
      revenue: r,
      expense: e,
      profit: p,
      marginPercent: r > 0 ? (p / r) * 100 : 0,
    };
  });

  const revenueByType: ProfitLossBreakdown[] = Array.from(revenueByTypeMap.entries())
    .map(([key, v]) => ({
      key,
      label: SALES_DOC_TYPE_LABEL[key] ?? key,
      amount: v.amount,
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const expenseByCategory: ProfitLossBreakdown[] = Array.from(expenseByCatMap.entries())
    .map(([key, v]) => ({ key, label: key, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const beYear = year + 543;
  const label = month ? `${THAI_MONTHS[month - 1]} ${beYear}` : `ปี ${beYear}`;

  return {
    mode,
    period: { year, beYear, month, label },
    totals: {
      revenue: round2(revenue),
      revenueGross: round2(revenueGross),
      expense: round2(expense),
      expenseGross: round2(expenseGross),
      profit: round2(profit),
      marginPercent: round2(marginPercent),
    },
    revenueByType: revenueByType.map((b) => ({ ...b, amount: round2(b.amount) })),
    expenseByCategory: expenseByCategory.map((b) => ({ ...b, amount: round2(b.amount) })),
    monthly: monthly.map((m) => ({
      ...m,
      revenue: round2(m.revenue),
      expense: round2(m.expense),
      profit: round2(m.profit),
      marginPercent: round2(m.marginPercent),
    })),
  };
}