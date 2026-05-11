import { NotFoundException } from '@nestjs/common';
import { NumberingService } from './numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('NumberingService (integration)', () => {
  let env: TestEnv;
  let numbering: NumberingService;
  let prisma: PrismaService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    numbering = env.app.get(NumberingService);
    prisma = env.prisma;
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('peek does NOT increment counter', async () => {
    const date = new Date('2026-05-10T03:00:00Z');
    const peeked1 = await numbering.peek(env.seed.companyId, 'QUOTATION', date);
    const peeked2 = await numbering.peek(env.seed.companyId, 'QUOTATION', date);
    expect(peeked1).toBe('QT-2569-0001');
    expect(peeked2).toBe('QT-2569-0001');

    const counter = await prisma.documentNumberingCounter.findUnique({
      where: {
        companyId_type_beYear: {
          companyId: env.seed.companyId,
          type: 'QUOTATION',
          beYear: 2569,
        },
      },
    });
    expect(counter).toBeNull();
  });

  it('allocate increments and returns formatted number', async () => {
    const date = new Date('2026-05-11T03:00:00Z');
    const result = await prisma.$transaction((tx) =>
      numbering.allocate(env.seed.companyId, 'INVOICE', date, tx),
    );
    expect(result.number).toBe('INV-2569-0001');
    expect(result.counterValue).toBe(1);
    expect(result.beYear).toBe(2569);
  });

  it('parallel allocates produce unique sequential numbers (race-safe)', async () => {
    const date = new Date('2026-05-12T03:00:00Z');
    const N = 10;

    // truncate any prior counter for RECEIPT to start clean
    await prisma.documentNumberingCounter.deleteMany({
      where: { companyId: env.seed.companyId, type: 'RECEIPT' },
    });

    const allocate = () =>
      prisma.$transaction((tx) =>
        numbering.allocate(env.seed.companyId, 'RECEIPT', date, tx),
      );

    const results = await Promise.all(Array.from({ length: N }, () => allocate()));
    const numbers = results.map((r) => r.number);

    expect(new Set(numbers).size).toBe(N);

    const sorted = [...numbers].sort();
    const expected = Array.from(
      { length: N },
      (_, i) => `RC-2569-${String(i + 1).padStart(4, '0')}`,
    );
    expect(sorted).toEqual(expected);

    const counter = await prisma.documentNumberingCounter.findUnique({
      where: {
        companyId_type_beYear: {
          companyId: env.seed.companyId,
          type: 'RECEIPT',
          beYear: 2569,
        },
      },
    });
    expect(counter?.currentValue).toBe(N);
  });

  it('separate beYear → separate counter (yearly reset)', async () => {
    const date2569 = new Date('2026-12-31T16:00:00Z'); // 2026-12-31 23:00 +07 → BE 2569
    const date2570 = new Date('2027-01-15T03:00:00Z'); // BE 2570

    await prisma.documentNumberingCounter.deleteMany({
      where: { companyId: env.seed.companyId, type: 'DELIVERY_NOTE' },
    });

    const a = await prisma.$transaction((tx) =>
      numbering.allocate(env.seed.companyId, 'DELIVERY_NOTE', date2569, tx),
    );
    const b = await prisma.$transaction((tx) =>
      numbering.allocate(env.seed.companyId, 'DELIVERY_NOTE', date2570, tx),
    );

    expect(a.number).toBe('DN-2569-0001');
    expect(b.number).toBe('DN-2570-0001');

    const counters = await prisma.documentNumberingCounter.findMany({
      where: { companyId: env.seed.companyId, type: 'DELIVERY_NOTE' },
      orderBy: { beYear: 'asc' },
    });
    expect(counters).toHaveLength(2);
    expect(counters[0]!.beYear).toBe(2569);
    expect(counters[1]!.beYear).toBe(2570);
  });

  it('throws NotFoundException when no rule exists for type', async () => {
    // delete the rule for TAX_INVOICE then try to allocate
    await prisma.documentNumberingRule.deleteMany({
      where: { companyId: env.seed.companyId, type: 'TAX_INVOICE' },
    });

    await expect(
      numbering.peek(env.seed.companyId, 'TAX_INVOICE', new Date()),
    ).rejects.toThrow(NotFoundException);
  });
});
