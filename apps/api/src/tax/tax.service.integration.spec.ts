import { Prisma } from '@prisma/client';
import { TaxService } from './tax.service';
import { VatService } from './vat.service';
import { PaymentsService } from '../payments/payments.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('TaxService (integration)', () => {
  let env: TestEnv;
  let tax: TaxService;
  let vat: VatService;
  let payments: PaymentsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    tax = env.app.get(TaxService);
    vat = env.app.get(VatService);
    payments = env.app.get(PaymentsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  async function seedVat(opts: {
    recordType: 'OUTPUT' | 'INPUT';
    base: string;
    vat: string;
    date: string;
    sourceId: string;
  }) {
    return vat.record({
      companyId: env.seed.companyId,
      recordType: opts.recordType,
      sourceType: 'TEST',
      sourceId: opts.sourceId,
      documentDate: new Date(opts.date),
      documentNumber: 'TEST-' + opts.sourceId,
      partnerName: 'partner',
      partnerTaxId: '0000000010001',
      baseAmount: opts.base,
      vatRate: '7',
      vatAmount: opts.vat,
    });
  }

  describe('dashboard', () => {
    it('sums OUTPUT and INPUT VAT for the given period; net = output − input', async () => {
      await seedVat({ recordType: 'OUTPUT', base: '1000', vat: '70', date: '2026-05-01', sourceId: 'sd-1' });
      await seedVat({ recordType: 'OUTPUT', base: '2000', vat: '140', date: '2026-05-15', sourceId: 'sd-2' });
      await seedVat({ recordType: 'INPUT', base: '500', vat: '35', date: '2026-05-10', sourceId: 'er-1' });

      const result = await tax.dashboard(env.seed.companyId, { year: 2026, month: 5 });
      expect(result.vat.output.vat).toBe('210');
      expect(result.vat.input.vat).toBe('35');
      expect(result.vat.net).toBe('175');
      expect(result.vat.netLabel).toBe('ภาษีที่ต้องชำระ'); // > 0
    });

    it('classifies net as ภาษีขอคืน when input > output', async () => {
      await seedVat({ recordType: 'OUTPUT', base: '100', vat: '7', date: '2026-06-01', sourceId: 'sd-3' });
      await seedVat({ recordType: 'INPUT', base: '5000', vat: '350', date: '2026-06-10', sourceId: 'er-2' });

      const result = await tax.dashboard(env.seed.companyId, { year: 2026, month: 6 });
      expect(Number(result.vat.net)).toBeLessThan(0);
      expect(result.vat.netLabel).toBe('ภาษีขอคืน');
    });

    it('different month filter returns separate totals', async () => {
      const may = await tax.dashboard(env.seed.companyId, { year: 2026, month: 5 });
      const june = await tax.dashboard(env.seed.companyId, { year: 2026, month: 6 });
      expect(may.vat.output.vat).not.toBe(june.vat.output.vat);
    });

    it('WHT totals from PaymentsService surface in dashboard', async () => {
      const vendor = await env.prisma.partner.create({
        data: {
          companyId: env.seed.companyId,
          type: 'VENDOR',
          nameTh: 'ผู้ขาย WHT-test',
          taxId: '0000000099301',
        },
      });
      await payments.create(env.seed.companyId, env.seed.userId, {
        direction: 'OUT',
        partnerId: vendor.id,
        paymentDate: '2026-07-10',
        amount: '1000',
        whtAmount: '30',
      });
      const result = await tax.dashboard(env.seed.companyId, { year: 2026, month: 7 });
      expect(Number(result.wht.payable.amount)).toBe(30);
      expect(Number(result.wht.receivable.amount)).toBe(0);
    });
  });

  describe('vatReport', () => {
    it('groups rows by recordType then sorts by documentDate', async () => {
      // Self-contained: seed our own data in a dedicated period.
      await seedVat({ recordType: 'INPUT', base: '100', vat: '7', date: '2026-11-05', sourceId: 'r-in-1' });
      await seedVat({ recordType: 'INPUT', base: '300', vat: '21', date: '2026-11-15', sourceId: 'r-in-2' });
      await seedVat({ recordType: 'OUTPUT', base: '200', vat: '14', date: '2026-11-02', sourceId: 'r-out-1' });
      const result = await tax.vatReport(env.seed.companyId, { year: 2026, month: 11 });
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      // Same-recordType rows must be contiguous (grouped). MySQL orders enums
      // by definition order (OUTPUT first), so we just assert grouping invariant
      // and within-group date ascending.
      const seenTransitions: string[] = [];
      let prevType = result.items[0]!.recordType;
      let prevDateInGroup = new Date(result.items[0]!.documentDate);
      for (let i = 1; i < result.items.length; i++) {
        const row = result.items[i]!;
        if (row.recordType !== prevType) {
          seenTransitions.push(`${prevType}→${row.recordType}`);
          prevType = row.recordType;
          prevDateInGroup = new Date(row.documentDate);
        } else {
          const d = new Date(row.documentDate);
          expect(d.getTime()).toBeGreaterThanOrEqual(prevDateInGroup.getTime());
          prevDateInGroup = d;
        }
      }
      // No more than one transition (grouping invariant) for our 2-type dataset.
      expect(seenTransitions.length).toBeLessThanOrEqual(1);
    });

    it('Decimal columns serialize as strings (no JS float)', async () => {
      await seedVat({ recordType: 'OUTPUT', base: '100', vat: '7', date: '2026-12-01', sourceId: 'r-dec-1' });
      const result = await tax.vatReport(env.seed.companyId, { year: 2026, month: 12 });
      const row = result.items[0]!;
      expect(typeof row.baseAmount).toBe('string');
      expect(typeof row.vatAmount).toBe('string');
      expect(typeof row.vatRate).toBe('string');
    });
  });

  describe('whtReport', () => {
    it('lists WHT records for the period', async () => {
      const result = await tax.whtReport(env.seed.companyId, { year: 2026, month: 7 });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]!.recordType).toBe('PAYABLE');
    });
  });
});
