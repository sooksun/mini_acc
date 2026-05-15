import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExpenseReceiptsService } from './expense-receipts.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function fakePdf(name = 'receipt.pdf', salt = `${Math.random()}`) {
  const body = Buffer.concat([PDF_MAGIC, Buffer.from(`-${salt}`)]);
  return {
    originalname: name,
    mimetype: 'application/pdf',
    size: body.length,
    buffer: body,
  };
}

describe('ExpenseReceiptsService (integration)', () => {
  let env: TestEnv;
  let service: ExpenseReceiptsService;
  let testRoot: string;

  beforeAll(async () => {
    testRoot = join(process.cwd(), 'var', 'test-attachments');
    process.env.ATTACHMENT_DIR = testRoot;
    env = await bootstrapTestEnv();
    service = env.app.get(ExpenseReceiptsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  async function makeVendor(name = 'ผู้ขายทดสอบ', taxId = '0000000001111') {
    return env.prisma.partner.create({
      data: {
        companyId: env.seed.companyId,
        type: 'VENDOR',
        nameTh: name,
        taxId,
        address: 'ที่อยู่ผู้ขาย',
      },
    });
  }

  describe('upload — H1 magic byte enforcement', () => {
    it('rejects file whose content does not match any known magic', async () => {
      await expect(
        service.upload(
          env.seed.companyId,
          env.seed.userId,
          {},
          {
            originalname: 'fake.pdf',
            mimetype: 'application/pdf',
            size: 30,
            buffer: Buffer.from('this is just ascii text, not a pdf'),
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when claimed mime disagrees with detected (PDF body labeled as JPEG)', async () => {
      await expect(
        service.upload(
          env.seed.companyId,
          env.seed.userId,
          {},
          {
            originalname: 'liar.jpg',
            mimetype: 'image/jpeg',
            size: PDF_MAGIC.length,
            buffer: PDF_MAGIC,
          },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'MIME_MISMATCH' }),
      });
    });

    it('accepts a JPEG when claimed and detected agree', async () => {
      const jpegBody = Buffer.concat([JPEG_MAGIC, Buffer.from('jpeg-payload')]);
      const result = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {},
        {
          originalname: 'real.jpg',
          mimetype: 'image/jpeg',
          size: jpegBody.length,
          buffer: jpegBody,
        },
      );
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.status).toBe('UPLOADED');
    });
  });

  describe('upload — H6 sha256 dedup', () => {
    it('first upload creates receipt; second identical upload throws CONFLICT', async () => {
      const file = fakePdf('dup.pdf', 'identical-bytes-1');
      const first = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorName: 'ผู้ขายไม่เคยมี' },
        file,
      );
      expect(first.status).toBe('PENDING_VENDOR_APPROVAL');

      await expect(
        service.upload(
          env.seed.companyId,
          env.seed.userId,
          { vendorName: 'ผู้ขายไม่เคยมี' },
          fakePdf('renamed.pdf', 'identical-bytes-1'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('upload with matching vendor by taxId → READY_TO_ACCOUNT', async () => {
      const vendor = await makeVendor('ผู้ขายที่มี taxId', '0000000002222');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorTaxId: vendor.taxId!, subtotal: '100', grandTotal: '107' },
        fakePdf('match.pdf', 'unique-1'),
      );
      expect(receipt.status).toBe('READY_TO_ACCOUNT');
      expect(receipt.vendorId).toBe(vendor.id);
    });
  });

  describe('state machine — C3 transitions', () => {
    it('ACCOUNTED → reject() is rejected with InvalidExpenseTransitionError (422)', async () => {
      const vendor = await makeVendor('ผู้ขาย accounted', '0000000003333');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '100',
          vatAmount: '7',
          grandTotal: '107',
          paidAt: '2026-05-01T00:00:00+07:00',
        },
        fakePdf('acc.pdf', 'tx-acc-1'),
      );
      await service.account(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id);

      await expect(
        service.reject(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id, {
          reason: 'late reject',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('REJECTED is terminal — cannot account', async () => {
      const vendor = await makeVendor('ผู้ขาย rejected', '0000000004444');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorTaxId: vendor.taxId!, grandTotal: '50', paidAt: '2026-05-01' },
        fakePdf('rej.pdf', 'tx-rej-1'),
      );
      await service.reject(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id, {
        reason: 'ไม่ใช่ของบริษัท',
      });

      await expect(
        service.account(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('VIEWER cannot account (role guard at service level)', async () => {
      const vendor = await makeVendor('ผู้ขาย viewer', '0000000005555');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorTaxId: vendor.taxId!, grandTotal: '50', paidAt: '2026-05-01' },
        fakePdf('view.pdf', 'tx-view-1'),
      );

      await expect(
        service.account(env.seed.companyId, env.seed.userId, 'VIEWER', receipt.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reject without reason → 422', async () => {
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorName: 'ใครก็ไม่รู้' },
        fakePdf('nr.pdf', 'tx-nr-1'),
      );

      await expect(
        service.reject(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id, { reason: '   ' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('account() — H4 amount + date guards', () => {
    it('refuses zero grandTotal', async () => {
      const vendor = await makeVendor('ผู้ขายยอด 0', '0000000006666');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorTaxId: vendor.taxId!, paidAt: '2026-05-01' },
        fakePdf('zero.pdf', 'tx-zero-1'),
      );

      await expect(
        service.account(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXPENSE_AMOUNT_REQUIRED' }),
      });
    });

    it('refuses when both paidAt and documentDate are null', async () => {
      const vendor = await makeVendor('ผู้ขายไม่มีวัน', '0000000007777');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorTaxId: vendor.taxId!, grandTotal: '107' },
        fakePdf('nodate.pdf', 'tx-nd-1'),
      );

      await expect(
        service.account(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXPENSE_DATE_REQUIRED' }),
      });
    });

    it('accepts when documentDate is set even without paidAt', async () => {
      const vendor = await makeVendor('ผู้ขายมีแค่วันเอกสาร', '0000000008888');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          // amounts must reconcile (H3): subtotal + vat − wht = grandTotal
          subtotal: '321',
          vatAmount: '0',
          withholdingTaxAmount: '0',
          grandTotal: '321',
          documentDate: '2026-04-15T00:00:00+07:00',
        },
        fakePdf('docdate.pdf', 'tx-doc-1'),
      );

      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      expect(accounted.status).toBe('ACCOUNTED');
      expect(accounted.expenseRecord?.grandTotal).toBe('321');
    });
  });

  describe('account() — H3 amount consistency', () => {
    it('refuses when subtotal + vat − wht does not match grandTotal (off by > 0.01)', async () => {
      const vendor = await makeVendor('ผู้ขายตัวเลขขัด', '0000000020001');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '100.00',
          vatAmount: '7.00',
          withholdingTaxAmount: '0',
          grandTotal: '200.00', // ≠ 100 + 7 − 0 = 107
          paidAt: '2026-05-01',
        },
        fakePdf('h3-bad.pdf', 'h3-bad-1'),
      );

      await expect(
        service.account(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'AMOUNT_INCONSISTENT',
          expectedGrandTotal: '107',
          actualGrandTotal: '200',
        }),
      });
    });

    it('accepts when amounts reconcile exactly', async () => {
      const vendor = await makeVendor('ผู้ขายตัวเลขถูก', '0000000020002');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '100.00',
          vatAmount: '7.00',
          withholdingTaxAmount: '3.00',
          grandTotal: '104.00', // 100 + 7 − 3
          paidAt: '2026-05-01',
        },
        fakePdf('h3-ok.pdf', 'h3-ok-1'),
      );
      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      expect(accounted.status).toBe('ACCOUNTED');
    });

    it('tolerates 0.01 rounding difference', async () => {
      const vendor = await makeVendor('ผู้ขาย rounding', '0000000020003');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '100.00',
          vatAmount: '7.00',
          withholdingTaxAmount: '0',
          grandTotal: '107.01', // off by exactly 0.01 — within tolerance
          paidAt: '2026-05-01',
        },
        fakePdf('h3-round.pdf', 'h3-round-1'),
      );
      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      expect(accounted.status).toBe('ACCOUNTED');
    });
  });

  describe('findVendorCandidate — M4 normalize whitespace + case', () => {
    it('matches stored vendor when input has extra whitespace', async () => {
      await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VENDOR',
          nameTh: 'บริษัท ก จำกัด',
          taxId: '0000000030001',
        },
      });
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorName: 'บริษัท  ก   จำกัด' }, // double + triple spaces
        fakePdf('m4-ws.pdf', 'm4-ws-1'),
      );
      expect(receipt.status).toBe('READY_TO_ACCOUNT');
      expect(receipt.vendor?.taxId).toBe('0000000030001');
    });

    it('matches with mixed case (utf8mb4_unicode_ci handles English letters)', async () => {
      await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VENDOR',
          nameTh: 'Acme Co., Ltd.',
          taxId: '0000000030002',
        },
      });
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorName: 'acme  co., ltd.' },
        fakePdf('m4-case.pdf', 'm4-case-1'),
      );
      expect(receipt.status).toBe('READY_TO_ACCOUNT');
      expect(receipt.vendor?.taxId).toBe('0000000030002');
    });
  });

  describe('approveVendor — M8 P2002 → 409', () => {
    it('returns 409 ConflictException when vendor code collides', async () => {
      // existing vendor with code = "ACME"
      await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VENDOR',
          code: 'ACME',
          nameTh: 'ผู้ขาย ACME เดิม',
          taxId: '0000000040001',
        },
      });
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorName: 'ผู้ขายชื่อใหม่', vendorTaxId: '0000000040002' },
        fakePdf('m8.pdf', 'm8-1'),
      );

      await expect(
        service.approveVendor(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id, {
          code: 'ACME', // collide on (companyId, code) unique
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'VENDOR_CONSTRAINT_CONFLICT' }),
      });
    });
  });

  describe('approveVendor — H5 duplicate vendor guard', () => {
    it('refuses to create when taxId matches an existing active vendor', async () => {
      const existing = await makeVendor('ผู้ขายเดิม', '0000000009999');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        // proposed taxId is novel here — so upload won't auto-link, status = PENDING_VENDOR_APPROVAL
        { vendorName: 'ชื่อใหม่ที่พิมพ์', vendorTaxId: '0000000010101' },
        fakePdf('dupv.pdf', 'tx-dupv-1'),
      );
      expect(receipt.status).toBe('PENDING_VENDOR_APPROVAL');

      // operator now tries to "approve" but supplies the existing vendor's taxId — must collide
      await expect(
        service.approveVendor(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id, {
          nameTh: 'ชื่ออะไรก็ได้',
          taxId: existing.taxId!,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'VENDOR_ALREADY_EXISTS',
          existingVendorId: existing.id,
        }),
      });
    });

    it('creates a fresh vendor when no collision', async () => {
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        { vendorName: 'ผู้ขายใหม่จริง ๆ', vendorTaxId: '0000000012121' },
        fakePdf('newv.pdf', 'tx-newv-1'),
      );
      const result = await service.approveVendor(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
        {},
      );
      expect(result.status).toBe('READY_TO_ACCOUNT');
      expect(result.vendor?.nameTh).toBe('ผู้ขายใหม่จริง ๆ');
      expect(result.vendor?.taxId).toBe('0000000012121');
    });
  });
});
