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
});
