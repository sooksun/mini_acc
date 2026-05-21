import { ConflictException, NotFoundException } from '@nestjs/common';
import { BankService } from './bank.service';
import { PaymentsService } from '../payments/payments.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('BankService (integration)', () => {
  let env: TestEnv;
  let service: BankService;
  let payments: PaymentsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(BankService);
    payments = env.app.get(PaymentsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  async function vendor(taxId: string) {
    return env.prisma.partner.create({
      data: {
        companyId: env.seed.companyId,
        type: 'VENDOR',
        nameTh: `ผู้ขาย-${taxId.slice(-4)}`,
        taxId,
      },
    });
  }

  describe('importStatement', () => {
    it('auto-matches a line to a same-day payment (confidence 1.00)', async () => {
      const v = await vendor('0000000080001');
      const payment = await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-08-10',
        amount: '1500',
      });

      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          {
            postedAt: '2026-08-10',
            side: 'DEBIT',
            amount: '1500',
            description: 'Vendor payment',
          },
        ],
      });
      expect(result.imported).toBe(1);
      expect(result.autoMatched).toBe(1);

      const lines = await env.prisma.bankStatementLine.findMany({
        where: { importBatchId: result.importBatchId },
      });
      expect(lines[0]!.matchedPaymentId).toBe(payment.id);
      expect(lines[0]!.matchConfidence?.toString()).toBe('1');
    });

    it('matches within 2-day window with confidence 0.90', async () => {
      const v = await vendor('0000000080002');
      const payment = await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-08-15',
        amount: '2500',
      });

      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          {
            postedAt: '2026-08-17',
            side: 'DEBIT',
            amount: '2500',
            description: '2-day delay',
          },
        ],
      });
      expect(result.autoMatched).toBe(1);
      const lines = await env.prisma.bankStatementLine.findMany({
        where: { importBatchId: result.importBatchId },
      });
      expect(lines[0]!.matchedPaymentId).toBe(payment.id);
      expect(lines[0]!.matchConfidence?.toString()).toBe('0.9');
    });

    it('matches a payment using cash amount (gross − WHT) when bank shows net', async () => {
      const v = await vendor('0000000080003');
      const payment = await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-08-20',
        amount: '1000',
        whtAmount: '30', // → cash out = 970
      });
      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          { postedAt: '2026-08-20', side: 'DEBIT', amount: '970', description: 'net of WHT' },
        ],
      });
      expect(result.autoMatched).toBe(1);
      const lines = await env.prisma.bankStatementLine.findMany({
        where: { importBatchId: result.importBatchId },
      });
      expect(lines[0]!.matchedPaymentId).toBe(payment.id);
    });

    it('leaves line unmatched when no payment fits date window', async () => {
      const v = await vendor('0000000080004');
      await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-09-01',
        amount: '5000',
      });
      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          { postedAt: '2026-09-30', side: 'DEBIT', amount: '5000', description: 'far out of window' },
        ],
      });
      expect(result.autoMatched).toBe(0);
      expect(result.unmatched).toBe(1);
    });

    it('does not match same payment twice in one batch', async () => {
      const v = await vendor('0000000080005');
      await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-10-05',
        amount: '777',
      });
      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          { postedAt: '2026-10-05', side: 'DEBIT', amount: '777', description: 'first try' },
          { postedAt: '2026-10-06', side: 'DEBIT', amount: '777', description: 'duplicate amount' },
        ],
      });
      // Only one of the two lines should match; the other stays unmatched
      expect(result.autoMatched).toBe(1);
      expect(result.unmatched).toBe(1);
    });
  });

  describe('manual match / unmatch', () => {
    it('manualMatch sets confidence 1.0 and links the payment', async () => {
      const v = await vendor('0000000080006');
      const payment = await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-11-01',
        amount: '999',
      });
      // Import an unmatched line (different amount on purpose)
      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          { postedAt: '2026-11-01', side: 'DEBIT', amount: '999.50', description: 'fuzzy' },
        ],
      });
      expect(result.autoMatched).toBe(0);
      const line = await env.prisma.bankStatementLine.findFirst({
        where: { importBatchId: result.importBatchId },
      });
      const matched = await service.matchLine(
        env.seed.companyId,
        env.seed.userId,
        line!.id,
        payment.id,
      );
      expect(matched.matchedPaymentId).toBe(payment.id);
      expect(matched.matchConfidence).toBe('1');
    });

    it('refuses to match a line twice', async () => {
      const v = await vendor('0000000080007');
      const payment = await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-11-10',
        amount: '600',
      });
      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          { postedAt: '2026-11-10', side: 'DEBIT', amount: '600', description: 'auto-match candidate' },
        ],
      });
      const line = await env.prisma.bankStatementLine.findFirst({
        where: { importBatchId: result.importBatchId },
      });
      await expect(
        service.matchLine(env.seed.companyId, env.seed.userId, line!.id, payment.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('unmatch frees the line + makes payment available for re-match', async () => {
      const v = await vendor('0000000080008');
      const payment = await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2026-12-01',
        amount: '888',
      });
      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          { postedAt: '2026-12-01', side: 'DEBIT', amount: '888', description: 'auto-matched' },
        ],
      });
      const line = await env.prisma.bankStatementLine.findFirst({
        where: { importBatchId: result.importBatchId },
      });
      const unmatched = await service.unmatchLine(env.seed.companyId, line!.id);
      expect(unmatched.matchedPaymentId).toBeNull();
      expect(unmatched.matchConfidence).toBeNull();
      // Re-match should now succeed
      const rematched = await service.matchLine(
        env.seed.companyId,
        env.seed.userId,
        line!.id,
        payment.id,
      );
      expect(rematched.matchedPaymentId).toBe(payment.id);
    });
  });

  describe('candidatesForLine', () => {
    it('returns payments within window, ranked by amount + date proximity', async () => {
      const v = await vendor('0000000080009');
      await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: v.id,
        paymentDate: '2027-01-15',
        amount: '1234',
      });
      const result = await service.importStatement(env.seed.companyId, env.seed.userId, {
        bankAccount: 'SCB-001',
        lines: [
          { postedAt: '2027-01-20', side: 'DEBIT', amount: '1234.56', description: 'pick me' },
        ],
      });
      const line = await env.prisma.bankStatementLine.findFirst({
        where: { importBatchId: result.importBatchId },
      });
      const candidates = await service.candidatesForLine(env.seed.companyId, line!.id);
      expect(candidates.length).toBeGreaterThan(0);
      // The candidate response should include enough info for UX
      const c = candidates[0]!;
      expect(typeof c.amountMatch).toBe('boolean');
      expect(typeof c.daysOff).toBe('number');
    });
  });

  describe('importCsv', () => {
    it('parses a side+amount CSV (with Buddhist date) into lines', async () => {
      const csv = [
        'date,side,amount,description,reference',
        '10/09/2569,CREDIT,"2,500.00",เงินเข้าจากลูกค้า,INV-1',
        '2026-09-11,DEBIT,800,ค่าบริการ,',
      ].join('\n');
      const result = await service.importCsv(
        env.seed.companyId,
        env.seed.userId,
        'KBANK-CSV',
        Buffer.from(csv, 'utf8'),
      );
      expect(result.imported).toBe(2);

      const lines = await env.prisma.bankStatementLine.findMany({
        where: { companyId: env.seed.companyId, bankAccount: 'KBANK-CSV' },
        orderBy: { postedAt: 'asc' },
      });
      expect(lines).toHaveLength(2);
      // Buddhist 2569 → Gregorian 2026, comma-stripped amount
      expect(lines[0]!.postedAt.toISOString().slice(0, 10)).toBe('2026-09-10');
      expect(lines[0]!.side).toBe('CREDIT');
      expect(lines[0]!.amount.toString()).toBe('2500');
    });

    it('derives side from debit/credit (ถอน/ฝาก) columns', async () => {
      const csv = [
        'วันที่,ถอน,ฝาก,รายละเอียด',
        '2026-09-15,1000,,ถอนเงินสด',
        '2026-09-16,,3000,รับโอน',
      ].join('\n');
      const result = await service.importCsv(
        env.seed.companyId,
        env.seed.userId,
        'BBL-CSV',
        Buffer.from(csv, 'utf8'),
      );
      expect(result.imported).toBe(2);
      const lines = await env.prisma.bankStatementLine.findMany({
        where: { companyId: env.seed.companyId, bankAccount: 'BBL-CSV' },
        orderBy: { postedAt: 'asc' },
      });
      expect(lines.map((l) => l.side)).toEqual(['DEBIT', 'CREDIT']);
      expect(lines[1]!.amount.toString()).toBe('3000');
    });

    it('rejects a CSV missing required columns', async () => {
      await expect(
        service.importCsv(
          env.seed.companyId,
          env.seed.userId,
          'X',
          Buffer.from('foo,bar\n1,2', 'utf8'),
        ),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'BAD_HEADER' }) });
    });
  });
});
