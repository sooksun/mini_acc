import { ReportsService } from './reports.service';
import { JournalService } from '../journal/journal.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

/**
 * Trial balance is computed purely from posted journal entries, so this spec
 * drives it with controlled manual journals (deterministic, no document
 * lifecycle noise). Each entry is itself Dr=Cr; the trial balance must net them
 * per account and re-balance.
 */
describe('ReportsService trial balance (integration)', () => {
  let env: TestEnv;
  let reports: ReportsService;
  let journal: JournalService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    reports = env.app.get(ReportsService);
    journal = env.app.get(JournalService);

    // E1 (May 2026): Dr AR 1070 / Cr Revenue 1000 / Cr Output VAT 70
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

    // E2 (May 2026): Dr ค่าเดินทาง 5000 500 / Cr Cash 1110 500
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-05-15T03:00:00.000Z'),
      description: 'ค่าเดินทาง',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '5000', accountName: 'ค่าเดินทาง', debit: 500 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 500 },
      ],
    });

    // E3 (May 2026): Dr ค่าอาหาร 5000 300 / Cr Cash 1110 300
    // Same code 5000 as E2 but a DIFFERENT accountName — must collapse to one row.
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-05-20T03:00:00.000Z'),
      description: 'ค่าอาหาร',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '5000', accountName: 'ค่าอาหาร', debit: 300 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 300 },
      ],
    });

    // E4 (Jan 2027): Dr Cash 1110 200 / Cr Revenue 4110 200 — NEXT YEAR.
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2027-01-10T03:00:00.000Z'),
      description: 'รับเงินปีถัดไป',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '1110', accountName: 'เงินสด', debit: 200 },
        { accountCode: '4110', accountName: 'รายได้ค่าบริการ', credit: 200 },
      ],
    });
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('balances and places each account on the correct side (as of end of 2026)', async () => {
    const tb = await reports.trialBalance(env.seed.companyId, 2026);

    const byCode = Object.fromEntries(tb.rows.map((r) => [r.accountCode, r]));

    // 1130 AR — debit balance 1070
    expect(byCode['1130']?.debit).toBe(1070);
    expect(byCode['1130']?.credit).toBe(0);
    expect(byCode['1130']?.accountType).toBe('ASSET');

    // 1110 Cash — net Cr 800 (out 500 + 300), credit balance 800
    expect(byCode['1110']?.credit).toBe(800);
    expect(byCode['1110']?.debit).toBe(0);

    // 2151 Output VAT — credit 70, liability
    expect(byCode['2151']?.credit).toBe(70);
    expect(byCode['2151']?.accountType).toBe('LIABILITY');

    // 4110 Revenue — credit 1000 (E4's 200 is next year, excluded)
    expect(byCode['4110']?.credit).toBe(1000);
    expect(byCode['4110']?.accountType).toBe('REVENUE');

    // 5000 Expense — ONE row, debit 800 (500 + 300), canonical chart name
    expect(byCode['5000']?.debit).toBe(800);
    expect(byCode['5000']?.accountName).toBe('ค่าใช้จ่ายทั่วไป');
    expect(byCode['5000']?.accountType).toBe('EXPENSE');

    // Totals: debit 1070 + 800 = 1870 ; credit 800 + 70 + 1000 = 1870
    expect(tb.totals.debit).toBe(1870);
    expect(tb.totals.credit).toBe(1870);
    expect(tb.totals.balanced).toBe(true);
  });

  it('is cumulative across the as-of cutoff (end of 2027 includes next-year entry)', async () => {
    const tb = await reports.trialBalance(env.seed.companyId, 2027);
    const byCode = Object.fromEntries(tb.rows.map((r) => [r.accountCode, r]));

    // Cash net: −500 −300 +200 = −600 → credit 600
    expect(byCode['1110']?.credit).toBe(600);
    // Revenue: 1000 + 200 = 1200
    expect(byCode['4110']?.credit).toBe(1200);
    expect(tb.totals.balanced).toBe(true);
  });

  it('names an off-chart account by its code (deterministic) and classifies by prefix', async () => {
    // 6001 is NOT in the chart of accounts — a manual JE may still post it.
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2028-03-10T03:00:00.000Z'),
      description: 'รายการนอกผังบัญชี',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '6001', accountName: 'ชื่อเฉพาะรายการ ก', debit: 50 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 50 },
      ],
    });

    const tb = await reports.trialBalance(env.seed.companyId, 2028);
    const row = tb.rows.find((r) => r.accountCode === '6001');
    expect(row).toBeDefined();
    expect(row?.accountName).toBe('6001'); // code, NOT the per-line label
    expect(row?.accountType).toBe('EXPENSE'); // off-chart 6xxx → expense-nominal (shared classifier)
    expect(tb.totals.balanced).toBe(true);
  });

  it('respects the month-level as-of boundary', async () => {
    // As of end of April 2026 — before any entry — every account is empty.
    const tbApr = await reports.trialBalance(env.seed.companyId, 2026, 4);
    expect(tbApr.rows.length).toBe(0);
    expect(tbApr.totals.debit).toBe(0);
    expect(tbApr.totals.credit).toBe(0);
    expect(tbApr.totals.balanced).toBe(true);

    // As of end of May 2026 — E1–E3 included, E4 (2027) excluded.
    const tbMay = await reports.trialBalance(env.seed.companyId, 2026, 5);
    expect(tbMay.totals.debit).toBe(1870);
    expect(tbMay.asOf.label).toBe('ณ สิ้นเดือนพฤษภาคม 2569');
  });
});
