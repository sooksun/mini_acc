import type { LedgerAggregationService } from './ledger-aggregation.service';
import { ACCOUNT_TYPE_LABEL, assertYearMonth, asOfLabel, endOfPeriod, round2 } from './report-common';
import type { TrialBalanceRow, TrialBalanceSummary } from './types';

export async function buildTrialBalance(
  ledger: LedgerAggregationService,
  companyId: string,
  year: number,
  month?: number,
): Promise<TrialBalanceSummary> {
  assertYearMonth(year, month);

  const [agg, chart] = await Promise.all([
    ledger.accountNetByCode(companyId, endOfPeriod(year, month)),
    ledger.chartByCode(companyId),
  ]);

  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const [code, v] of agg) {
    const net = v.debit - v.credit;
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    if (round2(debit) === 0 && round2(credit) === 0) continue;
    const { name, type: accountType } = ledger.resolveAccount(code, chart);
    rows.push({
      accountCode: code,
      accountName: name,
      accountType,
      accountTypeLabel: ACCOUNT_TYPE_LABEL[accountType],
      debit: round2(debit),
      credit: round2(credit),
    });
    totalDebit += debit;
    totalCredit += credit;
  }

  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const { beYear, label } = asOfLabel(year, month);
  return {
    asOf: { year, beYear, month, label },
    rows,
    totals: {
      debit: round2(totalDebit),
      credit: round2(totalCredit),
      balanced: round2(totalDebit) === round2(totalCredit),
    },
  };
}