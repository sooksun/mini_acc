import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
  'AuditLog',
  'CompanyVatStatus',
  'User',
  'Company',
];

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export async function truncateAll(prisma: PrismaService): Promise<void> {
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
