import { SYNTHETIC_CURRENT_PERIOD_EARNINGS } from '../journal/accounts';
import type { LedgerAggregationService } from './ledger-aggregation.service';
import { assertYearMonth, asOfLabel, endOfPeriod, round2 } from './report-common';
import type { BalanceSheetRow, BalanceSheetSummary } from './types';

export async function buildBalanceSheet(
  ledger: LedgerAggregationService,
  companyId: string,
  year: number,
  month?: number,
): Promise<BalanceSheetSummary> {
  assertYearMonth(year, month);

  const [agg, chart] = await Promise.all([
    ledger.accountNetByCode(companyId, endOfPeriod(year, month)),
    ledger.chartByCode(companyId),
  ]);

  const assets: BalanceSheetRow[] = [];
  const liabilities: BalanceSheetRow[] = [];
  const equity: BalanceSheetRow[] = [];
  let netProfit = 0;

  for (const [code, v] of agg) {
    const net = v.debit - v.credit;
    const { name, type } = ledger.resolveAccount(code, chart);
    if (type === 'ASSET') {
      if (round2(net) !== 0) {
        assets.push({ accountCode: code, accountName: name, amount: round2(net) });
      }
    } else if (type === 'LIABILITY') {
      if (round2(-net) !== 0) {
        liabilities.push({ accountCode: code, accountName: name, amount: round2(-net) });
      }
    } else if (type === 'EQUITY') {
      if (round2(-net) !== 0) {
        equity.push({ accountCode: code, accountName: name, amount: round2(-net) });
      }
    } else {
      netProfit += -net;
    }
  }

  equity.push({
    accountCode: SYNTHETIC_CURRENT_PERIOD_EARNINGS.code,
    accountName: SYNTHETIC_CURRENT_PERIOD_EARNINGS.name,
    amount: round2(netProfit),
    synthetic: true,
  });

  assets.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  liabilities.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  equity.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalEquity = round2(equity.reduce((s, r) => s + r.amount, 0));

  const { beYear, label } = asOfLabel(year, month);
  return {
    asOf: { year, beYear, month, label },
    assets,
    liabilities,
    equity,
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      equity: totalEquity,
      liabilitiesAndEquity: round2(totalLiabilities + totalEquity),
      balanced: round2(totalAssets) === round2(totalLiabilities + totalEquity),
    },
  };
}