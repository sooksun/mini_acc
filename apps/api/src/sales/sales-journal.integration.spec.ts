import { InvoicesService } from './invoices.service';
import { ReceiptsService } from './receipts.service';
import { ReceiptTaxInvoicesService } from './receipt-tax-invoices.service';
import { QuotationsService } from './quotations.service';
import { SalesDocumentService } from './_shared/sales-document.service';
import { PaymentsService } from '../payments/payments.service';
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

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    invoices = env.app.get(InvoicesService);
    receipts = env.app.get(ReceiptsService);
    receiptTax = env.app.get(ReceiptTaxInvoicesService);
    quotations = env.app.get(QuotationsService);
    salesDoc = env.app.get(SalesDocumentService);
    payments = env.app.get(PaymentsService);
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
});
