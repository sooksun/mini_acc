import { InvoicesService } from '../sales/invoices.service';
import { PaymentsService } from '../payments/payments.service';
import { journalBalanceMismatch } from './journal-balance';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

/** Assert journalBalanceMismatch agrees with a persisted POSTED entry (shipped callers). */
function expectEntryBalanced(entry: {
  totalDebit: { toString(): string };
  totalCredit: { toString(): string };
  lines: { debit: { toString(): string }; credit: { toString(): string } }[];
}) {
  expect(entry.totalDebit.toString()).toBe(entry.totalCredit.toString());
  expect(
    journalBalanceMismatch(
      entry.lines.map((l) => ({ debit: l.debit, credit: l.credit })),
    ),
  ).toBeNull();
}

describe('journalBalanceMismatch on shipped journal callers (integration)', () => {
  let env: TestEnv;
  let invoices: InvoicesService;
  let payments: PaymentsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    invoices = env.app.get(InvoicesService);
    payments = env.app.get(PaymentsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('postRevenueJournal path: INVOICE confirm persists balanced entry', async () => {
    const draft = await invoices.create(env.seed.companyId, env.seed.userId, {
      customerId: env.seed.customerId,
      documentDate: '2026-05-10',
      vatRate: 7,
      whtRate: 0,
      items: [
        {
          productId: env.seed.productId,
          description: 'บริการทดสอบ',
          unit: 'รายการ',
          quantity: 1,
          unitPrice: 1000,
          vatable: true,
        },
      ],
    });
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    const entry = await env.prisma.journalEntry.findFirst({
      where: {
        companyId: env.seed.companyId,
        sourceType: 'SALES_DOCUMENT',
        sourceId: draft.id,
        status: 'POSTED',
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    expect(entry).not.toBeNull();
    expectEntryBalanced(entry!);
  });

  it('payments.create path: IN payment linked to invoice persists balanced entry', async () => {
    const draft = await invoices.create(env.seed.companyId, env.seed.userId, {
      customerId: env.seed.customerId,
      documentDate: '2026-05-11',
      vatRate: 7,
      whtRate: 0,
      items: [
        {
          productId: env.seed.productId,
          description: 'บริการทดสอบ',
          unit: 'รายการ',
          quantity: 1,
          unitPrice: 500,
          vatable: true,
        },
      ],
    });
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    const payment = await payments.create(env.seed.companyId, env.seed.userId, {
      direction: 'IN',
      partnerId: env.seed.customerId,
      paymentDate: '2026-05-12',
      amount: '535',
      sourceType: 'SALES_DOCUMENT',
      sourceId: draft.id,
    });

    const entry = await env.prisma.journalEntry.findFirst({
      where: {
        companyId: env.seed.companyId,
        sourceType: 'PAYMENT',
        sourceId: payment.id,
        status: 'POSTED',
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    expect(entry).not.toBeNull();
    expectEntryBalanced(entry!);
  });

  it('rejects unbalanced manual post via JournalService (JOURNAL_UNBALANCED)', async () => {
    const { JournalService } = await import('./journal.service');
    const service = env.app.get(JournalService);
    await expect(
      service.post({
        companyId: env.seed.companyId,
        userId: env.seed.userId,
        entryDate: '2026-05-13',
        description: 'unbalanced manual',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '5000', accountName: 'exp', debit: '100' },
          { accountCode: '1110', accountName: 'cash', credit: '99' },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'JOURNAL_UNBALANCED' }),
    });
  });
});