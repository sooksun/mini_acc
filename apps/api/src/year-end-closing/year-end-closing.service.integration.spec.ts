import { ConflictException } from '@nestjs/common';
import { YearEndClosingService } from './year-end-closing.service';
import { ReportsService } from '../reports/reports.service';
import { JournalService } from '../journal/journal.service';
import { bootstrapTestEnv, teardownTestEnv, TestEnv } from '../../test/setup-integration';

/**
 * Ledger for fiscal 2026:
 *   Dr AR 1130 1000 / Cr Revenue 4110 1000
 *   Dr Expense 5000 300 / Cr Cash 1110 300
 * → net profit 700.
 */
describe('YearEndClosingService (integration)', () => {
  let env: TestEnv;
  let closing: YearEndClosingService;
  let reports: ReportsService;
  let journal: JournalService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    closing = env.app.get(YearEndClosingService);
    reports = env.app.get(ReportsService);
    journal = env.app.get(JournalService);

    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-05-10T03:00:00.000Z'),
      description: 'รายได้',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '1130', accountName: 'ลูกหนี้การค้า', debit: 1000 },
        { accountCode: '4110', accountName: 'รายได้ค่าบริการ', credit: 1000 },
      ],
    });
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-06-10T03:00:00.000Z'),
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

  it('status previews revenue/expense/netProfit before closing', async () => {
    const s = await closing.status(env.seed.companyId, 2026);
    expect(s.closed).toBe(false);
    expect(s.revenue).toBe(1000);
    expect(s.expense).toBe(300);
    expect(s.netProfit).toBe(700);
    expect(s.lines.find((l) => l.accountCode === '4110')?.amount).toBe(1000);
    expect(s.lines.find((l) => l.accountCode === '5000')?.amount).toBe(300);
  });

  it('close posts a balanced CLOSING entry Dr revenue / Cr expense / Cr retained earnings', async () => {
    const res = await closing.close(env.seed.companyId, env.seed.userId, 2026);
    expect(res.netProfit).toBe(700);

    const entry = await env.prisma.journalEntry.findFirst({
      where: { companyId: env.seed.companyId, sourceType: 'CLOSING', status: 'POSTED' },
      include: { lines: true },
    });
    expect(entry).toBeTruthy();
    expect(Number(entry!.totalDebit)).toBe(Number(entry!.totalCredit));
    const byCode = Object.fromEntries(entry!.lines.map((l) => [l.accountCode, l]));
    expect(Number(byCode['4110']?.debit)).toBe(1000); // revenue zeroed via debit
    expect(Number(byCode['5000']?.credit)).toBe(300); // expense zeroed via credit
    expect(Number(byCode['3300']?.credit)).toBe(700); // net profit → retained earnings
  });

  it('status of a closed year shows the figures that were closed (not zero)', async () => {
    const s = await closing.status(env.seed.companyId, 2026);
    expect(s.closed).toBe(true);
    expect(s.revenue).toBe(1000); // reconstructed from the closing entry, not the now-zero remainder
    expect(s.expense).toBe(300);
    expect(s.netProfit).toBe(700);
    expect(s.lines.find((l) => l.accountCode === '4110')?.amount).toBe(1000);
  });

  it('P&L still reports real revenue/expense after closing (CLOSING excluded)', async () => {
    const pl = await reports.profitLoss(env.seed.companyId, 2026);
    expect(pl.totals.revenue).toBe(1000);
    expect(pl.totals.expense).toBe(300);
    expect(pl.totals.profit).toBe(700);
  });

  it('post-closing trial balance zeroes nominal accounts and shows retained earnings', async () => {
    const tb = await reports.trialBalance(env.seed.companyId, 2026);
    const byCode = Object.fromEntries(tb.rows.map((r) => [r.accountCode, r]));
    expect(byCode['4110']).toBeUndefined(); // revenue net zero → omitted
    expect(byCode['5000']).toBeUndefined(); // expense net zero → omitted
    expect(byCode['3300']?.credit).toBe(700); // retained earnings carries the result
    expect(tb.totals.balanced).toBe(true);
  });

  it('post-closing balance sheet shows retained earnings and zero current-period earnings', async () => {
    const bs = await reports.balanceSheet(env.seed.companyId, 2026);
    const eq = Object.fromEntries(bs.equity.map((r) => [r.accountCode, r.amount]));
    expect(eq['3300']).toBe(700); // retained earnings
    expect(eq['3310']).toBe(0); // synthetic current-period earnings now zero
    expect(bs.totals.balanced).toBe(true);
  });

  it('refuses to close an already-closed year', async () => {
    await expect(closing.close(env.seed.companyId, env.seed.userId, 2026)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reopen voids the closing entry and restores the nominal accounts', async () => {
    await closing.reopen(env.seed.companyId, env.seed.userId, 2026, 'แก้ไขรายการ');
    const s = await closing.status(env.seed.companyId, 2026);
    expect(s.closed).toBe(false);

    // Nominal accounts are back on the trial balance.
    const tb = await reports.trialBalance(env.seed.companyId, 2026);
    const byCode = Object.fromEntries(tb.rows.map((r) => [r.accountCode, r]));
    expect(byCode['4110']?.credit).toBe(1000);
    expect(byCode['5000']?.debit).toBe(300);
    expect(byCode['3300']).toBeUndefined(); // retained earnings back to zero
  });
});
