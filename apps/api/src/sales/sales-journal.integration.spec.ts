import type { DocumentType } from '@hj/shared-types';
import { DeliveryNotesService } from './delivery-notes.service';
import { InvoicesService } from './invoices.service';
import { ReceiptsService } from './receipts.service';
import { ReceiptTaxInvoicesService } from './receipt-tax-invoices.service';
import { QuotationsService } from './quotations.service';
import { TaxInvoicesService } from './tax-invoices.service';
import { SalesDocumentService } from './_shared/sales-document.service';
import { PaymentsService } from '../payments/payments.service';
import { InventoryService } from '../inventory/inventory.service';
import { journalBalanceMismatch } from '../journal/journal-balance';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

const baseDoc = (
  customerId: string,
  productId: string,
  opts: { vatRate?: number; whtRate?: number } = {},
) => ({
  customerId,
  documentDate: '2026-05-10T00:00:00+07:00',
  vatRate: opts.vatRate ?? 7,
  whtRate: opts.whtRate ?? 0,
  items: [
    {
      productId,
      description: 'บริการทดสอบ',
      unit: 'รายการ',
      quantity: 1,
      unitPrice: 1000,
      vatable: true,
    },
  ],
});

/** Sum debit/credit on the single SALES_DOCUMENT journal entry for a doc. */
async function salesEntry(env: TestEnv, sourceId: string) {
  const entries = await env.prisma.journalEntry.findMany({
    where: { companyId: env.seed.companyId, sourceType: 'SALES_DOCUMENT', sourceId },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  return entries;
}

const num = (d: { toString(): string }) => Number(d.toString());

describe('Sales document → journal posting (integration)', () => {
  let env: TestEnv;
  let invoices: InvoicesService;
  let receipts: ReceiptsService;
  let receiptTax: ReceiptTaxInvoicesService;
  let quotations: QuotationsService;
  let salesDoc: SalesDocumentService;
  let payments: PaymentsService;
  let inventory: InventoryService;
  let dnService: DeliveryNotesService;
  let taxInvService: TaxInvoicesService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    invoices = env.app.get(InvoicesService);
    receipts = env.app.get(ReceiptsService);
    receiptTax = env.app.get(ReceiptTaxInvoicesService);
    quotations = env.app.get(QuotationsService);
    salesDoc = env.app.get(SalesDocumentService);
    payments = env.app.get(PaymentsService);
    inventory = env.app.get(InventoryService);
    dnService = env.app.get(DeliveryNotesService);
    taxInvService = env.app.get(TaxInvoicesService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('INVOICE confirm posts Dr AR / Cr Revenue / Cr Output VAT (balanced)', async () => {
    const draft = await invoices.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    const entries = await salesEntry(env, draft.id);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e.status).toBe('POSTED');
    expect(num(e.totalDebit)).toBe(1070);
    expect(num(e.totalCredit)).toBe(1070);

    const ar = e.lines.find((l) => l.accountCode === '1130');
    const rev = e.lines.find((l) => l.accountCode.startsWith('4'));
    const vat = e.lines.find((l) => l.accountCode === '2151');
    expect(num(ar!.debit)).toBe(1070);
    expect(num(rev!.credit)).toBe(1000);
    expect(num(vat!.credit)).toBe(70);
  });

  it('standalone RECEIPT (no VAT) posts Dr Cash / Cr Revenue', async () => {
    const draft = await receipts.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId, { vatRate: 0 }),
    );
    await receipts.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    const entries = await salesEntry(env, draft.id);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(num(e.totalDebit)).toBe(1000);
    const cash = e.lines.find((l) => l.accountCode === '1110');
    const rev = e.lines.find((l) => l.accountCode.startsWith('4'));
    expect(num(cash!.debit)).toBe(1000);
    expect(num(rev!.credit)).toBe(1000);
    expect(e.lines.some((l) => l.accountCode === '2151')).toBe(false);
  });

  it('standalone RECEIPT with WHT posts Dr Cash(net) + Dr WHT receivable', async () => {
    const draft = await receipts.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId, { vatRate: 0, whtRate: 3 }),
    );
    await receipts.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    const e = (await salesEntry(env, draft.id))[0]!;
    expect(num(e.totalDebit)).toBe(1000);
    expect(num(e.totalCredit)).toBe(1000);
    const cash = e.lines.find((l) => l.accountCode === '1110');
    const wht = e.lines.find((l) => l.accountCode === '1152');
    expect(num(cash!.debit)).toBe(970);
    expect(num(wht!.debit)).toBe(30);
  });

  it('standalone RECEIPT_TAX_INVOICE posts cash + WHT + revenue + output VAT', async () => {
    const draft = await receiptTax.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId, { vatRate: 7, whtRate: 3 }),
    );
    await receiptTax.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    const e = (await salesEntry(env, draft.id))[0]!;
    expect(num(e.totalDebit)).toBe(1070);
    expect(num(e.totalCredit)).toBe(1070);
    expect(num(e.lines.find((l) => l.accountCode === '1110')!.debit)).toBe(1040);
    expect(num(e.lines.find((l) => l.accountCode === '1152')!.debit)).toBe(30);
    expect(num(e.lines.find((l) => l.accountCode.startsWith('4'))!.credit)).toBe(1000);
    expect(num(e.lines.find((l) => l.accountCode === '2151')!.credit)).toBe(70);
  });

  it('QUOTATION confirm posts NO journal entry', async () => {
    const draft = await quotations.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await quotations.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);
    expect(await salesEntry(env, draft.id)).toHaveLength(0);
  });

  it('void voids the revenue journal entry too', async () => {
    const draft = await invoices.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);
    await invoices.void(env.seed.companyId, env.seed.userId, 'OWNER', draft.id, 'ยกเลิกทดสอบ');

    const e = (await salesEntry(env, draft.id))[0]!;
    expect(e.status).toBe('VOIDED');
  });

  it('backfill posts journals for legacy confirmed docs and is idempotent', async () => {
    const draft = await invoices.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    // Simulate a document confirmed before journal wiring existed.
    await env.prisma.journalEntry.deleteMany({
      where: { companyId: env.seed.companyId, sourceType: 'SALES_DOCUMENT', sourceId: draft.id },
    });
    expect(await salesEntry(env, draft.id)).toHaveLength(0);

    const first = await salesDoc.backfillRevenueJournals(env.seed.companyId, env.seed.userId);
    expect(first.posted).toBeGreaterThanOrEqual(1);
    expect(await salesEntry(env, draft.id)).toHaveLength(1);

    // Running again must not duplicate.
    const second = await salesDoc.backfillRevenueJournals(env.seed.companyId, env.seed.userId);
    expect(second.posted).toBe(0);
    expect(await salesEntry(env, draft.id)).toHaveLength(1);
  });

  it('settlement: a SALES_DOCUMENT-linked payment surfaces in findOne and clears the receivable', async () => {
    const draft = await invoices.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    // Before payment: unsettled, outstanding = grandTotal (1070).
    const before = await salesDoc.findOne('INVOICE', env.seed.companyId, draft.id);
    expect(before.settlement.paid).toBe(false);
    expect(num(before.settlement.outstanding)).toBe(1070);
    expect(before.settlement.payments).toHaveLength(0);

    // Record the customer's payment linked back to the invoice.
    await payments.create(env.seed.companyId, env.seed.userId, {
      direction: 'IN',
      partnerId: env.seed.customerId,
      paymentDate: '2026-05-12',
      amount: '1070',
      sourceType: 'SALES_DOCUMENT',
      sourceId: draft.id,
    });

    // After: settled, payment surfaced, outstanding 0.
    const after = await salesDoc.findOne('INVOICE', env.seed.companyId, draft.id);
    expect(after.settlement.paid).toBe(true);
    expect(num(after.settlement.paidAmount)).toBe(1070);
    expect(num(after.settlement.outstanding)).toBe(0);
    expect(after.settlement.payments).toHaveLength(1);
  });

  it('settlement: a voided linked payment is excluded (document returns to unsettled)', async () => {
    const draft = await invoices.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);
    const payment = await payments.create(env.seed.companyId, env.seed.userId, {
      direction: 'IN',
      partnerId: env.seed.customerId,
      paymentDate: '2026-05-12',
      amount: '1070',
      sourceType: 'SALES_DOCUMENT',
      sourceId: draft.id,
    });
    expect((await salesDoc.findOne('INVOICE', env.seed.companyId, draft.id)).settlement.paid).toBe(
      true,
    );

    await payments.voidPayment(env.seed.companyId, env.seed.userId, 'OWNER', payment.id, {
      reason: 'รับเงินผิดใบ',
    });

    const after = await salesDoc.findOne('INVOICE', env.seed.companyId, draft.id);
    expect(after.settlement.paid).toBe(false);
    expect(num(after.settlement.outstanding)).toBe(1070);
  });

  describe('GOOD confirm — stock OUT + revenue journal', () => {
    async function seedGoodProduct(nameTh: string, stockQty: string) {
      const good = await env.prisma.product.create({
        data: {
          companyId: env.seed.companyId,
          type: 'GOOD',
          nameTh,
          unit: 'ชิ้น',
          unitPrice: '100',
          vatable: true,
        },
      });
      await env.prisma.inventoryMovement.create({
        data: {
          companyId: env.seed.companyId,
          productId: good.id,
          type: 'IN',
          quantity: stockQty,
          movementDate: new Date('2026-05-01'),
        },
      });
      return good;
    }

    it.each<DocumentType>(['INVOICE', 'TAX_INVOICE'])(
      '%s with GOOD posts balanced journal and stock OUT',
      async (docType) => {
        const good = await seedGoodProduct(`สินค้า ${docType}`, '12');
        const createDto = {
          customerId: env.seed.customerId,
          documentDate: '2026-05-15',
          vatRate: 7,
          whtRate: 0,
          items: [
            {
              productId: good.id,
              description: `สินค้า ${docType}`,
              unit: 'ชิ้น',
              quantity: 4,
              unitPrice: 100,
              vatable: true,
            },
          ],
        };

        const draft =
          docType === 'INVOICE'
            ? await invoices.create(env.seed.companyId, env.seed.userId, createDto)
            : await taxInvService.create(env.seed.companyId, env.seed.userId, createDto);

        const confirmed =
          docType === 'INVOICE'
            ? await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id)
            : await taxInvService.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

        expect(confirmed.status).toBe('USER_CONFIRMED');

        const entries = await salesEntry(env, confirmed.id);
        expect(entries).toHaveLength(1);
        const e = entries[0]!;
        expect(e.totalDebit.toString()).toBe(e.totalCredit.toString());
        expect(
          journalBalanceMismatch(e.lines.map((l) => ({ debit: l.debit, credit: l.credit }))),
        ).toBeNull();

        const movement = await env.prisma.inventoryMovement.findFirst({
          where: {
            companyId: env.seed.companyId,
            productId: good.id,
            type: 'OUT',
            referenceType: docType,
            referenceId: confirmed.id,
          },
        });
        expect(movement).not.toBeNull();
        expect(movement!.quantity.toString()).toBe('4');
        expect((await inventory.stockOnHand(env.seed.companyId, good.id)).toString()).toBe('8');
      },
    );

    it('DELIVERY_NOTE with GOOD posts stock OUT only (no revenue journal)', async () => {
      const good = await seedGoodProduct('สินค้า DN', '10');
      const draft = await dnService.create(env.seed.companyId, env.seed.userId, {
        customerId: env.seed.customerId,
        documentDate: '2026-05-10',
        vatRate: 7,
        whtRate: 0,
        items: [
          {
            productId: good.id,
            description: 'สินค้า DN',
            unit: 'ชิ้น',
            quantity: 3,
            unitPrice: 100,
            vatable: true,
          },
        ],
      });
      const confirmed = await dnService.confirm(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        draft.id,
      );
      expect(await salesEntry(env, confirmed.id)).toHaveLength(0);
      const movement = await env.prisma.inventoryMovement.findFirst({
        where: {
          companyId: env.seed.companyId,
          productId: good.id,
          type: 'OUT',
          referenceType: 'DELIVERY_NOTE',
          referenceId: confirmed.id,
        },
      });
      expect(movement!.quantity.toString()).toBe('3');
    });

    it('standalone RECEIPT with GOOD posts balanced journal and stock OUT', async () => {
      const good = await seedGoodProduct('สินค้าขายสด', '5');
      const draft = await receipts.create(env.seed.companyId, env.seed.userId, {
        customerId: env.seed.customerId,
        documentDate: '2026-05-12',
        vatRate: 7,
        whtRate: 0,
        items: [
          {
            productId: good.id,
            description: 'สินค้าขายสด',
            unit: 'ชิ้น',
            quantity: 2,
            unitPrice: 200,
            vatable: true,
          },
        ],
      });
      const confirmed = await receipts.confirm(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        draft.id,
      );
      const e = (await salesEntry(env, confirmed.id))[0]!;
      expect(
        journalBalanceMismatch(e.lines.map((l) => ({ debit: l.debit, credit: l.credit }))),
      ).toBeNull();
      const movement = await env.prisma.inventoryMovement.findFirst({
        where: {
          companyId: env.seed.companyId,
          productId: good.id,
          type: 'OUT',
          referenceType: 'RECEIPT',
          referenceId: confirmed.id,
        },
      });
      expect(movement!.quantity.toString()).toBe('2');
    });

    it('rejects DN confirm when stock is insufficient', async () => {
      const good = await env.prisma.product.create({
        data: {
          companyId: env.seed.companyId,
          type: 'GOOD',
          nameTh: 'สินค้าสต็อกไม่พอ',
          unit: 'ชิ้น',
          unitPrice: '50',
          vatable: true,
        },
      });
      const draft = await dnService.create(env.seed.companyId, env.seed.userId, {
        customerId: env.seed.customerId,
        documentDate: '2026-05-11',
        vatRate: 7,
        whtRate: 0,
        items: [
          {
            productId: good.id,
            description: 'สินค้าสต็อกไม่พอ',
            unit: 'ชิ้น',
            quantity: 2,
            unitPrice: 50,
            vatable: true,
          },
        ],
      });
      await expect(
        dnService.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STOCK_NEGATIVE' }),
      });
    });

    it('skips stock OUT for SERVICE line items on INVOICE confirm', async () => {
      const service = await env.prisma.product.create({
        data: {
          companyId: env.seed.companyId,
          type: 'SERVICE',
          nameTh: 'บริการไม่ตัดสต็อก',
          unit: 'รายการ',
          unitPrice: '500',
          vatable: true,
        },
      });
      const draft = await invoices.create(env.seed.companyId, env.seed.userId, {
        customerId: env.seed.customerId,
        documentDate: '2026-05-16',
        vatRate: 7,
        whtRate: 0,
        items: [
          {
            productId: service.id,
            description: 'บริการไม่ตัดสต็อก',
            unit: 'รายการ',
            quantity: 1,
            unitPrice: 500,
            vatable: true,
          },
        ],
      });
      await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);
      const movement = await env.prisma.inventoryMovement.findFirst({
        where: {
          companyId: env.seed.companyId,
          productId: service.id,
          type: 'OUT',
          referenceType: 'INVOICE',
          referenceId: draft.id,
        },
      });
      expect(movement).toBeNull();
    });
  });
});
