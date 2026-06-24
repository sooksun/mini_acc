import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ChartAccountsService } from './chart-accounts.service';
import { JournalService } from '../journal/journal.service';
import { bootstrapTestEnv, teardownTestEnv, TestEnv } from '../../test/setup-integration';

describe('ChartAccountsService (integration)', () => {
  let env: TestEnv;
  let service: ChartAccountsService;
  let journal: JournalService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(ChartAccountsService);
    journal = env.app.get(JournalService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('seeds the system chart (1110 cash, 3300 retained earnings) as protected rows', async () => {
    const accounts = await service.list(env.seed.companyId);
    const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
    expect(byCode['1110']?.isSystem).toBe(true);
    expect(byCode['1110']?.type).toBe('ASSET');
    expect(byCode['1490']?.normalBalance).toBe('CREDIT'); // contra-asset
    expect(byCode['3300']?.name).toBe('กำไรสะสม');
    expect(byCode['4110']?.type).toBe('REVENUE');
  });

  it('creates a custom account and rejects a duplicate code', async () => {
    const created = await service.create(env.seed.companyId, {
      code: '6000',
      name: 'ต้นทุนขาย',
      type: 'EXPENSE',
    });
    expect(created.isSystem).toBe(false);
    expect(created.normalBalance).toBe('DEBIT'); // derived from type

    await expect(
      service.create(env.seed.companyId, { code: '6000', name: 'ซ้ำ', type: 'EXPENSE' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a system account be renamed but locks its structure', async () => {
    const accounts = await service.list(env.seed.companyId);
    const cash = accounts.find((a) => a.code === '1110')!;

    const renamed = await service.update(env.seed.companyId, cash.id, { name: 'เงินสดในมือ' });
    expect(renamed.name).toBe('เงินสดในมือ');

    await expect(
      service.update(env.seed.companyId, cash.id, { type: 'LIABILITY' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(env.seed.companyId, cash.id, { isActive: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to delete a system account, but deletes an unused custom one', async () => {
    const accounts = await service.list(env.seed.companyId);
    const cash = accounts.find((a) => a.code === '1110')!;
    await expect(service.remove(env.seed.companyId, cash.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const tmp = await service.create(env.seed.companyId, {
      code: '6999',
      name: 'บัญชีชั่วคราว',
      type: 'EXPENSE',
    });
    const res = await service.remove(env.seed.companyId, tmp.id);
    expect(res.deleted).toBe(true);
  });

  it('locks type/normalBalance once a custom account has postings (rename still allowed)', async () => {
    const acc = await service.create(env.seed.companyId, {
      code: '6200',
      name: 'บัญชีทดสอบล็อกประเภท',
      type: 'EXPENSE',
    });
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-03-05T03:00:00.000Z'),
      description: 'ใช้บัญชี 6200',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '6200', accountName: 'บัญชีทดสอบล็อกประเภท', debit: 50 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 50 },
      ],
    });
    // Changing type after it's used is blocked…
    await expect(
      service.update(env.seed.companyId, acc.id, { type: 'ASSET' }),
    ).rejects.toBeInstanceOf(ConflictException);
    // …but renaming the same account is fine.
    const renamed = await service.update(env.seed.companyId, acc.id, { name: 'ชื่อใหม่' });
    expect(renamed.name).toBe('ชื่อใหม่');
  });

  it('refuses to delete a custom account once it is used in the journal', async () => {
    const acc = await service.create(env.seed.companyId, {
      code: '6100',
      name: 'ค่าใช้จ่ายพิเศษ',
      type: 'EXPENSE',
    });
    await journal.post({
      companyId: env.seed.companyId,
      userId: env.seed.userId,
      entryDate: new Date('2026-03-01T03:00:00.000Z'),
      description: 'ใช้บัญชี 6100',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '6100', accountName: 'ค่าใช้จ่ายพิเศษ', debit: 100 },
        { accountCode: '1110', accountName: 'เงินสด', credit: 100 },
      ],
    });
    await expect(service.remove(env.seed.companyId, acc.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
