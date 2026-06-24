import { ReportsService } from './reports.service';
import { JournalService } from '../journal/journal.service';
import { bootstrapTestEnv, teardownTestEnv, TestEnv } from '../../test/setup-integration';

/**
 * Dashboard overview. The P&L figures reuse profitLoss() (asserted in depth
 * elsewhere), so this spec focuses on what's new: (a) the this-month vs
 * year-to-date split, and (b) the "งานค้าง" counts actually running against the
 * real schema — a wrong field or enum value would throw a Prisma validation
 * error here, which is the cheap insurance this test buys.
 *
 * Ledger built in beforeAll (year 2026):
 *   E1 (2026-05-10): Dr AR 1130 1070 / Cr Revenue 4110 1000 / Cr Output VAT 2151 70
 *   E2 (2026-05-15): Dr Expense 5000 300 / Cr Cash 1110 300
 *   E3 (2026-06-01): Dr Expense 5000 200 / Cr Cash 1110 200
 */
describe('ReportsService dashboard (integration)', () => {
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
      description: 'ค่าใช้จ่าย พ.ค.',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '5000', accountName: 'ค่าใช้จ่ายทั่วไป', debit: 300 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 300 },
      ],
    });
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-06-01T03:00:00.000Z'),
      description: 'ค่าใช้จ่าย มิ.ย.',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '5000', accountName: 'ค่าใช้จ่ายทั่วไป', debit: 200 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 200 },
      ],
    });
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('splits this-month vs year-to-date P&L from the journal', async () => {
    const d = await reports.dashboard(env.seed.companyId, 2026, 5);

    expect(d.period).toMatchObject({ year: 2026, month: 5, beYear: 2569, monthLabel: 'พฤษภาคม' });

    // May only.
    expect(d.thisMonth).toEqual({ revenue: 1000, expense: 300, profit: 700 });
    // Whole year (May + June expenses).
    expect(d.thisYear).toEqual({ revenue: 1000, expense: 500, profit: 500 });

    // 12-month strip, May/June populated.
    expect(d.monthly).toHaveLength(12);
    expect(d.monthly[4]).toMatchObject({ month: 5, revenue: 1000, expense: 300 });
    expect(d.monthly[5]).toMatchObject({ month: 6, revenue: 0, expense: 200 });
  });

  it('returns "งานค้าง" counts that execute against the real schema', async () => {
    const d = await reports.dashboard(env.seed.companyId, 2026, 5);

    // A clean seed has nothing outstanding — but every count query must run
    // (a wrong field/enum name would throw a Prisma validation error here).
    expect(d.pending).toEqual({
      draftSalesDocs: 0,
      pendingExpenses: 0,
      aiInboxPending: 0,
      openRisks: 0,
      criticalRisks: 0,
      unmatchedBank: 0,
    });
  });

  it('counts open risks, with criticals broken out', async () => {
    await env.prisma.riskItem.create({
      data: {
        companyId: env.seed.companyId,
        type: 'TAX_ID_MISSING',
        level: 'CRITICAL',
        title: 'ทดสอบความเสี่ยงระดับวิกฤต',
      },
    });
    await env.prisma.riskItem.create({
      data: {
        companyId: env.seed.companyId,
        type: 'MISSING_DOCUMENT',
        level: 'LOW',
        title: 'ทดสอบความเสี่ยงระดับต่ำ',
      },
    });

    const d = await reports.dashboard(env.seed.companyId, 2026, 5);
    expect(d.pending.openRisks).toBe(2);
    expect(d.pending.criticalRisks).toBe(1);
  });
});
