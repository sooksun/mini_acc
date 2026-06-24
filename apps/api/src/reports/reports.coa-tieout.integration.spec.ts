import { ReportsService } from './reports.service';
import { ChartAccountsService } from '../chart-accounts/chart-accounts.service';
import { JournalService } from '../journal/journal.service';
import { bootstrapTestEnv, teardownTestEnv, TestEnv } from '../../test/setup-integration';

/**
 * Regression for the critical review finding: the P&L used to classify
 * revenue/expense by CODE PREFIX while the balance sheet and year-end close used
 * the chart TYPE. A custom COGS account coded 6000 typed EXPENSE was then dropped
 * by the P&L but booked by the balance sheet, so the statements didn't tie.
 *
 * Now all three classify by chart type, so:
 *   P&L profit === balance-sheet current-period earnings.
 */
describe('Reports tie-out across a custom non-prefix account (integration)', () => {
  let env: TestEnv;
  let reports: ReportsService;
  let chart: ChartAccountsService;
  let journal: JournalService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    reports = env.app.get(ReportsService);
    chart = env.app.get(ChartAccountsService);
    journal = env.app.get(JournalService);

    // Custom COGS account — code 6000 (NOT a 4xxx/5xxx prefix), typed EXPENSE.
    await chart.create(env.seed.companyId, { code: '6000', name: 'ต้นทุนขาย', type: 'EXPENSE' });

    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-04-10T03:00:00.000Z'),
      description: 'ขายสินค้า',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '1130', accountName: 'ลูกหนี้การค้า', debit: 5000 },
        { accountCode: '4120', accountName: 'รายได้จากการขาย', credit: 5000 },
      ],
    });
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-04-11T03:00:00.000Z'),
      description: 'ต้นทุนสินค้าที่ขาย',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '6000', accountName: 'ต้นทุนขาย', debit: 3000 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 3000 },
      ],
    });
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('P&L counts the custom 6000 COGS account as expense (not dropped)', async () => {
    const pl = await reports.profitLoss(env.seed.companyId, 2026);
    expect(pl.totals.revenue).toBe(5000);
    expect(pl.totals.expense).toBe(3000); // 6000 recognised as expense via chart type
    expect(pl.totals.profit).toBe(2000);
  });

  it('P&L profit equals the balance-sheet current-period earnings', async () => {
    const pl = await reports.profitLoss(env.seed.companyId, 2026);
    const bs = await reports.balanceSheet(env.seed.companyId, 2026);
    const earnings = bs.equity.find((r) => r.accountCode === '3310')?.amount ?? 0;
    expect(earnings).toBe(pl.totals.profit); // both = 2000 — the three statements tie
  });

  it('the custom account shows under its chart name + type on the trial balance', async () => {
    const tb = await reports.trialBalance(env.seed.companyId, 2026);
    const row = tb.rows.find((r) => r.accountCode === '6000');
    expect(row?.accountName).toBe('ต้นทุนขาย');
    expect(row?.accountType).toBe('EXPENSE');
    expect(row?.debit).toBe(3000);
  });
});
