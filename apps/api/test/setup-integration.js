"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestApp = createTestApp;
exports.truncateAll = truncateAll;
exports.seedMinimum = seedMinimum;
exports.bootstrapTestEnv = bootstrapTestEnv;
exports.teardownTestEnv = teardownTestEnv;
const testing_1 = require("@nestjs/testing");
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/prisma/prisma.service");
const TABLES_FK_DEPENDENT_ORDER = [
    'SalesDocumentItem',
    'GeneratedPdf',
    'Attachment',
    'SalesDocument',
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
async function createTestApp() {
    const moduleRef = await testing_1.Test.createTestingModule({
        imports: [app_module_1.AppModule],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    const prisma = app.get(prisma_service_1.PrismaService);
    return { app, prisma };
}
async function truncateAll(prisma) {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES_FK_DEPENDENT_ORDER) {
        await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
    }
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}
async function seedMinimum(prisma, opts = {}) {
    const company = await prisma.company.create({
        data: {
            nameTh: 'หจก. ทดสอบ',
            taxId: '0000000000001',
            address: 'ที่อยู่ทดสอบ',
            registeredAt: new Date('2024-01-01T00:00:00+07:00'),
            vatEffectiveDate: opts.vatEffectiveDate === null
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
    };
    for (const [type, prefix] of Object.entries(rules)) {
        await prisma.documentNumberingRule.create({
            data: {
                companyId: company.id,
                type: type,
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
async function bootstrapTestEnv(opts = {}) {
    const { app, prisma } = await createTestApp();
    await truncateAll(prisma);
    const seed = await seedMinimum(prisma, opts);
    return { app, prisma, seed };
}
async function teardownTestEnv(env) {
    await env.prisma.$disconnect();
    await env.app.close();
}
