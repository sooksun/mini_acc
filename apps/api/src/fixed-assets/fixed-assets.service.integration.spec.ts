import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FixedAssetsService } from './fixed-assets.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('FixedAssetsService (integration)', () => {
  let env: TestEnv;
  let service: FixedAssetsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(FixedAssetsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  describe('create', () => {
    it('creates asset with bookValue = cost, accumulatedDepr = 0', async () => {
      const asset = await service.create(env.seed.companyId, env.seed.userId, {
        name: 'Laptop',
        category: 'อุปกรณ์สำนักงาน',
        acquiredAt: '2026-01-01',
        cost: '30000',
        usefulLifeMonths: 60,
      });
      expect(asset.status).toBe('ACTIVE');
      expect(asset.cost).toBe('30000');
      expect(asset.bookValue).toBe('30000');
      expect(asset.accumulatedDepr).toBe('0');
      // monthlyDepr = (30000 − 0) / 60 = 500
      expect(asset.monthlyDepreciation).toBe('500');
    });

    it('refuses salvageValue ≥ cost', async () => {
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          name: 'Bad',
          category: 'อื่น',
          acquiredAt: '2026-01-01',
          cost: '100',
          salvageValue: '100',
          usefulLifeMonths: 12,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SALVAGE_EXCEEDS_COST' }),
      });
    });

    it('refuses duplicate code', async () => {
      await service.create(env.seed.companyId, env.seed.userId, {
        code: 'A-001',
        name: 'Asset 1',
        category: 'cat',
        acquiredAt: '2026-01-01',
        cost: '1000',
        usefulLifeMonths: 12,
      });
      await expect(
        service.create(env.seed.companyId, env.seed.userId, {
          code: 'A-001',
          name: 'Asset 2',
          category: 'cat',
          acquiredAt: '2026-01-01',
          cost: '1000',
          usefulLifeMonths: 12,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ASSET_CODE_TAKEN' }),
      });
    });
  });

  describe('dispose', () => {
    it('marks asset DISPOSED with reason; refuses double dispose', async () => {
      const asset = await service.create(env.seed.companyId, env.seed.userId, {
        name: 'To dispose',
        category: 'cat',
        acquiredAt: '2026-01-01',
        cost: '5000',
        usefulLifeMonths: 60,
      });
      const disposed = await service.dispose(env.seed.companyId, env.seed.userId, asset.id, {
        reason: 'ขายต่อ',
      });
      expect(disposed.status).toBe('DISPOSED');
      expect(disposed.disposalReason).toBe('ขายต่อ');
      await expect(
        service.dispose(env.seed.companyId, env.seed.userId, asset.id, { reason: 'ซ้ำ' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses unknown asset', async () => {
      await expect(
        service.dispose(env.seed.companyId, env.seed.userId, 'no-such', { reason: 'r' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('runDepreciation', () => {
    it('updates accumulatedDepr based on months elapsed (straight-line)', async () => {
      const asset = await service.create(env.seed.companyId, env.seed.userId, {
        code: 'DEPR-1',
        name: 'Old printer',
        category: 'office',
        // 12 months ago → 12 months of depreciation accrued
        acquiredAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        cost: '12000',
        usefulLifeMonths: 60,
      });
      // monthly = 12000/60 = 200; 12 months → 2400
      const result = await service.runDepreciation(env.seed.companyId);
      expect(result.assetsUpdated).toBeGreaterThan(0);
      const refreshed = await service.findOne(env.seed.companyId, asset.id);
      expect(Number(refreshed.accumulatedDepr)).toBeGreaterThan(0);
      expect(Number(refreshed.bookValue)).toBeLessThan(Number(refreshed.cost));
    });

    it('caps accumulatedDepr at (cost − salvage) — never exceeds', async () => {
      const asset = await service.create(env.seed.companyId, env.seed.userId, {
        code: 'DEPR-2',
        name: 'Fully amortized',
        category: 'office',
        // 100 months ago — way past 12-month life
        acquiredAt: new Date(Date.now() - 100 * 30 * 24 * 60 * 60 * 1000).toISOString(),
        cost: '12000',
        salvageValue: '1000',
        usefulLifeMonths: 12,
      });
      await service.runDepreciation(env.seed.companyId);
      const refreshed = await service.findOne(env.seed.companyId, asset.id);
      // Max depreciation = cost − salvage = 11000
      expect(Number(refreshed.accumulatedDepr)).toBeLessThanOrEqual(11000);
      expect(Number(refreshed.bookValue)).toBeGreaterThanOrEqual(1000);
    });

    it('idempotent — re-running same period does not double-charge', async () => {
      const before = await service.runDepreciation(env.seed.companyId);
      const after = await service.runDepreciation(env.seed.companyId);
      // No new updates between back-to-back runs (same asOf within milliseconds)
      expect(after.assetsUpdated).toBe(0);
    });

    it('skips DISPOSED assets', async () => {
      const asset = await service.create(env.seed.companyId, env.seed.userId, {
        code: 'DEPR-DISP',
        name: 'Disposed before depreciation',
        category: 'cat',
        acquiredAt: '2024-01-01',
        cost: '6000',
        usefulLifeMonths: 60,
      });
      await service.dispose(env.seed.companyId, env.seed.userId, asset.id, {
        reason: 'sold',
      });
      const before = await service.findOne(env.seed.companyId, asset.id);
      await service.runDepreciation(env.seed.companyId);
      const after = await service.findOne(env.seed.companyId, asset.id);
      expect(after.accumulatedDepr).toBe(before.accumulatedDepr);
    });
  });
});
