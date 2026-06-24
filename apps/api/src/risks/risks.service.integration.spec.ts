import { RisksService } from './risks.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

const receiptBase = (companyId: string) => ({
  companyId,
  originalFileName: 'receipt.pdf',
  storedPath: '/tmp/receipt.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
});

const salesDocBase = (companyId: string, customerId: string) => ({
  companyId,
  customerId,
  beYear: 2569,
  status: 'USER_CONFIRMED' as const,
  documentDate: new Date('2026-05-10'),
  customerSnapshotName: 'ลูกค้าทดสอบ',
  subtotal: '1000',
  vatRate: '7',
  vatAmount: '70',
  totalAfterVat: '1070',
  whtRate: '0',
  whtAmount: '0',
  grandTotal: '1070',
  netReceived: '1070',
});

describe('RisksService detectors (integration)', () => {
  let env: TestEnv;
  let service: RisksService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(RisksService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('detects DUPLICATE_DOCUMENT when a number repeats', async () => {
    // The (companyId, type, number) unique key allows the same number across
    // types — use that to create a genuine duplicate-number anomaly.
    await env.prisma.salesDocument.create({
      data: { ...salesDocBase(env.seed.companyId, env.seed.customerId), type: 'INVOICE', number: 'DUP-2569-0001' },
    });
    await env.prisma.salesDocument.create({
      data: { ...salesDocBase(env.seed.companyId, env.seed.customerId), type: 'RECEIPT', number: 'DUP-2569-0001' },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'DUPLICATE_DOCUMENT' });
    const hit = risks.items.find((r) => r.entityId === 'DUP-2569-0001');
    expect(hit).toBeDefined();
    expect(hit?.level).toBe('CRITICAL');
  });

  it('detects STOCK_NEGATIVE for a product pushed below zero', async () => {
    const good = await env.prisma.product.create({
      data: {
        companyId: env.seed.companyId,
        type: 'GOOD',
        nameTh: 'สินค้าติดลบ',
        unit: 'ชิ้น',
        unitPrice: '100',
        vatable: true,
      },
    });
    // Insert an OUT directly (bypassing the service stock-out guard).
    await env.prisma.inventoryMovement.create({
      data: {
        companyId: env.seed.companyId,
        productId: good.id,
        type: 'OUT',
        quantity: '3',
        movementDate: new Date('2026-05-05'),
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'STOCK_NEGATIVE' });
    const hit = risks.items.find((r) => r.entityId === good.id);
    expect(hit).toBeDefined();
    expect(hit?.level).toBe('CRITICAL');
  });

  it('detects VAT_RISK for a confirmed doc charging VAT before vatEffectiveDate', async () => {
    // seed vatEffectiveDate defaults to 2024-07-08; an INVOICE dated before that
    // with vatAmount > 0 charged VAT it wasn't yet registered to collect.
    await env.prisma.salesDocument.create({
      data: {
        ...salesDocBase(env.seed.companyId, env.seed.customerId),
        type: 'INVOICE',
        number: 'VATRISK-2567-0001',
        documentDate: new Date('2024-06-01'),
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'VAT_RISK' });
    expect(risks.items.length).toBeGreaterThan(0);
    expect(risks.items[0]?.level).toBe('HIGH');
  });

  it('detects WHT_RISK when a recorded expense withholds tax but vendor lacks taxId', async () => {
    const vendor = await env.prisma.partner.create({
      data: { companyId: env.seed.companyId, type: 'VENDOR', nameTh: 'ผู้ขายไม่มีเลขภาษี' },
    });
    const receipt = await env.prisma.expenseReceipt.create({
      data: { ...receiptBase(env.seed.companyId), status: 'ACCOUNTED' },
    });
    const record = await env.prisma.expenseRecord.create({
      data: {
        companyId: env.seed.companyId,
        receiptId: receipt.id,
        vendorId: vendor.id,
        expenseDate: new Date('2026-05-10'),
        documentNumber: 'EXP-WHT-001',
        subtotal: '1000',
        withholdingTaxAmount: '30',
        grandTotal: '1000',
        status: 'RECORDED',
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'WHT_RISK' });
    const hit = risks.items.find((r) => r.entityId === record.id);
    expect(hit).toBeDefined();
    expect(hit?.entityType).toBe('ExpenseRecord');
    expect(hit?.level).toBe('HIGH');
  });

  it('detects UNMATCHED_BANK for an unmatched line from a prior month', async () => {
    const line = await env.prisma.bankStatementLine.create({
      data: {
        companyId: env.seed.companyId,
        bankAccount: 'KBANK-001',
        postedAt: new Date('2024-01-15'),
        side: 'CREDIT',
        amount: '5000',
        description: 'เงินโอนเข้าไม่ทราบที่มา',
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'UNMATCHED_BANK' });
    const hit = risks.items.find((r) => r.entityId === line.id);
    expect(hit).toBeDefined();
    expect(hit?.level).toBe('HIGH');
  });

  it('detects LOW_PROFIT_PROJECT as HIGH (not CRITICAL) for a loss-making project', async () => {
    const project = await env.prisma.project.create({
      data: { companyId: env.seed.companyId, name: 'โครงการขาดทุน', status: 'ACTIVE' },
    });
    // revenue 1000 (ex-VAT subtotal)
    await env.prisma.salesDocument.create({
      data: {
        ...salesDocBase(env.seed.companyId, env.seed.customerId),
        type: 'INVOICE',
        number: 'LP-2569-0001',
        projectId: project.id,
      },
    });
    // cost 1100 → margin -10%
    const receipt = await env.prisma.expenseReceipt.create({
      data: { ...receiptBase(env.seed.companyId), status: 'ACCOUNTED' },
    });
    const vendor = await env.prisma.partner.create({
      data: { companyId: env.seed.companyId, type: 'VENDOR', nameTh: 'ผู้ขายต้นทุน', taxId: '0000000000111' },
    });
    await env.prisma.expenseRecord.create({
      data: {
        companyId: env.seed.companyId,
        receiptId: receipt.id,
        vendorId: vendor.id,
        projectId: project.id,
        expenseDate: new Date('2026-05-10'),
        subtotal: '1100',
        grandTotal: '1100',
        status: 'RECORDED',
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'LOW_PROFIT_PROJECT' });
    const hit = risks.items.find((r) => r.entityId === project.id);
    expect(hit).toBeDefined();
    // Must NOT be CRITICAL — closing.service hard-blocks month-end on open CRITICAL risks.
    expect(hit?.level).toBe('HIGH');
  });

  it('detects EXPENSE_WITHOUT_APPROVAL for a receipt stuck > 7 days', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const receipt = await env.prisma.expenseReceipt.create({
      data: {
        ...receiptBase(env.seed.companyId),
        status: 'UPLOADED',
        proposedVendorName: 'ร้านค้างนาน',
        createdAt: tenDaysAgo,
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'EXPENSE_WITHOUT_APPROVAL' });
    const hit = risks.items.find((r) => r.entityId === receipt.id);
    expect(hit).toBeDefined();
    expect(hit?.level).toBe('MEDIUM');
  });

  it('detects JOURNAL_UNBALANCED for a posted entry where Dr ≠ Cr', async () => {
    const entry = await env.prisma.journalEntry.create({
      data: {
        companyId: env.seed.companyId,
        entryDate: new Date('2026-05-10'),
        description: 'unbalanced anomaly',
        status: 'POSTED',
        sourceType: 'MANUAL',
        totalDebit: '100',
        totalCredit: '99',
        periodYear: 2569,
        periodMonth: 5,
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'JOURNAL_UNBALANCED' });
    const hit = risks.items.find((r) => r.entityId === entry.id);
    expect(hit).toBeDefined();
    expect(hit?.level).toBe('CRITICAL');
    expect(hit?.entityType).toBe('JournalEntry');
  });

  it('detects EDIT_AFTER_CONFIRM when a doc is updated after confirmedAt', async () => {
    const doc = await env.prisma.salesDocument.create({
      data: {
        ...salesDocBase(env.seed.companyId, env.seed.customerId),
        type: 'INVOICE',
        number: 'EDIT-2569-0001',
        confirmedAt: new Date('2026-05-01T00:00:00Z'),
      },
    });
    await env.prisma.auditLog.create({
      data: {
        companyId: env.seed.companyId,
        action: 'UPDATE_DOCUMENT',
        entityType: 'SalesDocument',
        entityId: doc.id,
        createdAt: new Date('2026-05-02T00:00:00Z'),
      },
    });

    await service.scan(env.seed.companyId);

    const risks = await service.list(env.seed.companyId, { type: 'EDIT_AFTER_CONFIRM' });
    const hit = risks.items.find((r) => r.entityId === doc.id);
    expect(hit).toBeDefined();
    expect(hit?.level).toBe('MEDIUM');
  });

  it('scan is idempotent — re-running does not duplicate risk rows', async () => {
    const before = await service.list(env.seed.companyId, {});
    await service.scan(env.seed.companyId);
    const after = await service.list(env.seed.companyId, {});
    expect(after.total).toBe(before.total);
  });
});
