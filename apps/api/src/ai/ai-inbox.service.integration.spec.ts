import { BadRequestException, ConflictException } from '@nestjs/common';
import { AiInboxService } from './ai-inbox.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7

function fakePdf(name = 'receipt.pdf', salt = `${Math.random()}`) {
  const body = Buffer.concat([PDF_MAGIC, Buffer.from(`-${salt}`)]);
  return {
    originalname: name,
    mimetype: 'application/pdf',
    size: body.length,
    buffer: body,
  };
}

describe('AiInboxService (integration)', () => {
  let env: TestEnv;
  let service: AiInboxService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(AiInboxService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  describe('upload', () => {
    it('creates a PENDING AiSuggestion + extracts category from filename hint', async () => {
      const suggestion = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        fakePdf('Adobe-software-subscription.pdf'),
      );
      expect(suggestion.status).toBe('PENDING');
      expect(suggestion.type).toBe('DOCUMENT_EXTRACT');
      // Mock extractor maps "software/saas/subscription" → ค่าซอฟต์แวร์
      const payload = suggestion.payload as Record<string, unknown>;
      expect(payload.category).toBe('ค่าซอฟต์แวร์');
      // Low confidence because we have no API key
      expect(Number(suggestion.confidence ?? 0)).toBeLessThan(0.5);
      // File metadata captured
      expect(payload.originalFileName).toBe('Adobe-software-subscription.pdf');
      expect(payload.storedPath).toMatch(/ai-inbox/);
    });

    it('rejects file with content not matching any known magic', async () => {
      await expect(
        service.upload(env.seed.companyId, env.seed.userId, {
          originalname: 'fake.pdf',
          mimetype: 'application/pdf',
          size: 10,
          buffer: Buffer.from('not a real pdf'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects MIME mismatch (claim PDF but bytes are JPEG)', async () => {
      await expect(
        service.upload(env.seed.companyId, env.seed.userId, {
          originalname: 'liar.pdf',
          mimetype: 'application/pdf',
          size: 3,
          buffer: Buffer.from([0xff, 0xd8, 0xff]),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'MIME_MISMATCH' }),
      });
    });
  });

  describe('accept', () => {
    it('materializes into ExpenseReceipt with operator overrides applied', async () => {
      const vendor = await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VENDOR',
          nameTh: 'ผู้ขาย AI test',
          taxId: '0000001234567',
        },
      });
      const suggestion = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        fakePdf('test.pdf', 'accept-1'),
      );
      const result = await service.accept(env.seed.companyId, env.seed.userId, suggestion.id, {
        vendorTaxId: vendor.taxId!,
        subtotal: '1000',
        vatAmount: '70',
        withholdingTaxAmount: '0',
        grandTotal: '1070',
        paidAt: '2026-05-10',
      });
      expect(result.suggestion.status).toBe('ACCEPTED');
      expect(result.suggestion.sourceType).toBe('EXPENSE_RECEIPT');
      expect(result.suggestion.sourceId).toBe(result.receipt.id);
      expect(result.receipt.vendorId).toBe(vendor.id);
    });

    it('refuses double accept', async () => {
      const vendor = await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VENDOR',
          nameTh: 'ผู้ขาย AI test 2',
          taxId: '0000002345678',
        },
      });
      const suggestion = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        fakePdf('test2.pdf', 'accept-2'),
      );
      await service.accept(env.seed.companyId, env.seed.userId, suggestion.id, {
        vendorTaxId: vendor.taxId!,
        subtotal: '500',
        vatAmount: '35',
        withholdingTaxAmount: '0',
        grandTotal: '535',
        paidAt: '2026-05-10',
      });
      await expect(
        service.accept(env.seed.companyId, env.seed.userId, suggestion.id, {
          vendorTaxId: vendor.taxId!,
          subtotal: '500',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject', () => {
    it('marks REJECTED + deletes staged file', async () => {
      const suggestion = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        fakePdf('reject.pdf', 'reject-1'),
      );
      const rejected = await service.reject(env.seed.companyId, env.seed.userId, suggestion.id, {
        reason: 'not a receipt',
      });
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('not a receipt');
      // Staged file should no longer be readable
      await expect(
        service.readStagedFile(env.seed.companyId, suggestion.id),
      ).rejects.toThrow();
    });

    it('refuses to reject an already-rejected suggestion', async () => {
      const suggestion = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        fakePdf('reject2.pdf', 'reject-2'),
      );
      await service.reject(env.seed.companyId, env.seed.userId, suggestion.id, {});
      await expect(
        service.reject(env.seed.companyId, env.seed.userId, suggestion.id, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
