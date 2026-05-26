import {
  bootstrapTestEnv,
  seedMinimum,
  teardownTestEnv,
  truncateAll,
  type TestEnv,
} from '../../../test/setup-integration';
import { FromReceiptsService } from './from-receipts.service';

describe('FromReceiptsService.createQuotation (integration)', () => {
  let env: TestEnv;
  let service: FromReceiptsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(FromReceiptsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  beforeEach(async () => {
    await truncateAll(env.prisma);
    env.seed = await seedMinimum(env.prisma);
  });

  it('creates a NEW catalog product + a DRAFT quotation linked to it', async () => {
    const { companyId, userId, customerId } = env.seed;
    const before = await env.prisma.product.count({ where: { companyId } });

    const qt = await service.createQuotation(companyId, userId, {
      customerId,
      documentDate: '2026-05-26',
      items: [
        {
          decision: 'NEW',
          nameTh: 'สินค้าใหม่จากใบเสร็จ',
          unit: 'ชิ้น',
          quantity: 2,
          unitPrice: 130,
          productType: 'GOOD',
          vatable: true,
        },
      ],
    });

    expect(qt.id).toBeTruthy();
    expect(qt.status).toBe('DRAFT');
    expect(qt.number).toMatch(/^DRAFT-/); // number allocated only at confirm()

    const after = await env.prisma.product.count({ where: { companyId } });
    expect(after).toBe(before + 1);

    const newProd = await env.prisma.product.findFirst({
      where: { companyId, nameTh: 'สินค้าใหม่จากใบเสร็จ' },
    });
    expect(newProd).toBeTruthy();
    expect(newProd?.type).toBe('GOOD');
    expect(Number(newProd?.unitPrice)).toBe(130);

    const doc = await env.prisma.salesDocument.findUnique({
      where: { id: qt.id },
      include: { items: true },
    });
    expect(doc?.type).toBe('QUOTATION');
    expect(Number(doc?.whtRate)).toBe(1); // goods resale → 1% WHT (standard rule)
    expect(doc?.items).toHaveLength(1);
    expect(doc?.items[0]?.productId).toBe(newProd?.id);
    expect(Number(doc?.items[0]?.quantity)).toBe(2);
    expect(Number(doc?.items[0]?.unitPrice)).toBe(130);
  });

  it('reuses an EXISTING product without creating a duplicate', async () => {
    const { companyId, userId, customerId, productId } = env.seed;
    const before = await env.prisma.product.count({ where: { companyId } });

    const qt = await service.createQuotation(companyId, userId, {
      customerId,
      documentDate: '2026-05-26',
      items: [
        {
          decision: 'EXISTING',
          productId,
          nameTh: 'บริการทดสอบ',
          unit: 'รายการ',
          quantity: 1,
          unitPrice: 1500,
        },
      ],
    });

    const after = await env.prisma.product.count({ where: { companyId } });
    expect(after).toBe(before); // no new product created

    const doc = await env.prisma.salesDocument.findUnique({
      where: { id: qt.id },
      include: { items: true },
    });
    expect(doc?.items[0]?.productId).toBe(productId);
    expect(Number(doc?.items[0]?.unitPrice)).toBe(1500);
  });

  it('rejects when the customer does not exist (customer is mandatory)', async () => {
    const { companyId, userId, productId } = env.seed;
    await expect(
      service.createQuotation(companyId, userId, {
        customerId: 'does-not-exist',
        documentDate: '2026-05-26',
        items: [
          {
            decision: 'EXISTING',
            productId,
            nameTh: 'บริการทดสอบ',
            unit: 'รายการ',
            quantity: 1,
            unitPrice: 10,
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it('rejects an EXISTING item whose productId is not in the company', async () => {
    const { companyId, userId, customerId } = env.seed;
    await expect(
      service.createQuotation(companyId, userId, {
        customerId,
        documentDate: '2026-05-26',
        items: [
          {
            decision: 'EXISTING',
            productId: 'not-a-real-product',
            nameTh: 'x',
            unit: 'ชิ้น',
            quantity: 1,
            unitPrice: 10,
          },
        ],
      }),
    ).rejects.toThrow();
  });
});
