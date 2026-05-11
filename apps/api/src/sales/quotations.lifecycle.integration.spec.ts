import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

const baseDoc = (customerId: string, productId: string) => ({
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

describe('Quotation lifecycle (integration)', () => {
  let env: TestEnv;
  let service: QuotationsService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(QuotationsService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('create returns DRAFT with placeholder number and snapshots customer', async () => {
    const draft = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    expect(draft.status).toBe('DRAFT');
    expect(draft.number.startsWith('DRAFT-')).toBe(true);
    expect(draft.customer.nameTh).toBe('ลูกค้าทดสอบ');
    expect(draft.customer.taxId).toBe('0000000000999');
    expect(draft.subtotal).toBe('1000');
    expect(draft.vatAmount).toBe('70');
    expect(draft.grandTotal).toBe('1070');
    expect(draft.items).toHaveLength(1);
  });

  it('confirm allocates real number QT-2569-NNNN and locks status', async () => {
    const draft = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );

    const confirmed = await service.confirm(
      env.seed.companyId,
      env.seed.userId,
      'OWNER',
      draft.id,
    );
    expect(confirmed.status).toBe('USER_CONFIRMED');
    expect(confirmed.number).toMatch(/^QT-2569-\d{4}$/);
    expect(confirmed.confirmedAt).not.toBeNull();
    expect(confirmed.confirmedBy).toBe(env.seed.userId);
  });

  it('confirm twice on same doc → InvalidTransitionError (422)', async () => {
    const draft = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await service.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    await expect(
      service.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('void preserves original number and persists reason', async () => {
    const draft = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    const confirmed = await service.confirm(
      env.seed.companyId,
      env.seed.userId,
      'OWNER',
      draft.id,
    );
    const realNumber = confirmed.number;

    const voided = await service.void(
      env.seed.companyId,
      env.seed.userId,
      'OWNER',
      draft.id,
      'ลูกค้ายกเลิก',
    );
    expect(voided.status).toBe('VOIDED');
    expect(voided.number).toBe(realNumber);
    expect(voided.voidReason).toBe('ลูกค้ายกเลิก');
    expect(voided.voidedAt).not.toBeNull();
  });

  it('void without reason → InvalidTransitionError', async () => {
    const draft = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await service.confirm(env.seed.companyId, env.seed.userId, 'OWNER', draft.id);

    await expect(
      service.void(env.seed.companyId, env.seed.userId, 'OWNER', draft.id, ''),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('AI_AGENT cannot confirm', async () => {
    const draft = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );

    await expect(
      service.confirm(env.seed.companyId, env.seed.userId, 'AI_AGENT', draft.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('list filters by status', async () => {
    const a = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    const b = await service.create(
      env.seed.companyId,
      env.seed.userId,
      baseDoc(env.seed.customerId, env.seed.productId),
    );
    await service.confirm(env.seed.companyId, env.seed.userId, 'OWNER', a.id);

    const draftsOnly = await service.list(env.seed.companyId, { status: 'DRAFT', take: 100 });
    const confirmedOnly = await service.list(env.seed.companyId, {
      status: 'USER_CONFIRMED',
      take: 100,
    });

    expect(draftsOnly.items.some((d) => d.id === b.id)).toBe(true);
    expect(draftsOnly.items.some((d) => d.id === a.id)).toBe(false);
    expect(confirmedOnly.items.some((d) => d.id === a.id)).toBe(true);
  });

  it('numbering is sequential across confirms (QT-2569-0001 then 0002 then 0003)', async () => {
    // bootstrap fresh to reset counter
    await env.prisma.documentNumberingCounter.deleteMany({
      where: { companyId: env.seed.companyId, type: 'QUOTATION' },
    });

    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const draft = await service.create(
        env.seed.companyId,
        env.seed.userId,
        baseDoc(env.seed.customerId, env.seed.productId),
      );
      const confirmed = await service.confirm(
        env.seed.companyId,
        env.seed.userId,
        'OWNER',
        draft.id,
      );
      numbers.push(confirmed.number);
    }

    expect(numbers).toEqual(['QT-2569-0001', 'QT-2569-0002', 'QT-2569-0003']);
  });
});
