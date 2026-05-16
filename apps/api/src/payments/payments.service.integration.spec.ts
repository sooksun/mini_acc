import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('PaymentsService (integration)', () => {
  let env: TestEnv;
  let service: PaymentsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(PaymentsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  async function makeVendor(taxId = '0000000099991') {
    return env.prisma.partner.create({
      data: {
        companyId: env.seed.companyId,
        type: 'VENDOR',
        nameTh: 'ผู้ขายทดสอบ-Payment',
        taxId,
      },
    });
  }

  describe('create — basic', () => {
    it('OUT payment without WHT creates payment + journal, no WHT record', async () => {
      const vendor = await makeVendor('0000000099001');
      const payment = await service.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: vendor.id,
        paymentDate: '2026-05-10',
        amount: '1000',
        reference: 'PV-001',
      });
      expect(payment.direction).toBe('OUT');
      expect(payment.amount).toBe('1000');
      expect(payment.whtAmount).toBe('0');
      expect(payment.whtRecord).toBeNull();

      const journals = await env.prisma.journalEntry.findMany({
        where: { sourceType: 'PAYMENT', sourceId: payment.id },
        include: { lines: true },
      });
      expect(journals).toHaveLength(1);
      expect(journals[0]!.lines).toHaveLength(2);
      expect(journals[0]!.totalDebit.toString()).toBe('1000');
      expect(journals[0]!.totalCredit.toString()).toBe('1000');
    });

    it('OUT payment with WHT > 0 creates WHT record (PAYABLE) + 3-line journal', async () => {
      const vendor = await makeVendor('0000000099002');
      const payment = await service.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: vendor.id,
        paymentDate: '2026-05-10',
        amount: '1000',
        whtAmount: '30',
        whtCertNumber: 'CERT-001',
        whtCategory: '40(2)',
      });
      expect(payment.whtRecord).not.toBeNull();
      expect(payment.whtRecord!.recordType).toBe('PAYABLE');
      expect(payment.whtRecord!.whtAmount).toBe('30');
      expect(payment.whtRecord!.partnerName).toBe(vendor.nameTh);
      expect(payment.whtRecord!.partnerTaxId).toBe(vendor.taxId);

      const journals = await env.prisma.journalEntry.findMany({
        where: { sourceType: 'PAYMENT', sourceId: payment.id },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      const lines = journals[0]!.lines;
      expect(lines).toHaveLength(3);
      // Dr AP 1000, Cr Cash 970, Cr WHT Payable 30
      expect(lines[0]!.debit.toString()).toBe('1000');
      expect(lines[1]!.credit.toString()).toBe('970');
      expect(lines[2]!.credit.toString()).toBe('30');
      expect(journals[0]!.totalDebit.equals(journals[0]!.totalCredit)).toBe(true);
    });

    it('IN payment with WHT creates WHT record (RECEIVABLE)', async () => {
      const customer = await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'CUSTOMER',
          nameTh: 'ลูกค้าทดสอบ-Payment',
          taxId: '0000000099003',
        },
      });
      const payment = await service.create(env.seed.companyId, env.seed.userId, {
        direction: 'IN',
        partnerId: customer.id,
        paymentDate: '2026-05-10',
        amount: '10000',
        whtAmount: '300',
      });
      expect(payment.whtRecord!.recordType).toBe('RECEIVABLE');
      const journals = await env.prisma.journalEntry.findMany({
        where: { sourceType: 'PAYMENT', sourceId: payment.id },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      const lines = journals[0]!.lines;
      // Dr Cash 9700, Dr WHT Receivable 300, Cr AR 10000
      expect(lines[0]!.debit.toString()).toBe('9700');
      expect(lines[1]!.debit.toString()).toBe('300');
      expect(lines[2]!.credit.toString()).toBe('10000');
    });
  });

  describe('create — guards', () => {
    it('refuses amount = 0', async () => {
      const vendor = await makeVendor('0000000099101');
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          direction: 'OUT',
          partnerId: vendor.id,
          paymentDate: '2026-05-10',
          amount: '0',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses whtAmount ≥ amount', async () => {
      const vendor = await makeVendor('0000000099102');
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          direction: 'OUT',
          partnerId: vendor.id,
          paymentDate: '2026-05-10',
          amount: '100',
          whtAmount: '100',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'WHT_EXCEEDS_AMOUNT' }),
      });
    });

    it('refuses unknown partner', async () => {
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          direction: 'OUT',
          partnerId: 'no-such-partner',
          paymentDate: '2026-05-10',
          amount: '100',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('void', () => {
    it('OWNER can void; also voids the linked journal', async () => {
      const vendor = await makeVendor('0000000099201');
      const payment = await service.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: vendor.id,
        paymentDate: '2026-05-10',
        amount: '500',
      });
      await service.voidPayment(env.seed.companyId, env.seed.userId, 'OWNER', payment.id, {
        reason: 'wrong amount',
      });
      const journal = await env.prisma.journalEntry.findFirst({
        where: { sourceType: 'PAYMENT', sourceId: payment.id },
      });
      expect(journal!.status).toBe('VOIDED');
      expect(journal!.voidReason).toContain('wrong amount');
    });

    it('ADMIN cannot void', async () => {
      const vendor = await makeVendor('0000000099202');
      const payment = await service.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: vendor.id,
        paymentDate: '2026-05-10',
        amount: '500',
      });
      await expect(
        service.voidPayment(env.seed.companyId, env.seed.userId, 'ADMIN', payment.id, {
          reason: 'try',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROLE_NOT_ALLOWED' }),
      });
    });

    it('double void → 409', async () => {
      const vendor = await makeVendor('0000000099203');
      const payment = await service.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: vendor.id,
        paymentDate: '2026-05-10',
        amount: '500',
      });
      await service.voidPayment(env.seed.companyId, env.seed.userId, 'OWNER', payment.id, {
        reason: 'first',
      });
      await expect(
        service.voidPayment(env.seed.companyId, env.seed.userId, 'OWNER', payment.id, {
          reason: 'second',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
