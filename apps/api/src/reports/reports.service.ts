import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Statuses that count as "confirmed" for revenue/expense recognition.
 * Mirrors the rule used in accountant-pack/report-builders.ts.
 */
const CONFIRMED_SALES_STATUSES: DocumentStatus[] = [
  DocumentStatus.USER_CONFIRMED,
  DocumentStatus.ACCOUNTED,
  DocumentStatus.PENDING_ACCOUNTANT,
  DocumentStatus.ACCOUNTANT_APPROVED,
  DocumentStatus.LOCKED,
];

const REVENUE_PRIMARY_TYPES: DocumentType[] = [DocumentType.INVOICE, DocumentType.TAX_INVOICE];
const REVENUE_CASH_TYPES: DocumentType[] = [DocumentType.RECEIPT, DocumentType.RECEIPT_TAX_INVOICE];

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
   * Build a profit-and-loss summary for the company.
   *
   * Recognition rules (accrual basis):
   *   - Revenue = SalesDocument where type is INVOICE/TAX_INVOICE (always),
   *     OR type is RECEIPT/RECEIPT_TAX_INVOICE with no parent (= standalone
   *     cash sale). Status must be confirmed (not DRAFT/VOIDED).
   *     Amount: subtotal (ex-VAT). Gross amount: grandTotal (incl. VAT).
   *   - Expense = ExpenseRecord with status RECORDED (= not voided).
   *     Amount: subtotal (ex-VAT). Gross: grandTotal (the cash outflow).
   *   - Profit = revenue.subtotal - expense.subtotal
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

    // ---- Revenue (sales documents) -----------------------------------------
    const salesDocs = await this.prisma.salesDocument.findMany({
      where: {
        companyId,
        status: { in: CONFIRMED_SALES_STATUSES },
        documentDate: { gte: range.start, lt: range.end },
        OR: [
          { type: { in: REVENUE_PRIMARY_TYPES } },
          { type: { in: REVENUE_CASH_TYPES }, parentDocumentId: null },
        ],
      },
      select: {
        type: true,
        documentDate: true,
        subtotal: true,
        grandTotal: true,
      },
    });

    // ---- Expense (recorded expense records) --------------------------------
    const expenses = await this.prisma.expenseRecord.findMany({
      where: {
        companyId,
        status: 'RECORDED',
        // Capitalized (intangible) and prepaid records are assets, not P&L
        // expense — their cost reaches the P&L later via depreciation /
        // prepaid amortization journals.
        treatAsIntangible: false,
        treatAsPrepaid: false,
        expenseDate: { gte: range.start, lt: range.end },
      },
      select: {
        expenseDate: true,
        subtotal: true,
        grandTotal: true,
        category: true,
      },
    });

    // ---- Aggregate ---------------------------------------------------------
    let revenue = 0;
    let revenueGross = 0;
    const revenueByTypeMap = new Map<string, { amount: number; count: number }>();
    const monthlyRevenue: number[] = new Array(12).fill(0);
    const monthlyExpense: number[] = new Array(12).fill(0);

    for (const doc of salesDocs) {
      const sub = toNumber(doc.subtotal);
      const gross = toNumber(doc.grandTotal);
      revenue += sub;
      revenueGross += gross;

      const cur = revenueByTypeMap.get(doc.type) ?? { amount: 0, count: 0 };
      revenueByTypeMap.set(doc.type, { amount: cur.amount + sub, count: cur.count + 1 });

      const m = doc.documentDate.getUTCMonth();
      monthlyRevenue[m] += sub;
    }

    let expense = 0;
    let expenseGross = 0;
    const expenseByCatMap = new Map<string, { amount: number; count: number }>();

    for (const r of expenses) {
      const sub = toNumber(r.subtotal);
      const gross = toNumber(r.grandTotal);
      expense += sub;
      expenseGross += gross;

      const cat = (r.category ?? '').trim() || 'ไม่ระบุหมวด';
      const cur = expenseByCatMap.get(cat) ?? { amount: 0, count: 0 };
      expenseByCatMap.set(cat, { amount: cur.amount + sub, count: cur.count + 1 });

      const m = r.expenseDate.getUTCMonth();
      monthlyExpense[m] += sub;
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
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
