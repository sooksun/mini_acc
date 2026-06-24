import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService, JournalLineInput } from '../journal/journal.service';
import { ACCOUNTS, accountTypeByPrefix } from '../journal/accounts';

function toNum(v: Prisma.Decimal | null | undefined): number {
  return v ? v.toNumber() : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Statement class of a code by prefix — one shared classifier with reports +
 * the chart seed, so closing and the balance sheet never disagree. */
function prefixType(code: string): AccountType {
  return accountTypeByPrefix(code) as AccountType;
}

export interface ClosingPreviewLine {
  accountCode: string;
  accountName: string;
  type: 'REVENUE' | 'EXPENSE';
  amount: number; // balance being closed (positive)
}

export interface YearEndClosingStatus {
  year: number;
  beYear: number;
  closed: boolean;
  closingEntryId: string | null;
  closedAt: string | null;
  revenue: number;
  expense: number;
  netProfit: number;
  retainedEarningsAccount: { code: string; name: string };
  /** Locked monthly periods in this year (advisory — 12 means every month is
   * period-closed; year-end close does not enforce it). */
  lockedMonthCount: number;
  lines: ClosingPreviewLine[];
}

/**
 * Year-end closing (ปิดบัญชีสิ้นปี). Posts a single CLOSING journal entry dated
 * 31 Dec that zeroes the nominal accounts (revenue 4xxx, expense 5xxx, and any
 * other income-statement code) and transfers the net to retained earnings
 * (3300):
 *
 *   Dr each revenue account (its credit balance)
 *   Cr each expense account (its debit balance)
 *   Cr/Dr retained earnings  with the net profit / loss
 *
 * The entry is sourceType CLOSING, which the P&L excludes (so a closed year
 * still reports real revenue/expense) but the trial balance and balance sheet
 * include (post-closing: nominal accounts zero, retained earnings carries the
 * result). Nominal balances are read INCLUDING prior closing entries, so a
 * re-close only captures un-closed activity. Idempotent per year.
 */
@Injectable()
export class YearEndClosingService {
  constructor(
    private prisma: PrismaService,
    private journal: JournalService,
  ) {}

  async status(companyId: string, year: number): Promise<YearEndClosingStatus> {
    const existing = await this.findClosingEntry(companyId, year);

    const reAccount = {
      code: ACCOUNTS.RETAINED_EARNINGS.code,
      name: ACCOUNTS.RETAINED_EARNINGS.name,
    };
    const lockedMonthCount = await this.prisma.accountingPeriod.count({
      where: { companyId, year, status: 'LOCKED' },
    });

    // When the year is closed the nominal accounts net to zero, so the live
    // remainder is empty — reconstruct what WAS closed from the posted entry's
    // own lines instead (Dr revenue / Cr expense / Cr-or-Dr retained earnings).
    if (existing) {
      const lines: ClosingPreviewLine[] = [];
      let revenue = 0;
      let expense = 0;
      for (const l of existing.lines) {
        if (l.accountCode === reAccount.code) continue;
        const debit = toNum(l.debit);
        const credit = toNum(l.credit);
        if (debit > 0) {
          lines.push({ accountCode: l.accountCode, accountName: l.accountName, type: 'REVENUE', amount: round2(debit) });
          revenue += debit;
        } else if (credit > 0) {
          lines.push({ accountCode: l.accountCode, accountName: l.accountName, type: 'EXPENSE', amount: round2(credit) });
          expense += credit;
        }
      }
      lines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
      return {
        year,
        beYear: year + 543,
        closed: true,
        closingEntryId: existing.id,
        closedAt: existing.postedAt?.toISOString() ?? existing.createdAt.toISOString(),
        revenue: round2(revenue),
        expense: round2(expense),
        netProfit: round2(revenue - expense),
        retainedEarningsAccount: reAccount,
        lockedMonthCount,
        lines,
      };
    }

    const { lines, revenue, expense, netProfit } = await this.computeClosing(companyId, year);
    return {
      year,
      beYear: year + 543,
      closed: false,
      closingEntryId: null,
      closedAt: null,
      revenue: round2(revenue),
      expense: round2(expense),
      netProfit: round2(netProfit),
      retainedEarningsAccount: reAccount,
      lockedMonthCount,
      lines,
    };
  }

  async close(companyId: string, userId: string, year: number) {
    const existing = await this.findClosingEntry(companyId, year);
    if (existing) {
      throw new ConflictException({
        code: 'YEAR_ALREADY_CLOSED',
        message: `ปี ${year + 543} ปิดบัญชีไปแล้ว — เปิดใหม่ก่อนหากต้องการปิดซ้ำ`,
        closingEntryId: existing.id,
      });
    }

    const { lines, revenue, expense, netProfit } = await this.computeClosing(companyId, year);
    if (lines.length === 0) {
      throw new ConflictException({
        code: 'NOTHING_TO_CLOSE',
        message: `ปี ${year + 543} ไม่มียอดบัญชีรายได้/ค่าใช้จ่ายให้ปิด`,
      });
    }

    // Build the balanced closing entry.
    const journalLines: JournalLineInput[] = [];
    for (const l of lines) {
      if (l.type === 'REVENUE') {
        journalLines.push({ accountCode: l.accountCode, accountName: l.accountName, debit: l.amount });
      } else {
        journalLines.push({ accountCode: l.accountCode, accountName: l.accountName, credit: l.amount });
      }
    }
    // Net profit → Cr retained earnings; net loss → Dr retained earnings.
    const re = ACCOUNTS.RETAINED_EARNINGS;
    if (round2(netProfit) > 0) {
      journalLines.push({ accountCode: re.code, accountName: re.name, credit: round2(netProfit) });
    } else if (round2(netProfit) < 0) {
      journalLines.push({ accountCode: re.code, accountName: re.name, debit: round2(-netProfit) });
    }

    const entryDate = new Date(Date.UTC(year, 11, 31, 12, 0, 0)); // 31 Dec, noon UTC
    const entry = await this.journal.post({
      companyId,
      userId,
      entryDate,
      description: `ปิดบัญชีสิ้นปี ${year + 543}`,
      sourceType: 'CLOSING',
      sourceId: String(year),
      lines: journalLines,
    });

    return {
      closingEntryId: entry.id,
      year,
      beYear: year + 543,
      revenue: round2(revenue),
      expense: round2(expense),
      netProfit: round2(netProfit),
    };
  }

  async reopen(companyId: string, userId: string, year: number, reason: string) {
    const existing = await this.findClosingEntry(companyId, year);
    if (!existing) {
      throw new NotFoundException({
        code: 'YEAR_NOT_CLOSED',
        message: `ปี ${year + 543} ยังไม่ได้ปิดบัญชี`,
      });
    }
    await this.journal.voidEntry(companyId, existing.id, userId, reason?.trim() || 'เปิดงวดปิดบัญชีใหม่');
    return { reopened: true, year, beYear: year + 543, voidedEntryId: existing.id };
  }

  private findClosingEntry(companyId: string, year: number) {
    return this.prisma.journalEntry.findFirst({
      where: { companyId, sourceType: 'CLOSING', periodYear: year, status: 'POSTED' },
      select: {
        id: true,
        postedAt: true,
        createdAt: true,
        lines: { select: { accountCode: true, accountName: true, debit: true, credit: true } },
      },
    });
  }

  /**
   * Net balance of each nominal account as of the end of `year` (cumulative,
   * INCLUDING prior closing entries — so this is the un-closed remainder). A
   * nominal account is one whose statement type is REVENUE or EXPENSE (chart
   * table when known, else by code prefix), i.e. not a 1/2/3 balance-sheet
   * account.
   */
  private async computeClosing(companyId: string, year: number) {
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const [lineRows, chartRows] = await Promise.all([
      this.prisma.journalEntryLine.groupBy({
        by: ['accountCode'],
        where: {
          journalEntry: { companyId, status: 'POSTED', entryDate: { lt: end } },
        },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.chartAccount.findMany({
        where: { companyId },
        select: { code: true, name: true, type: true },
      }),
    ]);

    const chart = new Map(chartRows.map((r) => [r.code, { name: r.name, type: r.type as AccountType }]));

    const lines: ClosingPreviewLine[] = [];
    let revenue = 0;
    let expense = 0;
    for (const row of lineRows) {
      const code = row.accountCode;
      const fromChart = chart.get(code);
      const type = fromChart?.type ?? prefixType(code);
      if (type !== AccountType.REVENUE && type !== AccountType.EXPENSE) continue; // skip 1/2/3

      const debit = toNum(row._sum.debit);
      const credit = toNum(row._sum.credit);
      const name = fromChart?.name ?? this.constantName(code) ?? code;

      if (type === AccountType.REVENUE) {
        const bal = round2(credit - debit); // credit-normal balance
        if (bal !== 0) {
          lines.push({ accountCode: code, accountName: name, type: 'REVENUE', amount: bal });
          revenue += bal;
        }
      } else {
        const bal = round2(debit - credit); // debit-normal balance
        if (bal !== 0) {
          lines.push({ accountCode: code, accountName: name, type: 'EXPENSE', amount: bal });
          expense += bal;
        }
      }
    }

    lines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return { lines, revenue: round2(revenue), expense: round2(expense), netProfit: round2(revenue - expense) };
  }

  private constantName(code: string): string | undefined {
    for (const a of Object.values(ACCOUNTS)) {
      if (a.code === code) return a.name;
    }
    return undefined;
  }
}
