import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhtPdfService } from './wht-pdf.service';
import { PaymentsService } from '../payments/payments.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

function assertPdfBuffer(buf: Buffer) {
  expect(buf.length).toBeGreaterThan(500);
  // PDF magic
  expect(buf[0]).toBe(0x25);
  expect(buf[1]).toBe(0x50);
  expect(buf[2]).toBe(0x44);
  expect(buf[3]).toBe(0x46);
}

describe('WhtPdfService (integration)', () => {
  let env: TestEnv;
  let service: WhtPdfService;
  let payments: PaymentsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(WhtPdfService);
    payments = env.app.get(PaymentsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  async function createVendorPayment(taxId: string, name: string) {
    const v = await env.prisma.partner.create({
      data: {
        companyId: env.seed.companyId,
        type: 'VENDOR',
        nameTh: name,
        taxId,
        address: 'ที่อยู่ผู้ขายทดสอบ',
      },
    });
    return payments.create(env.seed.companyId, env.seed.userId, {
      direction: 'OUT',
      partnerId: v.id,
      paymentDate: '2026-08-10',
      amount: '10000',
      whtAmount: '300',
      whtCertNumber: `CERT-${taxId.slice(-4)}`,
      whtCategory: 'ค่าจ้างทำของ — 40(8)',
    });
  }

  describe('renderCertificate (50 ทวิ)', () => {
    it('renders a 3-page PDF for a PAYABLE WHT record (juristic vendor → ภ.ง.ด.53)', async () => {
      await createVendorPayment('0123456780011', 'นิติบุคคล ABC จำกัด');
      const wht = await env.prisma.withholdingTaxRecord.findFirstOrThrow({
        where: { partnerTaxId: '0123456780011' },
      });

      const { buffer, fileName } = await service.renderCertificate(env.seed.companyId, wht.id);
      assertPdfBuffer(buffer);
      expect(fileName).toContain('WHT-50tawi');
      expect(fileName.endsWith('.pdf')).toBe(true);
    });

    it('renders single-page PDF when copies = [ORIGINAL]', async () => {
      await createVendorPayment('1123456780012', 'บุคคลธรรมดา XYZ');
      const wht = await env.prisma.withholdingTaxRecord.findFirstOrThrow({
        where: { partnerTaxId: '1123456780012' },
      });
      const { buffer } = await service.renderCertificate(env.seed.companyId, wht.id, ['ORIGINAL']);
      assertPdfBuffer(buffer);
      // Single page should be noticeably smaller than 3-page version
      const { buffer: triple } = await service.renderCertificate(env.seed.companyId, wht.id);
      expect(buffer.length).toBeLessThan(triple.length);
    });

    it('refuses certificate for RECEIVABLE record (vendor withheld from us, we don\'t issue cert)', async () => {
      // Force-insert a RECEIVABLE record bypassing PaymentsService
      const customer = await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'CUSTOMER',
          nameTh: 'ลูกค้าหักเราไว้',
          taxId: '0123456780013',
        },
      });
      const payment = await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'IN',
        partnerId: customer.id,
        paymentDate: '2026-08-10',
        amount: '10000',
        whtAmount: '300',
      });
      const recvRecord = await env.prisma.withholdingTaxRecord.findFirstOrThrow({
        where: { paymentId: payment.id, recordType: 'RECEIVABLE' },
      });
      await expect(
        service.renderCertificate(env.seed.companyId, recvRecord.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CERT_REQUIRES_PAYABLE' }),
      });
    });

    it('refuses unknown record', async () => {
      await expect(
        service.renderCertificate(env.seed.companyId, 'no-such-record'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('renderPndSummary (monthly attachment)', () => {
    it('PND53 filter only includes juristic-tax-id partners (leading 0)', async () => {
      await createVendorPayment('0123456780021', 'นิติบุคคล AAA');
      await createVendorPayment('1123456780022', 'บุคคลธรรมดา BBB');

      const result = await service.renderPndSummary(env.seed.companyId, 2026, 8, 'PND53');
      assertPdfBuffer(result.buffer);
      // Includes prior test's 0123…11 + this test's 0123…21 (both juristic);
      // excludes 1123…12 and 1123…22 (individuals)
      expect(result.recordCount).toBeGreaterThanOrEqual(1);
      expect(result.fileName).toMatch(/pnd53/);

      // Verify by direct DB query that all included records have leading-0 taxIds
      const all = await env.prisma.withholdingTaxRecord.findMany({
        where: {
          companyId: env.seed.companyId,
          recordType: 'PAYABLE',
          periodYear: 2026,
          periodMonth: 8,
        },
      });
      const juristic = all.filter((r) => (r.partnerTaxId ?? '').startsWith('0'));
      expect(result.recordCount).toBe(juristic.length);
    });

    it('PND3 filter only includes individual-tax-id partners (leading 1/2/3/5)', async () => {
      const result = await service.renderPndSummary(env.seed.companyId, 2026, 8, 'PND3');
      const all = await env.prisma.withholdingTaxRecord.findMany({
        where: {
          companyId: env.seed.companyId,
          recordType: 'PAYABLE',
          periodYear: 2026,
          periodMonth: 8,
        },
      });
      const individuals = all.filter((r) => !(r.partnerTaxId ?? '').startsWith('0'));
      expect(result.recordCount).toBe(individuals.length);
      expect(result.fileName).toMatch(/pnd3-/);
    });

    it('renders an empty-state PDF when no records in period', async () => {
      const result = await service.renderPndSummary(env.seed.companyId, 2099, 1, 'PND3');
      assertPdfBuffer(result.buffer);
      expect(result.recordCount).toBe(0);
    });
  });

  describe('periodSplit', () => {
    it('returns count + totals split by inferred form type', async () => {
      const split = await service.periodSplit(env.seed.companyId, 2026, 8);
      expect(split.pnd3.count).toBeGreaterThan(0);
      expect(split.pnd53.count).toBeGreaterThan(0);
      // PAYABLE records only — RECEIVABLE shouldn't show up
      // We had 1 PND53 vendor (0123...11), 2 PND3 (1123...12, 1123...22) and 1 PND53 (0123...21)
      // The RECEIVABLE from the customer (0123...13) is NOT counted because periodSplit
      // filters recordType=PAYABLE only.
      expect(typeof split.pnd3.base).toBe('string');
      expect(typeof split.pnd3.wht).toBe('string');
      expect(typeof split.pnd53.base).toBe('string');
    });
  });

  describe('PND54 (foreign payments)', () => {
    it('includes only FOREIGN_WHT records and excludes them from ภ.ง.ด.3/53', async () => {
      // A foreign WHT record (as ExpenseReceiptsService.fileObligation creates),
      // in a fresh period 2026/09. No Thai tax ID; sourceType = FOREIGN_WHT.
      await env.prisma.withholdingTaxRecord.create({
        data: {
          companyId: env.seed.companyId,
          recordType: 'PAYABLE',
          sourceType: 'FOREIGN_WHT',
          sourceId: 'oblig-test-pnd54-1',
          paidAt: new Date('2026-09-07T12:00:00+07:00'),
          partnerName: 'Anysphere, Inc.',
          partnerTaxId: null,
          baseAmount: '1000',
          rate: '5',
          whtAmount: '50',
          category: 'ROYALTY',
          periodYear: 2026,
          periodMonth: 9,
        },
      });
      // A domestic juristic payment in the same period — must NOT land in PND54.
      const vendor = await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VENDOR',
          nameTh: 'นิติบุคคล Local ก.ย.',
          taxId: '0123456780031',
          address: 'ที่อยู่',
        },
      });
      await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: vendor.id,
        paymentDate: '2026-09-10',
        amount: '10000',
        whtAmount: '300',
        whtCategory: 'ค่าจ้างทำของ',
      });

      const pnd54 = await service.renderPndSummary(env.seed.companyId, 2026, 9, 'PND54');
      assertPdfBuffer(pnd54.buffer);
      expect(pnd54.recordCount).toBe(1); // only the foreign record
      expect(pnd54.fileName).toMatch(/pnd54/);

      // The foreign record is excluded from the domestic ภ.ง.ด.53 attachment.
      const pnd53 = await service.renderPndSummary(env.seed.companyId, 2026, 9, 'PND53');
      expect(pnd53.recordCount).toBe(1); // the domestic juristic vendor only

      const split = await service.periodSplit(env.seed.companyId, 2026, 9);
      expect(split.pnd54.count).toBe(1);
      expect(split.pnd53.count).toBe(1);
      expect(split.pnd3.count).toBe(0);
    });
  });
});
