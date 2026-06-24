import { ReportsService } from './reports.service';
import { JournalService } from '../journal/journal.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

/**
 * Balance sheet + general ledger, driven by controlled manual journals.
 *
 * Ledger built in beforeAll:
 *   E1 (2026-01-01): Dr Cash 1110 10000 / Cr Capital 3100 10000   (opening capital)
 *   E2 (2026-05-10): Dr AR 1130 1070 / Cr Revenue 4110 1000 / Cr Output VAT 2151 70
 *   E3 (2026-05-15): Dr Expense 5000 300 / Cr Cash 1110 300
 *
 * As of end 2026:
 *   Assets:      Cash 9700 + AR 1070            = 10770
 *   Liabilities: Output VAT 70                  =    70
 *   Equity:      Capital 10000 + earnings 700   = 10700
 *   10770 === 70 + 10700  → balanced
 */
describe('ReportsService balance sheet + general ledger (integration)', () => {
  let env: TestEnv;
  let reports: ReportsService;
  let journal: JournalService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    reports = env.app.get(ReportsService);
    journal = env.app.get(JournalService);

    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-01-01T03:00:00.000Z'),
      description: 'ทุนจดทะเบียนยกมา',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '1110', accountName: 'เงินสด', debit: 10000 },
        { accountCode: '3100', accountName: 'ทุนจดทะเบียน', credit: 10000 },
      ],
    });
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-05-10T03:00:00.000Z'),
      description: 'ขายบริการ',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '1130', accountName: 'ลูกหนี้การค้า', debit: 1070 },
        { accountCode: '4110', accountName: 'รายได้ค่าบริการ', credit: 1000 },
        { accountCode: '2151', accountName: 'ภาษีขาย', credit: 70 },
      ],
    });
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-05-15T03:00:00.000Z'),
      description: 'ค่าใช้จ่าย',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '5000', accountName: 'ค่าใช้จ่ายทั่วไป', debit: 300 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 300 },
      ],
    });
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('balance sheet balances with current-period earnings folded into equity', async () => {
    const bs = await reports.balanceSheet(env.seed.companyId, 2026);

    const asset = Object.fromEntries(bs.assets.map((r) => [r.accountCode, r.amount]));
    const liab = Object.fromEntries(bs.liabilities.map((r) => [r.accountCode, r.amount]));
    const eq = Object.fromEntries(bs.equity.map((r) => [r.accountCode, r.amount]));

    expect(asset['1110']).toBe(9700); // 10000 − 300
    expect(asset['1130']).toBe(1070);
    expect(liab['2151']).toBe(70);
    expect(eq['3100']).toBe(10000);
    expect(eq['3310']).toBe(700); // synthetic current-period earnings (1000 − 300)

    expect(bs.totals.assets).toBe(10770);
    expect(bs.totals.liabilities).toBe(70);
    expect(bs.totals.equity).toBe(10700);
    expect(bs.totals.liabilitiesAndEquity).toBe(10770);
    expect(bs.totals.balanced).toBe(true);

    // The synthetic earnings line is flagged so the UI can label it.
    const earningsRow = bs.equity.find((r) => r.accountCode === '3310');
    expect(earningsRow?.synthetic).toBe(true);
  });

  it('general ledger for a cash account: opening + running + closing', async () => {
    const gl = await reports.generalLedger(env.seed.companyId, '1110', 2026);

    expect(gl.account.accountType).toBe('ASSET');
    expect(gl.openingBalance).toBe(0); // nothing before 2026
    expect(gl.lines.length).toBe(2); // capital in, expense out
    expect(gl.lines[0]?.balance).toBe(10000); // after capital
    expect(gl.lines[1]?.balance).toBe(9700); // after expense
    expect(gl.totalDebit).toBe(10000);
    expect(gl.totalCredit).toBe(300);
    expect(gl.closingBalance).toBe(9700);
  });

  it('general ledger respects the month filter via opening balance', async () => {
    // Only May activity, with the Jan capital carried in as the opening balance.
    const gl = await reports.generalLedger(env.seed.companyId, '1110', 2026, 5);

    expect(gl.openingBalance).toBe(10000); // Jan capital carried in
    expect(gl.lines.length).toBe(1); // only the May expense
    expect(gl.lines[0]?.credit).toBe(300);
    expect(gl.closingBalance).toBe(9700);
    expect(gl.period.label).toBe('พฤษภาคม 2569'); // range report → no "ณ สิ้น" prefix
  });

  it('general ledger of a credit-normal account shows a negative (credit) running balance', async () => {
    const gl = await reports.generalLedger(env.seed.companyId, '4110', 2026);

    expect(gl.account.accountType).toBe('REVENUE');
    expect(gl.totalCredit).toBe(1000);
    expect(gl.closingBalance).toBe(-1000); // signed debit-positive → credit shows negative
  });

  it('stays balanced when a non-standard (OTHER) account is posted', async () => {
    // 6010 classifies as OTHER — it must fold into current-period earnings,
    // not silently unbalance the sheet.
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-06-01T03:00:00.000Z'),
      description: 'รายการ OTHER',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '6010', accountName: 'ค่าใช้จ่ายอื่น', debit: 100 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 100 },
      ],
    });

    const bs = await reports.balanceSheet(env.seed.companyId, 2026);
    expect(bs.totals.balanced).toBe(true);
    // 6010 must NOT appear as an asset/liability/equity row.
    const allRows = [...bs.assets, ...bs.liabilities, ...bs.equity];
    expect(allRows.find((r) => r.accountCode === '6010')).toBeUndefined();
    // Earnings dropped by 100 (was 700 → 600); cash dropped by 100 (9700 → 9600).
    expect(bs.equity.find((r) => r.accountCode === '3310')?.amount).toBe(600);
    expect(bs.assets.find((r) => r.accountCode === '1110')?.amount).toBe(9600);
  });

  it('listAccounts returns the chart including the new equity accounts', async () => {
    const accounts = await reports.listAccounts(env.seed.companyId);
    const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
    expect(byCode['3100']?.name).toBe('ทุนจดทะเบียน');
    expect(byCode['3100']?.accountType).toBe('EQUITY');
    expect(byCode['3300']?.name).toBe('กำไรสะสม');
  });
});
