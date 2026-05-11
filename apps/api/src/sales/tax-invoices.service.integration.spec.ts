import { BadRequestException } from '@nestjs/common';
import { TaxInvoicesService } from './tax-invoices.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

const baseDoc = (customerId: string, productId: string, documentDate: string) => ({
  customerId,
  documentDate,
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

describe('TaxInvoicesService VAT eligibility (integration)', () => {
  let env: TestEnv;
  let service: TaxInvoicesService;

  beforeAll(async () => {
    env = await bootstrapTestEnv({ vatEffectiveDate: new Date('2024-07-08T00:00:00+07:00') });
    service = env.app.get(TaxInvoicesService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('rejects when customer has no taxId (400 CUSTOMER_TAX_ID_REQUIRED)', async () => {
    await expect(
      service.create(
        env.seed.companyId,
        env.seed.userId,
        baseDoc(env.seed.customerNoTaxIdId, env.seed.productId, '2026-05-10T00:00:00+07:00'),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 400,
        code: 'CUSTOMER_TAX_ID_REQUIRED',
      }),
    });
  });

  it('rejects when documentDate < vatEffectiveDate (422 VAT_NOT_EFFECTIVE)', async () => {
    await expect(
      service.create(
        env.seed.companyId,
        env.seed.userId,
        baseDoc(env.seed.customerId, env.seed.productId, '2024-06-01T00:00:00+07:00'),
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'VAT_NOT_EFFECTIVE',
      }),
    });
  });

  it('passes when documentDate >= vatEffectiveDate', async () => {
    const result = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId, '2026-05-10T00:00:00+07:00'),
    );
    expect(result.type).toBe('TAX_INVOICE');
    expect(result.status).toBe('DRAFT');
    expect(result.number.startsWith('DRAFT-')).toBe(true);
    expect(result.customer.taxId).toBe('0000000000999'); // snapshot from seed
  });

  it('passes exactly on vatEffectiveDate (boundary)', async () => {
    const result = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId, '2024-07-08T00:00:00+07:00'),
    );
    expect(result.status).toBe('DRAFT');
  });

  it('checks taxId BEFORE VAT date (taxId error wins for missing-taxId customer with bad date)', async () => {
    await expect(
      service.create(
        env.seed.companyId,
        env.seed.userId,
        baseDoc(env.seed.customerNoTaxIdId, env.seed.productId, '2024-06-01T00:00:00+07:00'),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CUSTOMER_TAX_ID_REQUIRED' }),
    });
  });
});

describe('TaxInvoicesService VAT eligibility — company without VAT (integration)', () => {
  let env: TestEnv;
  let service: TaxInvoicesService;

  beforeAll(async () => {
    env = await bootstrapTestEnv({ vatEffectiveDate: null });
    service = env.app.get(TaxInvoicesService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('rejects when company has no vatEffectiveDate at all', async () => {
    await expect(
      service.create(
        env.seed.companyId,
        env.seed.userId,
        baseDoc(env.seed.customerId, env.seed.productId, '2026-05-10T00:00:00+07:00'),
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'VAT_NOT_EFFECTIVE',
      }),
    });
  });
});
