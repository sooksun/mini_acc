import { RisksService } from './risks.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

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

  it('scan is idempotent — re-running does not duplicate risk rows', async () => {
    const before = await service.list(env.seed.companyId, {});
    await service.scan(env.seed.companyId);
    const after = await service.list(env.seed.companyId, {});
    expect(after.total).toBe(before.total);
  });
});
