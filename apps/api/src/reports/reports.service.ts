import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTS } from '../journal/accounts';

function toMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function toYearRange(year: number) {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

function toNumber(value: Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

export type ProfitLossMonthly = {
  month: number;
  monthLabel: string;
  revenue: number;
  expense: number;
  profit: number;
  marginPercent: number;
};

export type ProfitLossBreakdown = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type ProfitLossSummary = {
  mode: 'monthly' | 'yearly';
  period: {
    year: number;
    beYear: number;
    month?: number;
    label: string;
  };
  totals: {
    revenue: number;
    revenueGross: number;
    expense: number;
    expenseGross: number;
    profit: number;
    marginPercent: number;
  };
  revenueByType: ProfitLossBreakdown[];
  expenseByCategory: ProfitLossBreakdown[];
  monthly: ProfitLossMonthly[];
};

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a profit-and-loss summary for the company — derived from the journal
   * (PRD §7.2: every figure traces back to a balanced Dr=Cr entry), not the
   * document tables.
   *
   *   - Revenue = credits to income accounts (code 4xxx) on POSTED entries.
   *     Gross adds output VAT (2151).
   *   - Expense = debits to expense accounts (code 5xxx) on POSTED entries.
   *     Gross adds input VAT (1151).
   *   - Profit = revenue − expense (both ex-VAT).
   *
   * VOIDED entries are excluded. Capitalised costs (Dr intangible 1410) and
   * prepaid (Dr 1180) correctly stay out of the P&L until depreciation /
   * amortisation debits a 5xxx account.
   *
   * @param month optional — when set, returns single-month detail with the
   *              same year's 12-month strip alongside. When omitted, returns
   *              year-level aggregation.
   */
  async profitLoss(
    companyId: string,
    year: number,
    month?: number,
  ): Promise<ProfitLossSummary> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException({ code: 'BAD_YEAR', year });
    }
    if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new BadRequestException({ code: 'BAD_MONTH', month });
    }

    const mode: 'monthly' | 'yearly' = month ? 'monthly' : 'yearly';
    const range = month ? toMonthRange(year, month) : toYearRange(year);

    // ---- Pull the ledger (journal is the source of truth, PRD §7.2) --------
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        companyId,
        status: 'POSTED',
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

    let revenue = 0;
    let revenueGross = 0;
    let expense = 0;
    let expenseGross = 0;
    const expenseByCatMap = new Map<string, { amount: number; count: number }>();
    const monthlyRevenue: number[] = new Array(12).fill(0);
    const monthlyExpense: number[] = new Array(12).fill(0);

    // Revenue groups by source-document type, which the journal line does not
    // carry — collect the sales sourceIds now and resolve their types after.
    const salesEntryRevenue: { sourceId: string; amount: number }[] = [];
    let adjustmentRevenue = 0;

    for (const entry of entries) {
      const m = entry.entryDate.getUTCMonth();
      let entryRevenue = 0;
      for (const line of entry.lines) {
        const code = line.accountCode;
        const debit = toNumber(line.debit);
        const credit = toNumber(line.credit);
        if (code.startsWith('4')) {
          const v = credit - debit; // income is a credit; reversals net out
          revenue += v;
          revenueGross += v;
          monthlyRevenue[m] += v;
          entryRevenue += v;
        } else if (code === ACCOUNTS.OUTPUT_VAT.code) {
          revenueGross += credit - debit;
        } else if (code.startsWith('5')) {
          const v = debit - credit; // expense is a debit
          expense += v;
          expenseGross += v;
          monthlyExpense[m] += v;
          const cat = line.accountName.trim() || 'ไม่ระบุหมวด';
          const cur = expenseByCatMap.get(cat) ?? { amount: 0, count: 0 };
          expenseByCatMap.set(cat, { amount: cur.amount + v, count: cur.count + 1 });
        } else if (code === ACCOUNTS.INPUT_VAT.code) {
          expenseGross += debit - credit;
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

    // Resolve revenue-by-document-type from the sales entries' source docs.
    const revenueByTypeMap = new Map<string, { amount: number; count: number }>();
    if (salesEntryRevenue.length > 0) {
      const ids = [...new Set(salesEntryRevenue.map((s) => s.sourceId))];
      const docs = await this.prisma.salesDocument.findMany({
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
        label: TYPE_LABEL[key] ?? key,
        amount: v.amount,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    const expenseByCategory: ProfitLossBreakdown[] = Array.from(expenseByCatMap.entries())
      .map(([key, v]) => ({ key, label: key, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount);

    const beYear = year + 543;
    const label = month
      ? `${THAI_MONTHS[month - 1]} ${beYear}`
      : `ปี ${beYear}`;

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
}

const TYPE_LABEL: Record<string, string> = {
  INVOICE: 'ใบแจ้งหนี้',
  TAX_INVOICE: 'ใบกำกับภาษี',
  RECEIPT: 'ใบเสร็จรับเงิน',
  RECEIPT_TAX_INVOICE: 'ใบเสร็จ/ใบกำกับภาษี',
  ADJUSTMENT: 'รายการปรับปรุง',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
