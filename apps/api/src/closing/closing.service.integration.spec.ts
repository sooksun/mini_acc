import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { ClosingService } from './closing.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('ClosingService (integration)', () => {
  let env: TestEnv;
  let service: ClosingService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(ClosingService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  describe('checkPeriod', () => {
    it('reports OPEN status + canClose=true for an empty period', async () => {
      const result = await service.checkPeriod(env.seed.companyId, 2026, 8);
      expect(result.status).toBe('OPEN');
      expect(result.canClose).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.summary.salesCount).toBe(0);
      expect(result.summary.expenseCount).toBe(0);
    });

    it('blocks close when a DRAFT sales document exists in the period', async () => {
      await env.prisma.salesDocument.create({
        data: {
          companyId: env.seed.companyId,
          type: 'QUOTATION',
          number: 'DRAFT-CLOSE-1',
          beYear: 2569,
          status: 'DRAFT',
          customerId: env.seed.customerId,
          documentDate: new Date('2026-09-10'),
          customerSnapshotName: 'ลูกค้าทดสอบ',
          subtotal: '0',
          vatRate: '7',
          vatAmount: '0',
          totalAfterVat: '0',
          whtRate: '0',
          whtAmount: '0',
          grandTotal: '0',
          netReceived: '0',
        },
      });
      const result = await service.checkPeriod(env.seed.companyId, 2026, 9);
      expect(result.canClose).toBe(false);
      expect(result.blockers.some((b) => b.code === 'DRAFT_SALES_DOCS')).toBe(true);
    });

    it('blocks close when a CRITICAL risk is open', async () => {
      await env.prisma.riskItem.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VAT_RISK',
          level: 'CRITICAL',
          status: 'OPEN',
          title: 'manual critical risk for close test',
        },
      });
      const result = await service.checkPeriod(env.seed.companyId, 2026, 8);
      expect(result.canClose).toBe(false);
      expect(result.blockers.some((b) => b.code === 'CRITICAL_RISK_OPEN')).toBe(true);
    });
  });

  describe('closePeriod', () => {
    it('refuses when role is not OWNER/ACCOUNTANT', async () => {
      await expect(
        service.closePeriod(env.seed.companyId, env.seed.userId, 'ADMIN', {
          year: 2026,
          month: 10,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROLE_NOT_ALLOWED' }),
      });
    });

    it('refuses when checkPeriod reports blockers', async () => {
      // Period 9 already has a DRAFT_SALES_DOCS blocker from earlier test
      await expect(
        service.closePeriod(env.seed.companyId, env.seed.userId, 'OWNER', {
          year: 2026,
          month: 9,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERIOD_HAS_BLOCKERS' }),
      });
    });

    it('locks the period when all checks pass', async () => {
      // Resolve the critical risk first so period 8 is clean
      const risks = await env.prisma.riskItem.findMany({
        where: { companyId: env.seed.companyId, status: 'OPEN' },
      });
      await env.prisma.riskItem.updateMany({
        where: { id: { in: risks.map((r) => r.id) } },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });

      const period = await service.closePeriod(env.seed.companyId, env.seed.userId, 'OWNER', {
        year: 2026,
        month: 8,
        note: 'close test',
      });
      expect(period.status).toBe('LOCKED');
      expect(period.closedBy).toBe(env.seed.userId);
      expect(period.lockedAt).not.toBeNull();
    });
  });

  describe('reopenPeriod', () => {
    it('refuses when role is not OWNER', async () => {
      await expect(
        service.reopenPeriod(env.seed.companyId, env.seed.userId, 'ACCOUNTANT', {
          year: 2026,
          month: 8,
          reason: 'fix',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROLE_NOT_ALLOWED' }),
      });
    });

    it('OWNER can reopen a LOCKED period', async () => {
      const period = await service.reopenPeriod(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        { year: 2026, month: 8, reason: 'correction needed' },
      );
      expect(period.status).toBe('REOPENED');
      expect(period.note).toBe('correction needed');
    });
  });

  describe('H2: document locking + extra hard-blocks', () => {
    it('close() locks confirmed sales documents in the period (§15.4)', async () => {
      const doc = await env.prisma.salesDocument.create({
        data: {
          companyId: env.seed.companyId,
          type: 'INVOICE',
          number: 'INV-2569-9101',
          beYear: 2569,
          status: 'USER_CONFIRMED',
          customerId: env.seed.customerId,
          documentDate: new Date(Date.UTC(2026, 10, 10)), // month 11
          customerSnapshotName: 'ลูกค้าทดสอบ',
          subtotal: '1000',
          vatRate: '7',
          vatAmount: '70',
          totalAfterVat: '1070',
          whtRate: '0',
          whtAmount: '0',
          grandTotal: '1070',
          netReceived: '1070',
          confirmedAt: new Date(),
          confirmedBy: env.seed.userId,
        },
      });

      const period = await service.closePeriod(env.seed.companyId, env.seed.userId, 'OWNER', {
        year: 2026,
        month: 11,
      });
      expect(period.status).toBe('LOCKED');

      const after = await env.prisma.salesDocument.findUniqueOrThrow({ where: { id: doc.id } });
      expect(after.status).toBe('LOCKED');
      expect(after.lockedBy).toBe(env.seed.userId);
      expect(after.lockedAt).not.toBeNull();
    });

    it('blocks close on unmatched bank lines in the period', async () => {
      await env.prisma.bankStatementLine.create({
        data: {
          companyId: env.seed.companyId,
          bankAccount: 'KBANK-001',
          postedAt: new Date(Date.UTC(2026, 11, 10)), // month 12
          side: 'CREDIT',
          amount: '500',
          description: 'เงินเข้าไม่ทราบที่มา',
        },
      });
      const result = await service.checkPeriod(env.seed.companyId, 2026, 12);
      expect(result.blockers.some((b) => b.code === 'UNMATCHED_BANK')).toBe(true);
    });

    it('blocks close when invoice was paid but no receipt issued (INVOICE_RECEIVED_NO_RECEIPT)', async () => {
      const invoice = await env.prisma.salesDocument.create({
        data: {
          companyId: env.seed.companyId,
          type: 'INVOICE',
          number: 'INV-2569-9901',
          beYear: 2569,
          status: 'USER_CONFIRMED',
          customerId: env.seed.customerId,
          documentDate: new Date(Date.UTC(2026, 2, 15)), // month 3
          customerSnapshotName: 'ลูกค้าทดสอบ',
          subtotal: '1000',
          vatRate: '7',
          vatAmount: '70',
          totalAfterVat: '1070',
          whtRate: '0',
          whtAmount: '0',
          grandTotal: '1070',
          netReceived: '1070',
          confirmedAt: new Date(),
          confirmedBy: env.seed.userId,
        },
      });
      await env.prisma.payment.create({
        data: {
          companyId: env.seed.companyId,
          direction: 'IN',
          partnerId: env.seed.customerId,
          paymentDate: new Date(Date.UTC(2026, 2, 20)),
          amount: '1070',
          whtAmount: '0',
          method: 'BANK_TRANSFER',
          status: 'COMPLETED',
          sourceType: 'SALES_DOCUMENT',
          sourceId: invoice.id,
          recordedBy: env.seed.userId,
        },
      });

      const result = await service.checkPeriod(env.seed.companyId, 2026, 3);
      expect(result.canClose).toBe(false);
      expect(result.blockers.some((b) => b.code === 'INVOICE_RECEIVED_NO_RECEIPT')).toBe(true);
    });

    it('blocks close on negative stock (company-wide)', async () => {
      const good = await env.prisma.product.create({
        data: {
          companyId: env.seed.companyId,
          type: 'GOOD',
          nameTh: 'สินค้าทดสอบสต็อก',
          unit: 'ชิ้น',
          unitPrice: '100',
          vatable: true,
        },
      });
      // Insert an OUT directly (bypassing the service guard) to force negative.
      await env.prisma.inventoryMovement.create({
        data: {
          companyId: env.seed.companyId,
          productId: good.id,
          type: 'OUT',
          quantity: '5',
          movementDate: new Date(Date.UTC(2026, 0, 5)),
        },
      });
      const result = await service.checkPeriod(env.seed.companyId, 2026, 1);
      expect(result.blockers.some((b) => b.code === 'STOCK_NEGATIVE')).toBe(true);
    });
  });
});
