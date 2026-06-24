import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedChartAccounts } from '../src/journal/chart-accounts.seed';

export interface TestSeed {
  companyId: string;
  userId: string;
  customerId: string;
  customerNoTaxIdId: string;
  productId: string;
}

export interface TestEnv {
  app: INestApplication;
  prisma: PrismaService;
  seed: TestSeed;
}

const TABLES_FK_DEPENDENT_ORDER = [
  // Phase 2 children first (depend on Payment / JournalEntry / Project / etc.)
  'ForeignTaxObligation',
  'PrepaidScheduleEntry',
  'BankStatementLine',
  'WithholdingTaxRecord',
  'JournalEntryLine',
  'JournalEntry',
  'InventoryMovement',
  'FixedAsset',
  'VatRecord',
  'RiskItem',
  'AiSuggestion',
  'AccountingPeriod',
  'Payment',
  // Existing children
  'SalesDocumentItem',
  'GeneratedPdf',
  'ExportBatch',
  'Attachment',
  'ExpenseRecord',
  'ExpenseReceipt',
  'SalesDocument',
  // Project depends on Partner, but ExpenseRecord/FixedAsset depend on Project → drop Project after those
  'Project',
  'PartnerContact',
  'Partner',
  'Product',
  'DocumentNumberingCounter',
  'DocumentNumberingRule',
  'ChartAccount',
  'AuditLog',
  'CompanyVatStatus',
  'User',
  'Company',
];

/**
 * SAFETY: integration tests TRUNCATE the database. They must only ever run
 * against a dedicated test DB. If DATABASE_URL doesn't name a *_test database,
 * we throw before touching any data — this is what stops a bare `jest` run
 * (which falls back to the root .env → the DEV database via Nest's ConfigModule)
 * from wiping real data. Always run integration tests via
 * `pnpm --filter @hj/api test:integration`, which sets `-e .env.test`.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!/_test(\?|$|")/i.test(url) && !/test/i.test(url)) {
    const safe = url.replace(/:[^:@/]*@/, ':***@');
    throw new Error(
      `Refusing to run integration tests against a non-test database. ` +
        `DATABASE_URL must target a *_test database (got: "${safe}"). ` +
        `Use "pnpm --filter @hj/api test:integration" instead of bare jest.`,
    );
  }
}

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  assertTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export async function truncateAll(prisma: PrismaService): Promise<void> {
  assertTestDatabase();
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES_FK_DEPENDENT_ORDER) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

export async function seedMinimum(
  prisma: PrismaService,
  opts: { vatEffectiveDate?: Date | null } = {},
): Promise<TestSeed> {
  const company = await prisma.company.create({
    data: {
      nameTh: 'หจก. ทดสอบ',
      taxId: '0000000000001',
      address: 'ที่อยู่ทดสอบ',
      registeredAt: new Date('2024-01-01T00:00:00+07:00'),
      vatEffectiveDate:
        opts.vatEffectiveDate === null
          ? null
          : opts.vatEffectiveDate ?? new Date('2024-07-08T00:00:00+07:00'),
    },
  });

  await seedChartAccounts(prisma, company.id);

  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email: 'test@example.com',
      passwordHash: 'na',
      fullName: 'Test User',
      role: 'OWNER',
    },
  });

  const customer = await prisma.partner.create({
    data: {
      companyId: company.id,
      type: 'CUSTOMER',
      nameTh: 'ลูกค้าทดสอบ',
      taxId: '0000000000999',
      address: 'ที่อยู่ลูกค้า',
    },
  });

  const customerNoTaxId = await prisma.partner.create({
    data: {
      companyId: company.id,
      type: 'CUSTOMER',
      nameTh: 'ลูกค้าไม่มีเลขผู้เสียภาษี',
    },
  });

  const product = await prisma.product.create({
    data: {
      companyId: company.id,
      type: 'SERVICE',
      nameTh: 'บริการทดสอบ',
      unit: 'รายการ',
      unitPrice: 1000,
      vatable: true,
    },
  });

  const rules = {
    QUOTATION: 'QT',
    INVOICE: 'INV',
    DELIVERY_NOTE: 'DN',
    RECEIPT: 'RC',
    TAX_INVOICE: 'TAX',
    RECEIPT_TAX_INVOICE: 'RT',
  } as const;

  for (const [type, prefix] of Object.entries(rules)) {
    await prisma.documentNumberingRule.create({
      data: {
        companyId: company.id,
        type: type as keyof typeof rules,
        prefix,
        padding: 4,
        resetPolicy: 'YEARLY',
      },
    });
  }

  return {
    companyId: company.id,
    userId: user.id,
    customerId: customer.id,
    customerNoTaxIdId: customerNoTaxId.id,
    productId: product.id,
  };
}

export async function bootstrapTestEnv(
  opts: { vatEffectiveDate?: Date | null } = {},
): Promise<TestEnv> {
  const { app, prisma } = await createTestApp();
  await truncateAll(prisma);
  const seed = await seedMinimum(prisma, opts);
  return { app, prisma, seed };
}

export async function teardownTestEnv(env: TestEnv): Promise<void> {
  await env.prisma.$disconnect();
  await env.app.close();
}
