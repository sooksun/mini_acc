import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTS, accountTypeByPrefix } from '../journal/accounts';
import { ACCOUNT_TYPE_LABEL, toNumber } from './report-common';
import type { AccountType, ChartAccountListItem } from './types';

const ACCOUNT_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.values(ACCOUNTS).map((a) => [a.code, a.name]),
);

@Injectable()
export class LedgerAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  async accountNetByCode(
    companyId: string,
    end: Date,
  ): Promise<Map<string, { debit: number; credit: number }>> {
    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountCode'],
      where: {
        journalEntry: { companyId, status: 'POSTED', entryDate: { lt: end } },
      },
      _sum: { debit: true, credit: true },
    });
    return new Map(
      rows.map((row) => [
        row.accountCode,
        { debit: toNumber(row._sum.debit), credit: toNumber(row._sum.credit) },
      ]),
    );
  }

  async chartByCode(companyId: string): Promise<Map<string, { name: string; type: AccountType }>> {
    const rows = await this.prisma.chartAccount.findMany({
      where: { companyId },
      select: { code: true, name: true, type: true },
    });
    return new Map(rows.map((r) => [r.code, { name: r.name, type: r.type as AccountType }]));
  }

  resolveAccount(
    code: string,
    chart: Map<string, { name: string; type: AccountType }>,
  ): { name: string; type: AccountType } {
    const fromChart = chart.get(code);
    if (fromChart) return fromChart;
    return { name: ACCOUNT_NAME_BY_CODE[code] ?? code, type: accountTypeByPrefix(code) };
  }

  async listAccounts(companyId: string): Promise<ChartAccountListItem[]> {
    const rows = await this.prisma.chartAccount.findMany({
      where: { companyId, isActive: true },
      select: { code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    });
    if (rows.length > 0) {
      return rows.map((r) => ({
        code: r.code,
        name: r.name,
        accountType: r.type as AccountType,
        accountTypeLabel: ACCOUNT_TYPE_LABEL[r.type as AccountType],
      }));
    }
    return Object.values(ACCOUNTS)
      .map((a) => {
        const type = accountTypeByPrefix(a.code);
        return {
          code: a.code,
          name: a.name,
          accountType: type,
          accountTypeLabel: ACCOUNT_TYPE_LABEL[type],
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }
}