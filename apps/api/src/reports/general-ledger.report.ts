import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { LedgerAggregationService } from './ledger-aggregation.service';
import {
  ACCOUNT_TYPE_LABEL,
  assertYearMonth,
  endOfPeriod,
  rangeLabel,
  round2,
  toNumber,
} from './report-common';
import type { GeneralLedgerLine, GeneralLedgerReport } from './types';

export async function buildGeneralLedger(
  prisma: PrismaService,
  ledger: LedgerAggregationService,
  companyId: string,
  accountCode: string,
  year: number,
  month?: number,
): Promise<GeneralLedgerReport> {
  assertYearMonth(year, month);
  if (!/^\d{3,20}$/.test(accountCode)) {
    throw new BadRequestException({ code: 'BAD_ACCOUNT_CODE', accountCode });
  }

  const start = month
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, 0, 1));
  const end = endOfPeriod(year, month);

  const openingAgg = await prisma.journalEntryLine.aggregate({
    where: {
      accountCode,
      journalEntry: { companyId, status: 'POSTED', entryDate: { lt: start } },
    },
    _sum: { debit: true, credit: true },
  });
  const openingBalance = round2(
    toNumber(openingAgg._sum.debit) - toNumber(openingAgg._sum.credit),
  );

  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      entryDate: { gte: start, lt: end },
      lines: { some: { accountCode } },
    },
    select: {
      id: true,
      entryDate: true,
      description: true,
      lines: { select: { accountCode: true, debit: true, credit: true, description: true } },
    },
    orderBy: { entryDate: 'asc' },
  });

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const lines: GeneralLedgerLine[] = [];
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountCode !== accountCode) continue;
      const debit = round2(toNumber(line.debit));
      const credit = round2(toNumber(line.credit));
      running = round2(running + debit - credit);
      totalDebit += debit;
      totalCredit += credit;
      lines.push({
        date: entry.entryDate.toISOString(),
        journalEntryId: entry.id,
        description: line.description?.trim() || entry.description,
        debit,
        credit,
        balance: running,
      });
    }
  }

  const { name, type } = ledger.resolveAccount(accountCode, await ledger.chartByCode(companyId));
  const { beYear, label } = rangeLabel(year, month);
  return {
    account: {
      code: accountCode,
      name,
      accountType: type,
      accountTypeLabel: ACCOUNT_TYPE_LABEL[type],
    },
    period: { year, beYear, month, label },
    openingBalance,
    lines,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    closingBalance: round2(running),
  };
}