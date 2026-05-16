import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JournalService } from './journal.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('JournalService (integration)', () => {
  let env: TestEnv;
  let service: JournalService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(JournalService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  describe('post — Dr = Cr enforcement', () => {
    it('posts a balanced entry and stores totalDebit = totalCredit', async () => {
      const entry = await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-10',
        description: 'test balanced',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'ค่าใช้จ่ายทดสอบ', debit: '100' },
          { accountCode: '1110', accountName: 'เงินสด', credit: '100' },
        ],
      });
      expect(entry.totalDebit.toString()).toBe('100');
      expect(entry.totalCredit.toString()).toBe('100');
      expect(entry.status).toBe('POSTED');
      expect(entry.lines).toHaveLength(2);
    });

    it('throws JOURNAL_UNBALANCED when Dr ≠ Cr', async () => {
      await expect(
        service.post({
          companyId: env.seed.companyId,
          userId: env.seed.userId,
          entryDate: '2026-05-10',
          description: 'unbalanced',
          sourceType: 'MANUAL',
          lines: [
            { accountCode: '5000', accountName: 'ค่าใช้จ่าย', debit: '100' },
            { accountCode: '1110', accountName: 'เงินสด', credit: '99' },
          ],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'JOURNAL_UNBALANCED' }),
      });
    });

    it('refuses lines with both sides zero (no economic effect)', async () => {
      await expect(
        service.post({
          companyId: env.seed.companyId,
          userId: env.seed.userId,
          entryDate: '2026-05-10',
          description: 'zero',
          sourceType: 'MANUAL',
          lines: [
            { accountCode: '5000', accountName: 'a', debit: '0' },
            { accountCode: '1110', accountName: 'b', credit: '0' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a line with both sides non-zero', async () => {
      await expect(
        service.post({
          companyId: env.seed.companyId,
          userId: env.seed.userId,
          entryDate: '2026-05-10',
          description: 'mixed line',
          sourceType: 'MANUAL',
          lines: [
            { accountCode: '5000', accountName: 'a', debit: '50', credit: '50' },
            { accountCode: '1110', accountName: 'b', credit: '50' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('balances at decimal precision (0.01 + 99.99 = 100.00)', async () => {
      const entry = await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-10',
        description: 'cents',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'a', debit: '0.01' },
          { accountCode: '5001', accountName: 'b', debit: '99.99' },
          { accountCode: '1110', accountName: 'c', credit: '100' },
        ],
      });
      expect(entry.totalDebit.equals(new Prisma.Decimal('100'))).toBe(true);
    });

    it('periodYear/periodMonth derived from entryDate', async () => {
      const entry = await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-03-15T12:00:00Z',
        description: 'period test',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'a', debit: '50' },
          { accountCode: '1110', accountName: 'b', credit: '50' },
        ],
      });
      expect(entry.periodYear).toBe(2026);
      expect(entry.periodMonth).toBe(3);
    });
  });

  describe('void', () => {
    it('flips status to VOIDED and records reason', async () => {
      const entry = await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-10',
        description: 'to be voided',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'a', debit: '50' },
          { accountCode: '1110', accountName: 'b', credit: '50' },
        ],
      });
      const voided = await service.voidEntry(
        env.seed.companyId,
        entry.id,
        env.seed.userId,
        'misposted',
      );
      expect(voided.status).toBe('VOIDED');
      expect(voided.voidReason).toBe('misposted');
      expect(voided.voidedAt).not.toBeNull();
    });

    it('refuses void without reason', async () => {
      const entry = await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-10',
        description: 'reasonless',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'a', debit: '50' },
          { accountCode: '1110', accountName: 'b', credit: '50' },
        ],
      });
      await expect(
        service.voidEntry(env.seed.companyId, entry.id, env.seed.userId, '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses double void', async () => {
      const entry = await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-10',
        description: 'dup void',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'a', debit: '50' },
          { accountCode: '1110', accountName: 'b', credit: '50' },
        ],
      });
      await service.voidEntry(env.seed.companyId, entry.id, env.seed.userId, 'first');
      await expect(
        service.voidEntry(env.seed.companyId, entry.id, env.seed.userId, 'second'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses void for entry from another company', async () => {
      const entry = await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-10',
        description: 'cross-tenant',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'a', debit: '50' },
          { accountCode: '1110', accountName: 'b', credit: '50' },
        ],
      });
      await expect(
        service.voidEntry('different-company', entry.id, env.seed.userId, 'r'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('filters by sourceType + sourceId', async () => {
      const sourceId = 'src-x-' + Date.now();
      await service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-10',
        description: 'list test',
        sourceType: 'EXPENSE_RECORD',
        sourceId,
        lines: [
          { accountCode: '5000', accountName: 'a', debit: '50' },
          { accountCode: '1110', accountName: 'b', credit: '50' },
        ],
      });
      const result = await service.list(env.seed.companyId, {
        sourceType: 'EXPENSE_RECORD',
        sourceId,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.sourceId).toBe(sourceId);
    });
  });
});
