import { ReportsService } from './reports.service';
import { TaxInvoicesService } from '../sales/tax-invoices.service';
import { JournalService } from '../journal/journal.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

const taxInvoiceDoc = (customerId: string, productId: string) => ({
  customerId,
  documentDate: '2026-05-10T00:00:00+07:00',
  vatRate: 7,
  whtRate: 0,
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

describe('ReportsService P&L from journal (integration)', () => {
  let env: TestEnv;
  let reports: ReportsService;
  let taxInvoices: TaxInvoicesService;
  let journal: JournalService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    reports = env.app.get(ReportsService);
    taxInvoices = env.app.get(TaxInvoicesService);
    journal = env.app.get(JournalService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('aggregates revenue (Cr 4xxx) and expense (Dr 5xxx) from posted journals', async () => {
    // Revenue: confirm a TAX_INVOICE → Dr AR 1070 / Cr Revenue 1000 / Cr Output VAT 70
    const inv = await taxInvoices.create(
      env.seed.companyId,
      env.seed.userId,
      taxInvoiceDoc(env.seed.customerId, env.seed.productId),
    );
    await taxInvoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', inv.id);

    // Expense: a plain expense journal Dr ค่าเดินทาง 500 / Cr Cash 500
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-05-15T03:00:00.000Z'),
      description: 'ค่าเดินทางทดสอบ',
      sourceType: 'EXPENSE_RECORD',
      lines: [
        { accountCode: '5000', accountName: 'ค่าเดินทาง', debit: 500 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 500 },
      ],
    });

    const pl = await reports.profitLoss(env.seed.companyId, 2026, 5);

    expect(pl.totals.revenue).toBe(1000);
    expect(pl.totals.revenueGross).toBe(1070);
    expect(pl.totals.expense).toBe(500);
    expect(pl.totals.expenseGross).toBe(500);
    expect(pl.totals.profit).toBe(500);
    expect(pl.totals.marginPercent).toBe(50);

    const taxRow = pl.revenueByType.find((r) => r.key === 'TAX_INVOICE');
    expect(taxRow?.amount).toBe(1000);

    const expRow = pl.expenseByCategory.find((r) => r.label === 'ค่าเดินทาง');
    expect(expRow?.amount).toBe(500);
  });

  it('excludes a voided sales document from revenue', async () => {
    const inv = await taxInvoices.create(
      env.seed.companyId,
      env.seed.userId,
      taxInvoiceDoc(env.seed.customerId, env.seed.productId),
    );
    await taxInvoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', inv.id);

    const before = await reports.profitLoss(env.seed.companyId, 2026, 5);
    await taxInvoices.void(env.seed.companyId, env.seed.userId, 'OWNER', inv.id, 'ยกเลิก');
    const after = await reports.profitLoss(env.seed.companyId, 2026, 5);

    // Voiding removes exactly this invoice's 1000 revenue.
    expect(before.totals.revenue - after.totals.revenue).toBe(1000);
  });
});
