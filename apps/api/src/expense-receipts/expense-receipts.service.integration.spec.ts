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

    it('rejects even 0.01 rounding diff — journal needs exact Dr=Cr', async () => {
      const vendor = await makeVendor('ผู้ขาย rounding', '0000000020003');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '100.00',
          vatAmount: '7.00',
          withholdingTaxAmount: '0',
          grandTotal: '107.01', // off by 0.01 — refused now that journal posts strictly
          paidAt: '2026-05-01',
        },
        fakePdf('h3-round.pdf', 'h3-round-1'),
      );
      await expect(
        service.account(env.seed.companyId, env.seed.userId, 'OWNER', receipt.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AMOUNT_INCONSISTENT' }),
      });
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

  describe('account() — P3 journal posting hook', () => {
    it('posts a 3-line journal entry when WHT > 0', async () => {
      const vendor = await makeVendor('ผู้ขาย journal-wht', '0000000050001');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '1000',
          vatAmount: '70',
          withholdingTaxAmount: '10',
          grandTotal: '1060', // 1000 + 70 - 10
          paidAt: '2026-05-10',
          category: 'ค่าซอฟต์แวร์',
        },
        fakePdf('je-wht.pdf', 'je-wht-1'),
      );
      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      const journals = await env.prisma.journalEntry.findMany({
        where: { sourceType: 'EXPENSE_RECORD', sourceId: accounted.expenseRecord!.id },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      expect(journals).toHaveLength(1);
      const lines = journals[0]!.lines;
      // Dr Expense 1000, Dr Input VAT 70, Cr Cash 1060, Cr WHT Payable 10
      expect(lines).toHaveLength(4);
      expect(lines[0]!.accountName).toBe('ค่าซอฟต์แวร์');
      expect(lines[0]!.debit.toString()).toBe('1000');
      expect(lines[1]!.debit.toString()).toBe('70');
      expect(lines[2]!.credit.toString()).toBe('1060');
      expect(lines[3]!.credit.toString()).toBe('10');
      expect(journals[0]!.totalDebit.equals(journals[0]!.totalCredit)).toBe(true);
    });

    it('posts a 2-line journal entry when no VAT, no WHT', async () => {
      const vendor = await makeVendor('ผู้ขาย journal-simple', '0000000050002');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '500',
          vatAmount: '0',
          withholdingTaxAmount: '0',
          grandTotal: '500',
          paidAt: '2026-05-10',
        },
        fakePdf('je-simple.pdf', 'je-simple-1'),
      );
      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      const journal = await env.prisma.journalEntry.findFirstOrThrow({
        where: { sourceType: 'EXPENSE_RECORD', sourceId: accounted.expenseRecord!.id },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      expect(journal.lines).toHaveLength(2);
      expect(journal.lines[0]!.debit.toString()).toBe('500');
      expect(journal.lines[1]!.credit.toString()).toBe('500');
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

  describe('foreign expense + PP.36 reverse-charge VAT (F1+F2)', () => {
    it('foreign SERVICE used in TH: VAT=0 reconciles, accounts, creates a PENDING PP.36 obligation', async () => {
      const vendor = await makeVendor('Anysphere, Inc.', '0000000060001');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          // UI computes THB = 106.65 × 36 = 3839.40; VAT=0 (foreign vendor)
          subtotal: '3839.40',
          vatAmount: '0',
          withholdingTaxAmount: '0',
          grandTotal: '3839.40',
          paidAt: '2026-05-10',
          category: 'ค่าซอฟต์แวร์',
          isForeign: true,
          expenseNature: 'SERVICE',
          usedInThailand: true,
          currency: 'USD',
          fxRate: '36',
          foreignSubtotal: '106.65',
          reverseChargeVat: true,
          reverseChargeVatRate: '7',
          dtaCountry: 'US',
        },
        fakePdf('pp36.pdf', 'pp36-1'),
      );

      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      expect(accounted.status).toBe('ACCOUNTED');

      // The expense journal itself stays VAT-free: Dr Expense 3839.40 / Cr Cash 3839.40
      const expenseJournal = await env.prisma.journalEntry.findFirstOrThrow({
        where: { sourceType: 'EXPENSE_RECORD', sourceId: accounted.expenseRecord!.id },
        include: { lines: true },
      });
      expect(expenseJournal.lines).toHaveLength(2);

      const obligations = accounted.expenseRecord?.foreignTaxObligations ?? [];
      expect(obligations).toHaveLength(1);
      const o = obligations[0]!;
      expect(o.kind).toBe('PP36_VAT');
      expect(o.status).toBe('PENDING');
      expect(Number(o.baseAmount)).toBeCloseTo(3839.4, 2);
      expect(Number(o.taxAmount)).toBeCloseTo(268.76, 2); // 3839.40 × 7%
      expect(o.expensePeriodYear).toBe(2026);
      expect(o.expensePeriodMonth).toBe(5);
      expect(o.filePeriodYear).toBe(2026);
      expect(o.filePeriodMonth).toBe(6); // due the month after the expense
    });

    it('filing a PP.36 obligation posts Dr Input VAT / Cr Cash and a VatRecord(INPUT) in the file period', async () => {
      const vendor = await makeVendor('Xlinesoft LLC', '0000000060002');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '1000',
          vatAmount: '0',
          withholdingTaxAmount: '0',
          grandTotal: '1000',
          paidAt: '2026-05-20',
          category: 'ค่าซอฟต์แวร์',
          isForeign: true,
          expenseNature: 'SERVICE',
          usedInThailand: true,
          currency: 'USD',
          fxRate: '1',
          reverseChargeVat: true,
        },
        fakePdf('pp36-file.pdf', 'pp36-file-1'),
      );
      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      const obligationId = accounted.expenseRecord!.foreignTaxObligations![0]!.id;

      const filed = await service.fileObligation(
        env.seed.companyId,
        env.seed.userId,
        obligationId,
        {},
      );
      expect(filed.status).toBe('FILED');
      expect(filed.journalEntryId).toBeTruthy();

      // Journal: Dr Input VAT 70 / Cr Cash 70, balanced, posted in the file period (Jun 2026)
      const je = await env.prisma.journalEntry.findFirstOrThrow({
        where: { sourceType: 'ADJUSTMENT', sourceId: obligationId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      expect(je.lines).toHaveLength(2);
      expect(je.lines[0]!.accountCode).toBe('1151'); // Input VAT
      expect(Number(je.lines[0]!.debit)).toBeCloseTo(70, 2);
      expect(je.lines[1]!.accountCode).toBe('1110'); // Cash
      expect(Number(je.lines[1]!.credit)).toBeCloseTo(70, 2);
      expect(je.totalDebit.equals(je.totalCredit)).toBe(true);
      expect(je.periodYear).toBe(2026);
      expect(je.periodMonth).toBe(6);

      // VatRecord(INPUT) snapshot lands in the file period → flows into PP.30
      const vat = await env.prisma.vatRecord.findFirstOrThrow({
        where: { sourceType: 'PP36_OBLIGATION', sourceId: obligationId },
      });
      expect(vat.recordType).toBe('INPUT');
      expect(vat.periodYear).toBe(2026);
      expect(vat.periodMonth).toBe(6);
      expect(Number(vat.vatAmount)).toBeCloseTo(70, 2);

      // Idempotent: filing again is refused
      await expect(
        service.fileObligation(env.seed.companyId, env.seed.userId, obligationId, {}),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'OBLIGATION_ALREADY_FILED' }),
      });
    });

    it('foreign GOODS does not create a PP.36 obligation (VAT is settled at customs)', async () => {
      const vendor = await makeVendor('Hardware Importer GmbH', '0000000060003');
      const receipt = await service.upload(
        env.seed.companyId,
        env.seed.userId,
        {
          vendorTaxId: vendor.taxId!,
          subtotal: '5000',
          vatAmount: '0',
          withholdingTaxAmount: '0',
          grandTotal: '5000',
          paidAt: '2026-05-10',
          isForeign: true,
          expenseNature: 'GOODS',
          usedInThailand: true,
          reverseChargeVat: true, // even if checked, goods are excluded
        },
        fakePdf('pp36-goods.pdf', 'pp36-goods-1'),
      );
      const accounted = await service.account(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        receipt.id,
      );
      expect(accounted.expenseRecord?.foreignTaxObligations ?? []).toHaveLength(0);
    });
  });
});
