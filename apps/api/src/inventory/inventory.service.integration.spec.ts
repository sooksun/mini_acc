import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('InventoryService (integration)', () => {
  let env: TestEnv;
  let service: InventoryService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(InventoryService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  async function createProduct(code: string, name = 'สินค้าทดสอบ ' + code) {
    return env.prisma.product.create({
      data: {
        companyId: env.seed.companyId,
        type: 'GOOD',
        code,
        nameTh: name,
        unit: 'ชิ้น',
        unitPrice: '100',
      },
    });
  }

  describe('create — opening balance + add stock', () => {
    it('OPENING_BALANCE establishes initial stock', async () => {
      const product = await createProduct('P-1');
      const m = await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'OPENING_BALANCE',
        quantity: '50',
        movementDate: '2026-01-01',
      });
      expect(m.quantity).toBe('50');
      const stock = await service.stockOnHand(env.seed.companyId, product.id);
      expect(stock.toString()).toBe('50');
    });

    it('IN adds to stock', async () => {
      const product = await createProduct('P-2');
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'OPENING_BALANCE',
        quantity: '10',
        movementDate: '2026-01-01',
      });
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'IN',
        quantity: '5',
        movementDate: '2026-02-01',
        unitCost: '90',
      });
      const stock = await service.stockOnHand(env.seed.companyId, product.id);
      expect(stock.toString()).toBe('15');
    });
  });

  describe('OUT — stock-out guard (PRD §22.3 #7)', () => {
    it('refuses OUT that would drive stock negative', async () => {
      const product = await createProduct('P-3');
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'OPENING_BALANCE',
        quantity: '5',
        movementDate: '2026-01-01',
      });
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          productId: product.id,
          type: 'OUT',
          quantity: '6',
          movementDate: '2026-02-01',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STOCK_NEGATIVE' }),
      });
    });

    it('allows OUT up to available stock; stock reaches exactly 0', async () => {
      const product = await createProduct('P-4');
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'OPENING_BALANCE',
        quantity: '5',
        movementDate: '2026-01-01',
      });
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'OUT',
        quantity: '5',
        movementDate: '2026-02-01',
      });
      const stock = await service.stockOnHand(env.seed.companyId, product.id);
      expect(stock.toString()).toBe('0');
    });

    it('RETURN_OUT also goes through stock-out guard', async () => {
      const product = await createProduct('P-5');
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'IN',
        quantity: '2',
        movementDate: '2026-01-01',
      });
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          productId: product.id,
          type: 'RETURN_OUT',
          quantity: '3',
          movementDate: '2026-02-01',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STOCK_NEGATIVE' }),
      });
    });
  });

  describe('RETURN_IN + ADJUST', () => {
    it('RETURN_IN adds back to stock', async () => {
      const product = await createProduct('P-6');
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'IN',
        quantity: '10',
        movementDate: '2026-01-01',
      });
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'OUT',
        quantity: '7',
        movementDate: '2026-02-01',
      });
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'RETURN_IN',
        quantity: '2',
        movementDate: '2026-03-01',
      });
      const stock = await service.stockOnHand(env.seed.companyId, product.id);
      expect(stock.toString()).toBe('5'); // 10 − 7 + 2
    });

    it('ADJUST treated as positive (matches IN semantics)', async () => {
      const product = await createProduct('P-7');
      await service.create(env.seed.companyId, env.seed.userId, {
        productId: product.id,
        type: 'ADJUST',
        quantity: '3',
        movementDate: '2026-01-01',
      });
      const stock = await service.stockOnHand(env.seed.companyId, product.id);
      expect(stock.toString()).toBe('3');
    });
  });

  describe('validation', () => {
    it('refuses quantity = 0', async () => {
      const product = await createProduct('P-8');
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          productId: product.id,
          type: 'IN',
          quantity: '0',
          movementDate: '2026-01-01',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'QUANTITY_REQUIRED' }),
      });
    });

    it('refuses unknown product', async () => {
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          productId: 'no-such-product',
          type: 'IN',
          quantity: '1',
          movementDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('stockSummary', () => {
    it('returns one row per active GOOD/MATERIAL product with current on-hand', async () => {
      const summary = await service.stockSummary(env.seed.companyId);
      expect(summary.length).toBeGreaterThan(0);
      // Each row has productId, onHand (string), stockValue (string)
      for (const row of summary) {
        expect(typeof row.onHand).toBe('string');
        expect(typeof row.stockValue).toBe('string');
      }
    });
  });
});
