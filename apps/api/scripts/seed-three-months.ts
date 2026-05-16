/* eslint-disable no-console */
/**
 * Seed 3 เดือนของข้อมูลตัวอย่าง (ก.พ.–เม.ย. 2569) ครอบคลุม:
 *   - master: customers, vendors, products, projects, fixed assets
 *   - sales:  QUOTATION / INVOICE / RECEIPT / TAX_INVOICE / RECEIPT_TAX_INVOICE (USER_CONFIRMED)
 *   - VAT:    OUTPUT (จากเอกสารขาย VAT) + INPUT (จากค่าใช้จ่ายที่มี VAT)
 *   - payments: IN (รับชำระ — บางรายลูกค้าหัก WHT) + OUT (จ่ายผู้ขาย — หัก WHT 3%)
 *   - WHT:    PAYABLE (เราหักผู้ขาย) + RECEIVABLE (ลูกค้าหักเรา)
 *   - expense receipts + records พร้อม VAT INPUT cascade
 *   - inventory movements (ซื้อเข้า/ขายออก)
 *
 * Idempotent: ลบ entities ที่ seed รอบก่อน (เช็คจาก note prefix '[SEED-3M]') ก่อนสร้างใหม่.
 */
import { PrismaClient, Prisma, type DocumentType } from '@prisma/client';

const COMPANY_ID = 'cmp0hkov90000s1o3f9zppm73';
const OWNER_ID = 'cmp0hkoxk0004s1o3bggftglb';
const SEED_TAG = '[SEED-3M]';

const prisma = new PrismaClient();

const dec = (v: number | string): Prisma.Decimal => new Prisma.Decimal(v);
const beYear = (year: number): number => year + 543;
const date = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day, 4, 0, 0));

async function allocateNumber(
  tx: Prisma.TransactionClient,
  type: DocumentType,
  documentDate: Date,
): Promise<{ number: string; be: number }> {
  const rule = await tx.documentNumberingRule.findUniqueOrThrow({
    where: { companyId_type: { companyId: COMPANY_ID, type } },
  });
  const be = beYear(documentDate.getFullYear());
  const counter = await tx.documentNumberingCounter.upsert({
    where: { companyId_type_beYear: { companyId: COMPANY_ID, type, beYear: be } },
    create: { companyId: COMPANY_ID, type, beYear: be, currentValue: 1 },
    update: { currentValue: { increment: 1 } },
  });
  const padded = counter.currentValue.toString().padStart(rule.padding, '0');
  return { number: `${rule.prefix}-${be}-${padded}`, be };
}

// ─────────────────────────────────────────────────────────
// CLEANUP — ลบ seed รอบก่อน (ดูจาก note หรือ name prefix)
// ─────────────────────────────────────────────────────────
async function cleanupPrevious() {
  // 1) wht records linked to payments tagged
  const payments = await prisma.payment.findMany({
    where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  await prisma.withholdingTaxRecord.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });

  // 2) sales docs tagged
  const docs = await prisma.salesDocument.findMany({
    where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } },
    select: { id: true },
  });
  const docIds = docs.map((d) => d.id);
  await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: { in: docIds } } });
  await prisma.vatRecord.deleteMany({ where: { sourceType: 'SALES_DOCUMENT', sourceId: { in: docIds } } });
  await prisma.salesDocument.deleteMany({ where: { id: { in: docIds } } });

  // 3) expense records + their receipts tagged
  const expenses = await prisma.expenseRecord.findMany({
    where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } },
    select: { id: true, receiptId: true },
  });
  const expenseIds = expenses.map((e) => e.id);
  const receiptIds = expenses.map((e) => e.receiptId);
  await prisma.vatRecord.deleteMany({ where: { sourceType: 'EXPENSE_RECORD', sourceId: { in: expenseIds } } });
  // remove FK link from fixed asset before delete
  await prisma.fixedAsset.updateMany({ where: { expenseRecordId: { in: expenseIds } }, data: { expenseRecordId: null } });
  await prisma.expenseRecord.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.expenseReceipt.deleteMany({ where: { id: { in: receiptIds } } });

  // 4) inventory movements tagged
  await prisma.inventoryMovement.deleteMany({
    where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } },
  });

  // 5) fixed assets tagged
  await prisma.fixedAsset.deleteMany({
    where: { companyId: COMPANY_ID, name: { startsWith: SEED_TAG } },
  });

  // 6) projects tagged
  await prisma.project.deleteMany({
    where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } },
  });

  // 7) numbering counters 2569 — reset
  await prisma.documentNumberingCounter.deleteMany({
    where: { companyId: COMPANY_ID, beYear: 2569 },
  });

  console.log('cleanup done');
}

// ─────────────────────────────────────────────────────────
// MASTER DATA
// ─────────────────────────────────────────────────────────

const CUSTOMER_SPECS = [
  {
    code: 'CUST-TECH-01',
    nameTh: 'บริษัท เทคโนโลยี ไทย จำกัด',
    nameEn: 'Tech Thailand Co., Ltd.',
    taxId: '0105556012345',
    branch: '00000',
    address: '88/8 ถนนพระรามที่ 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
    phone: '02-555-1234',
    email: 'contact@tech-thailand.co.th',
  },
  {
    code: 'CUST-IND-01',
    nameTh: 'นายภูมิ สมชาย',
    nameEn: 'Mr. Phum Somchai',
    taxId: '1100800123456',
    address: '199 หมู่ 4 ตำบลสันป่าตอง อำเภอสันป่าตอง จังหวัดเชียงใหม่ 50120',
    phone: '081-234-5678',
  },
];

const VENDOR_SPECS = [
  {
    code: 'VEND-SOFT-01',
    nameTh: 'บริษัท ซอฟต์แวร์เฮ้าส์ จำกัด',
    taxId: '0105561023456',
    branch: '00000',
    address: '99 อาคารทาวเวอร์ ชั้น 10 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพมหานคร 10110',
    phone: '02-665-9988',
  },
  {
    code: 'VEND-IT-01',
    nameTh: 'บริษัท ไอที เซอร์วิส จำกัด',
    taxId: '0105562034567',
    branch: '00000',
    address: '55 ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
    phone: '02-694-3322',
  },
  {
    code: 'VEND-FREE-01',
    nameTh: 'นางสาวศิริ นักออกแบบ',
    taxId: '1100400567890',
    address: '15/2 หมู่ 5 ตำบลในเมือง อำเภอเมือง จังหวัดเชียงราย 57000',
    phone: '089-123-4567',
  },
  {
    code: 'VEND-REPAIR-01',
    nameTh: 'นายสมหมาย ช่างซ่อม',
    taxId: '1571200789012',
    address: '40 หมู่ 8 ตำบลเวียง อำเภอเชียงแสน จังหวัดเชียงราย 57150',
    phone: '085-678-9012',
  },
];

const PRODUCT_SPECS = [
  { code: 'SVC-WEB', nameTh: 'งานพัฒนาเว็บไซต์', unitPrice: '80000', unit: 'งาน', type: 'SERVICE' as const, vatable: true },
  { code: 'SVC-APP', nameTh: 'งานพัฒนาแอป Mobile', unitPrice: '120000', unit: 'งาน', type: 'SERVICE' as const, vatable: true },
  { code: 'SVC-CONSULT', nameTh: 'ที่ปรึกษาด้าน IT รายเดือน', unitPrice: '25000', unit: 'เดือน', type: 'SERVICE' as const, vatable: true },
  { code: 'SVC-TRAIN', nameTh: 'ค่าฝึกอบรมพนักงาน', unitPrice: '2500', unit: 'คน-วัน', type: 'SERVICE' as const, vatable: true },
  { code: 'GOODS-PC', nameTh: 'คอมพิวเตอร์ตั้งโต๊ะ DELL OptiPlex', unitPrice: '28000', unit: 'เครื่อง', type: 'GOOD' as const, vatable: true },
  { code: 'GOODS-MON', nameTh: 'จอภาพ LG 27 นิ้ว', unitPrice: '7500', unit: 'เครื่อง', type: 'GOOD' as const, vatable: true },
];

async function ensurePartners() {
  const result: Record<string, any> = {};
  for (const c of CUSTOMER_SPECS) {
    result[c.code] = await prisma.partner.upsert({
      where: { companyId_code: { companyId: COMPANY_ID, code: c.code } },
      create: { companyId: COMPANY_ID, type: 'CUSTOMER', ...c },
      update: {
        nameTh: c.nameTh,
        nameEn: c.nameEn,
        taxId: c.taxId,
        branch: 'branch' in c ? c.branch : null,
        address: c.address,
        phone: c.phone,
        email: 'email' in c ? c.email : null,
      },
    });
  }
  for (const v of VENDOR_SPECS) {
    result[v.code] = await prisma.partner.upsert({
      where: { companyId_code: { companyId: COMPANY_ID, code: v.code } },
      create: { companyId: COMPANY_ID, type: 'VENDOR', ...v },
      update: {
        nameTh: v.nameTh,
        taxId: v.taxId,
        branch: 'branch' in v ? v.branch : null,
        address: v.address,
        phone: v.phone,
      },
    });
  }
  // pull additional pre-existing partners we'll reference
  const old = await prisma.partner.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: 'CUST-001' } },
  });
  if (old) result['CUST-001'] = old;
  const vatFix = await prisma.partner.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: 'CUST-VAT-FIX' } },
  });
  if (vatFix) result['CUST-VAT-01'] = vatFix;

  return result;
}

async function ensureProducts() {
  const result: Record<string, any> = {};
  for (const p of PRODUCT_SPECS) {
    result[p.code] = await prisma.product.upsert({
      where: { companyId_code: { companyId: COMPANY_ID, code: p.code } },
      create: {
        companyId: COMPANY_ID,
        ...p,
        unitPrice: dec(p.unitPrice),
        isActive: true,
      },
      update: {
        nameTh: p.nameTh,
        unitPrice: dec(p.unitPrice),
        unit: p.unit,
        type: p.type,
        vatable: p.vatable,
      },
    });
  }
  return result;
}

async function ensureProjects(customers: Record<string, any>) {
  return Promise.all([
    prisma.project.create({
      data: {
        companyId: COMPANY_ID,
        code: 'PRJ-ACC-' + Math.random().toString(36).slice(2, 6),
        name: 'ระบบบัญชี HJ Account AI',
        customerId: customers['CUST-TECH-01']?.id,
        status: 'ACTIVE',
        startDate: date(2026, 2, 1),
        budget: dec(500000),
        note: `${SEED_TAG} โปรเจกต์พัฒนาระบบบัญชีหลัก`,
      },
    }),
    prisma.project.create({
      data: {
        companyId: COMPANY_ID,
        code: 'PRJ-ECOM-' + Math.random().toString(36).slice(2, 6),
        name: 'ระบบ E-Commerce',
        customerId: customers['CUST-TECH-01']?.id,
        status: 'ACTIVE',
        startDate: date(2026, 3, 1),
        budget: dec(300000),
        note: `${SEED_TAG} ระบบขายของออนไลน์`,
      },
    }),
  ]);
}

async function ensureFixedAssets() {
  return Promise.all([
    prisma.fixedAsset.create({
      data: {
        companyId: COMPANY_ID,
        code: 'FA-MBP-' + Math.random().toString(36).slice(2, 6),
        name: `${SEED_TAG} MacBook Pro M3 Pro 14 นิ้ว`,
        category: 'อุปกรณ์คอมพิวเตอร์',
        status: 'ACTIVE',
        acquiredAt: date(2026, 2, 5),
        cost: dec(85000),
        salvageValue: dec(5000),
        usefulLifeMonths: 60,
        accumulatedDepr: dec(0),
        bookValue: dec(85000),
      },
    }),
    prisma.fixedAsset.create({
      data: {
        companyId: COMPANY_ID,
        code: 'FA-DESK-' + Math.random().toString(36).slice(2, 6),
        name: `${SEED_TAG} โต๊ะทำงานปรับระดับได้`,
        category: 'เฟอร์นิเจอร์สำนักงาน',
        status: 'ACTIVE',
        acquiredAt: date(2026, 3, 15),
        cost: dec(18000),
        salvageValue: dec(1000),
        usefulLifeMonths: 60,
        accumulatedDepr: dec(0),
        bookValue: dec(18000),
      },
    }),
  ]);
}

// ─────────────────────────────────────────────────────────
// HELPERS — สร้างเอกสาร / payment / expense ที่สอดคล้อง schema
// ─────────────────────────────────────────────────────────

type SaleItem = {
  productId?: string | null;
  productCode?: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  vatable?: boolean;
};

async function createConfirmedSalesDoc(args: {
  type: DocumentType;
  customer: any;
  documentDate: Date;
  dueDate?: Date;
  items: SaleItem[];
  vatRate?: number;
  whtRate?: number;
  note: string;
  parentDocumentId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const { number, be } = await allocateNumber(tx, args.type, args.documentDate);
    const vatRate = args.vatRate ?? 0;
    const whtRate = args.whtRate ?? 0;

    const lineTotals = args.items.map((it) =>
      dec(it.quantity).mul(dec(it.unitPrice)).toDecimalPlaces(2),
    );
    const subtotal = lineTotals.reduce((s, x) => s.add(x), dec(0));
    const vatAmount = vatRate > 0 ? subtotal.mul(vatRate).div(100).toDecimalPlaces(2) : dec(0);
    const totalAfterVat = subtotal.add(vatAmount);
    const whtAmount = whtRate > 0 ? subtotal.mul(whtRate).div(100).toDecimalPlaces(2) : dec(0);
    const grandTotal = totalAfterVat;
    const netReceived = totalAfterVat.sub(whtAmount);

    const doc = await tx.salesDocument.create({
      data: {
        companyId: COMPANY_ID,
        type: args.type,
        number,
        beYear: be,
        status: 'USER_CONFIRMED',
        customerId: args.customer.id,
        documentDate: args.documentDate,
        dueDate: args.dueDate,
        note: args.note,
        customerSnapshotName: args.customer.nameTh,
        customerSnapshotAddress: args.customer.address,
        customerSnapshotTaxId: args.customer.taxId,
        customerSnapshotBranch: args.customer.branch,
        subtotal,
        vatRate: dec(vatRate),
        vatAmount,
        totalAfterVat,
        whtRate: dec(whtRate),
        whtAmount,
        grandTotal,
        netReceived,
        confirmedAt: args.documentDate,
        confirmedBy: OWNER_ID,
        createdBy: OWNER_ID,
        parentDocumentId: args.parentDocumentId,
        items: {
          create: args.items.map((it, idx) => ({
            lineNumber: idx + 1,
            productId: it.productId ?? null,
            productCode: it.productCode ?? null,
            description: it.description,
            unit: it.unit,
            quantity: dec(it.quantity),
            unitPrice: dec(it.unitPrice),
            discount: dec(0),
            lineTotal: lineTotals[idx]!,
            vatable: it.vatable ?? true,
          })),
        },
      },
    });

    // VAT record เฉพาะเอกสารภาษี (ใบกำกับภาษี + ใบเสร็จ/ใบกำกับภาษี) เท่านั้น
    // QUOTATION/INVOICE/DELIVERY_NOTE/RECEIPT ไม่ใช่เอกสารทางภาษี — แม้แสดง VAT
    // ใน body เพื่อความสะดวก ก็ไม่นับใน VAT report.
    const isVatBearing = args.type === 'TAX_INVOICE' || args.type === 'RECEIPT_TAX_INVOICE';
    if (isVatBearing && vatAmount.gt(0)) {
      await tx.vatRecord.create({
        data: {
          companyId: COMPANY_ID,
          recordType: 'OUTPUT',
          sourceType: 'SALES_DOCUMENT',
          sourceId: doc.id,
          documentDate: args.documentDate,
          documentNumber: number,
          partnerName: args.customer.nameTh,
          partnerTaxId: args.customer.taxId,
          baseAmount: subtotal,
          vatRate: dec(vatRate),
          vatAmount,
          periodYear: args.documentDate.getUTCFullYear(),
          periodMonth: args.documentDate.getUTCMonth() + 1,
        },
      });
    }
    return doc;
  });
}

async function createPaymentIn(args: {
  customer: any;
  paymentDate: Date;
  amount: Prisma.Decimal;
  whtAmount?: Prisma.Decimal;
  whtBaseAmount?: Prisma.Decimal;
  whtRate?: number;
  whtCategory?: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD' | 'PROMPT_PAY' | 'OTHER';
  reference?: string;
  sourceDocId?: string;
  note: string;
}) {
  return prisma.$transaction(async (tx) => {
    const whtAmount = args.whtAmount ?? dec(0);
    const payment = await tx.payment.create({
      data: {
        companyId: COMPANY_ID,
        direction: 'IN',
        partnerId: args.customer.id,
        paymentDate: args.paymentDate,
        amount: args.amount,
        whtAmount,
        method: args.method,
        reference: args.reference,
        status: 'COMPLETED',
        sourceType: args.sourceDocId ? 'SALES_DOCUMENT' : null,
        sourceId: args.sourceDocId,
        note: args.note,
        recordedBy: OWNER_ID,
      },
    });
    if (whtAmount.gt(0) && args.whtBaseAmount && args.whtRate) {
      await tx.withholdingTaxRecord.create({
        data: {
          companyId: COMPANY_ID,
          recordType: 'RECEIVABLE',
          paymentId: payment.id,
          sourceType: 'PAYMENT',
          sourceId: payment.id,
          paidAt: args.paymentDate,
          partnerName: args.customer.nameTh,
          partnerTaxId: args.customer.taxId,
          baseAmount: args.whtBaseAmount,
          rate: dec(args.whtRate),
          whtAmount,
          category: args.whtCategory,
          periodYear: args.paymentDate.getUTCFullYear(),
          periodMonth: args.paymentDate.getUTCMonth() + 1,
        },
      });
    }
    return payment;
  });
}

async function createExpenseWithPayment(args: {
  vendor: any;
  expenseDate: Date;
  documentNumber: string;
  category: string;
  subtotal: Prisma.Decimal;
  vatRate: number;
  whtRate: number;
  whtCategory?: string;
  projectId?: string | null;
  method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD' | 'PROMPT_PAY' | 'OTHER';
  certNumber?: string;
  note: string;
}) {
  return prisma.$transaction(async (tx) => {
    const vatAmount = args.vatRate > 0 ? args.subtotal.mul(args.vatRate).div(100).toDecimalPlaces(2) : dec(0);
    const whtAmount = args.whtRate > 0 ? args.subtotal.mul(args.whtRate).div(100).toDecimalPlaces(2) : dec(0);
    const grandTotal = args.subtotal.add(vatAmount);
    const netPaid = grandTotal.sub(whtAmount);

    // 1) ExpenseReceipt (จำลองว่า upload PDF แล้ว account แล้ว)
    const receipt = await tx.expenseReceipt.create({
      data: {
        companyId: COMPANY_ID,
        status: 'ACCOUNTED',
        vendorId: args.vendor.id,
        proposedVendorName: args.vendor.nameTh,
        proposedVendorTaxId: args.vendor.taxId,
        proposedVendorBranch: args.vendor.branch,
        proposedVendorAddress: args.vendor.address,
        documentNumber: args.documentNumber,
        documentDate: args.expenseDate,
        paidAt: args.expenseDate,
        category: args.category,
        note: args.note,
        subtotal: args.subtotal,
        vatAmount,
        withholdingTaxAmount: whtAmount,
        grandTotal,
        // fake file metadata เพราะไม่ได้ upload จริง
        originalFileName: `${args.documentNumber}.pdf`,
        storedPath: `ai-inbox/${COMPANY_ID}/seed-${args.documentNumber}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 12345,
        sha256: null,
        uploadedBy: OWNER_ID,
        reviewedBy: OWNER_ID,
        reviewedAt: args.expenseDate,
        accountedBy: OWNER_ID,
        accountedAt: args.expenseDate,
      },
    });
    // 2) ExpenseRecord
    const expense = await tx.expenseRecord.create({
      data: {
        companyId: COMPANY_ID,
        receiptId: receipt.id,
        vendorId: args.vendor.id,
        projectId: args.projectId ?? null,
        status: 'RECORDED',
        expenseDate: args.expenseDate,
        documentNumber: args.documentNumber,
        category: args.category,
        note: args.note,
        subtotal: args.subtotal,
        vatAmount,
        withholdingTaxAmount: whtAmount,
        grandTotal,
        recordedBy: OWNER_ID,
      },
    });
    // 3) VAT input record (ถ้ามี VAT)
    if (vatAmount.gt(0)) {
      await tx.vatRecord.create({
        data: {
          companyId: COMPANY_ID,
          recordType: 'INPUT',
          sourceType: 'EXPENSE_RECORD',
          sourceId: expense.id,
          documentDate: args.expenseDate,
          documentNumber: args.documentNumber,
          partnerName: args.vendor.nameTh,
          partnerTaxId: args.vendor.taxId,
          baseAmount: args.subtotal,
          vatRate: dec(args.vatRate),
          vatAmount,
          periodYear: args.expenseDate.getUTCFullYear(),
          periodMonth: args.expenseDate.getUTCMonth() + 1,
        },
      });
    }
    // 4) Payment OUT
    const payment = await tx.payment.create({
      data: {
        companyId: COMPANY_ID,
        direction: 'OUT',
        partnerId: args.vendor.id,
        paymentDate: args.expenseDate,
        amount: netPaid,
        whtAmount,
        method: args.method,
        reference: args.documentNumber,
        status: 'COMPLETED',
        sourceType: 'EXPENSE_RECORD',
        sourceId: expense.id,
        note: args.note,
        recordedBy: OWNER_ID,
      },
    });
    // 5) WHT PAYABLE (ถ้ามี)
    if (whtAmount.gt(0)) {
      await tx.withholdingTaxRecord.create({
        data: {
          companyId: COMPANY_ID,
          recordType: 'PAYABLE',
          paymentId: payment.id,
          sourceType: 'PAYMENT',
          sourceId: payment.id,
          paidAt: args.expenseDate,
          partnerName: args.vendor.nameTh,
          partnerTaxId: args.vendor.taxId,
          baseAmount: args.subtotal,
          rate: dec(args.whtRate),
          whtAmount,
          certNumber: args.certNumber,
          category: args.whtCategory,
          periodYear: args.expenseDate.getUTCFullYear(),
          periodMonth: args.expenseDate.getUTCMonth() + 1,
        },
      });
    }
    return { receipt, expense, payment };
  });
}

// ─────────────────────────────────────────────────────────
// PER MONTH
// ─────────────────────────────────────────────────────────

async function seedMonth(
  year: number,
  month: number,
  ctx: {
    customers: Record<string, any>;
    products: Record<string, any>;
    projects: any[];
  },
) {
  const monthNames = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  console.log(`\n=== ${monthNames[month]} ${beYear(year)} ===`);

  const techCust = ctx.customers['CUST-TECH-01'];
  const vatCust = ctx.customers['CUST-VAT-01'] ?? ctx.customers['CUST-TECH-01'];
  const indCust = ctx.customers['CUST-IND-01'];
  const schoolCust = ctx.customers['CUST-001']; // โรงเรียน (no taxId, non-VAT)

  // ───── 1) TAX_INVOICE 90,000 + VAT 7% (ลูกค้านิติบุคคล หัก WHT 3%)
  const taxDoc = await createConfirmedSalesDoc({
    type: 'TAX_INVOICE',
    customer: techCust,
    documentDate: date(year, month, 10),
    items: [
      { productId: ctx.products['SVC-WEB'].id, productCode: 'SVC-WEB', description: 'งานพัฒนาเว็บไซต์ ระยะที่ 1', unit: 'งาน', quantity: '1', unitPrice: '80000' },
      { productId: ctx.products['SVC-TRAIN'].id, productCode: 'SVC-TRAIN', description: 'ค่าฝึกอบรมการใช้งานระบบ', unit: 'คน-วัน', quantity: '4', unitPrice: '2500' },
    ],
    vatRate: 7,
    note: `${SEED_TAG} ใบกำกับภาษีตัวอย่างเดือน ${monthNames[month]}`,
  });
  await createPaymentIn({
    customer: techCust,
    paymentDate: date(year, month, 20),
    amount: dec(90000).mul('1.07').sub(dec(90000).mul('0.03').toDecimalPlaces(2)),
    whtAmount: dec(90000).mul('0.03').toDecimalPlaces(2),
    whtBaseAmount: dec(90000),
    whtRate: 3,
    whtCategory: 'ค่าจ้างทำของ — 40(8)',
    method: 'BANK_TRANSFER',
    reference: `TRF-${taxDoc.number}`,
    sourceDocId: taxDoc.id,
    note: `${SEED_TAG} รับชำระจาก ${techCust.nameTh}`,
  });

  // ───── 2) RECEIPT_TAX_INVOICE 25,000 + VAT 7% (รับเงินสด/ไม่หัก WHT)
  if (vatCust) {
    const rtDoc = await createConfirmedSalesDoc({
      type: 'RECEIPT_TAX_INVOICE',
      customer: vatCust,
      documentDate: date(year, month, 25),
      items: [
        { productId: ctx.products['SVC-CONSULT'].id, productCode: 'SVC-CONSULT', description: 'ที่ปรึกษา IT รายเดือน', unit: 'เดือน', quantity: '1', unitPrice: '25000' },
      ],
      vatRate: 7,
      note: `${SEED_TAG} ใบเสร็จ/ใบกำกับภาษีตัวอย่าง`,
    });
    await createPaymentIn({
      customer: vatCust,
      paymentDate: date(year, month, 25),
      amount: dec(25000).mul('1.07'),
      method: 'CASH',
      reference: rtDoc.number,
      sourceDocId: rtDoc.id,
      note: `${SEED_TAG} รับเงินสดพร้อมใบเสร็จ`,
    });
  }

  // ───── 3) INVOICE (non-VAT) → RECEIPT (โรงเรียน)
  if (schoolCust) {
    const invDoc = await createConfirmedSalesDoc({
      type: 'INVOICE',
      customer: schoolCust,
      documentDate: date(year, month, 15),
      items: [
        { productId: null, productCode: null, description: `งานพัฒนาระบบเรียนออนไลน์ ระยะที่ ${month - 1}`, unit: 'งาน', quantity: '1', unitPrice: '35000', vatable: false },
      ],
      vatRate: 0,
      note: `${SEED_TAG} ใบแจ้งหนี้โรงเรียน (non-VAT)`,
    });
    const rcDoc = await createConfirmedSalesDoc({
      type: 'RECEIPT',
      customer: schoolCust,
      documentDate: date(year, month, 18),
      items: [
        { productId: null, productCode: null, description: `งานพัฒนาระบบเรียนออนไลน์ ระยะที่ ${month - 1}`, unit: 'งาน', quantity: '1', unitPrice: '35000', vatable: false },
      ],
      vatRate: 0,
      note: `${SEED_TAG} ใบเสร็จรับเงิน อ้างอิงใบแจ้งหนี้ ${invDoc.number}`,
      parentDocumentId: invDoc.id,
    });
    await createPaymentIn({
      customer: schoolCust,
      paymentDate: date(year, month, 18),
      amount: dec(35000),
      method: 'BANK_TRANSFER',
      reference: rcDoc.number,
      sourceDocId: rcDoc.id,
      note: `${SEED_TAG} โอนเงินจาก ${schoolCust.nameTh}`,
    });
  }

  // ───── 4) QUOTATION (รอลูกค้าตอบกลับ — แสดง pipeline)
  if (indCust) {
    await createConfirmedSalesDoc({
      type: 'QUOTATION',
      customer: indCust,
      documentDate: date(year, month, 28),
      dueDate: date(year, Math.min(month + 1, 12), 28),
      items: [
        { productId: ctx.products['SVC-APP'].id, productCode: 'SVC-APP', description: 'งานพัฒนาแอปพลิเคชัน Mobile', unit: 'งาน', quantity: '1', unitPrice: '120000' },
      ],
      vatRate: 7,
      note: `${SEED_TAG} ใบเสนอราคา รอลูกค้าตอบกลับ`,
    });
  }

  // ───── 5) Expense: ค่าบริการ IT (PND53, juristic, VAT input)
  const itVendor = await prisma.partner.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: 'VEND-IT-01' } },
  });
  if (itVendor) {
    await createExpenseWithPayment({
      vendor: itVendor,
      expenseDate: date(year, month, 7),
      documentNumber: `IT-INV-${year}${month.toString().padStart(2, '0')}`,
      category: 'ค่าบริการ IT รายเดือน',
      subtotal: dec(15000),
      vatRate: 7,
      whtRate: 3,
      whtCategory: 'ค่าจ้างทำของ — 40(8)',
      projectId: ctx.projects[0]?.id,
      method: 'BANK_TRANSFER',
      certNumber: `CERT-IT-${year}${month.toString().padStart(2, '0')}`,
      note: `${SEED_TAG} ค่าบริการดูแลระบบเดือน ${monthNames[month]}`,
    });
  }

  // ───── 6) Expense: ค่าออกแบบฟรีแลนซ์ (PND3, individual, no VAT)
  const freelance = await prisma.partner.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: 'VEND-FREE-01' } },
  });
  if (freelance) {
    await createExpenseWithPayment({
      vendor: freelance,
      expenseDate: date(year, month, 12),
      documentNumber: `DSGN-${year}${month.toString().padStart(2, '0')}`,
      category: 'ค่าจ้างฟรีแลนซ์',
      subtotal: dec(8000),
      vatRate: 0,
      whtRate: 3,
      whtCategory: 'วิชาชีพอิสระ — 40(6)',
      projectId: ctx.projects[1]?.id,
      method: 'PROMPT_PAY',
      certNumber: `CERT-DSGN-${year}${month.toString().padStart(2, '0')}`,
      note: `${SEED_TAG} ค่าออกแบบ UI/UX`,
    });
  }

  // ───── 7) Expense: ค่า License (VAT input, no WHT — ซื้อสินค้า)
  const softVendor = await prisma.partner.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: 'VEND-SOFT-01' } },
  });
  if (softVendor) {
    await createExpenseWithPayment({
      vendor: softVendor,
      expenseDate: date(year, month, 5),
      documentNumber: `LIC-${year}${month.toString().padStart(2, '0')}`,
      category: 'ค่าซอฟต์แวร์/License',
      subtotal: dec(12000),
      vatRate: 7,
      whtRate: 0,
      method: 'CREDIT_CARD',
      note: `${SEED_TAG} License เครื่องมือพัฒนา`,
    });
  }

  // ───── 8) Inventory: ซื้อสินค้าเข้าสต็อก + ขายออก
  const pc = ctx.products['GOODS-PC'];
  const mon = ctx.products['GOODS-MON'];
  const buyDate = date(year, month, 8);
  const sellDate = date(year, month, 22);
  await prisma.inventoryMovement.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        productId: pc.id,
        type: 'IN',
        quantity: dec(3),
        movementDate: buyDate,
        unitCost: dec(25000),
        totalCost: dec(75000),
        referenceType: 'PURCHASE',
        referenceId: `PO-${year}${month}-PC`,
        note: `${SEED_TAG} ซื้อ PC 3 เครื่องเข้าสต็อก`,
        recordedBy: OWNER_ID,
      },
      {
        companyId: COMPANY_ID,
        productId: mon.id,
        type: 'IN',
        quantity: dec(5),
        movementDate: buyDate,
        unitCost: dec(6500),
        totalCost: dec(32500),
        referenceType: 'PURCHASE',
        referenceId: `PO-${year}${month}-MON`,
        note: `${SEED_TAG} ซื้อจอภาพ 5 เครื่อง`,
        recordedBy: OWNER_ID,
      },
      {
        companyId: COMPANY_ID,
        productId: pc.id,
        type: 'OUT',
        quantity: dec(1),
        movementDate: sellDate,
        unitCost: dec(25000),
        totalCost: dec(25000),
        referenceType: 'SALE',
        referenceId: `SO-${year}${month}-PC`,
        note: `${SEED_TAG} ขาย PC 1 เครื่อง`,
        recordedBy: OWNER_ID,
      },
    ],
  });

  console.log(`  ✓ ${monthNames[month]} done`);
}

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding 3 months (ก.พ.–เม.ย. 2569)...');

  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  if (!company) throw new Error(`Company ${COMPANY_ID} not found — run prisma seed first`);
  const owner = await prisma.user.findUnique({ where: { id: OWNER_ID } });
  if (!owner) throw new Error(`Owner user ${OWNER_ID} not found`);

  await cleanupPrevious();

  const partners = await ensurePartners();
  const products = await ensureProducts();
  const projects = await ensureProjects(partners);
  await ensureFixedAssets();

  console.log(
    `master data ready: ${Object.values(partners).filter((p: any) => p.type === 'CUSTOMER').length} customers, ` +
    `${Object.values(partners).filter((p: any) => p.type === 'VENDOR').length} vendors, ` +
    `${Object.keys(products).length} products, ${projects.length} projects`,
  );

  const ctx = { customers: partners, products, projects };

  for (const month of [2, 3, 4]) {
    await seedMonth(2026, month, ctx);
  }

  // Summary
  console.log('\n=== Summary ===');
  const counts = {
    salesDocs_seed: await prisma.salesDocument.count({ where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } } }),
    vatRecords: await prisma.vatRecord.count({ where: { companyId: COMPANY_ID, periodYear: 2026, periodMonth: { in: [2, 3, 4] } } }),
    whtRecords: await prisma.withholdingTaxRecord.count({ where: { companyId: COMPANY_ID, periodYear: 2026, periodMonth: { in: [2, 3, 4] } } }),
    payments_seed: await prisma.payment.count({ where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } } }),
    expenses_seed: await prisma.expenseRecord.count({ where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } } }),
    inventoryMoves_seed: await prisma.inventoryMovement.count({ where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } } }),
    fixedAssets_seed: await prisma.fixedAsset.count({ where: { companyId: COMPANY_ID, name: { startsWith: SEED_TAG } } }),
    projects_seed: await prisma.project.count({ where: { companyId: COMPANY_ID, note: { startsWith: SEED_TAG } } }),
  };
  console.log(JSON.stringify(counts, null, 2));

  console.log('\nVAT/WHT breakdown by month:');
  for (const month of [2, 3, 4]) {
    const vatOut = await prisma.vatRecord.aggregate({
      where: { companyId: COMPANY_ID, recordType: 'OUTPUT', periodYear: 2026, periodMonth: month },
      _sum: { vatAmount: true },
    });
    const vatIn = await prisma.vatRecord.aggregate({
      where: { companyId: COMPANY_ID, recordType: 'INPUT', periodYear: 2026, periodMonth: month },
      _sum: { vatAmount: true },
    });
    const whtPay = await prisma.withholdingTaxRecord.aggregate({
      where: { companyId: COMPANY_ID, recordType: 'PAYABLE', periodYear: 2026, periodMonth: month },
      _sum: { whtAmount: true },
    });
    const whtRecv = await prisma.withholdingTaxRecord.aggregate({
      where: { companyId: COMPANY_ID, recordType: 'RECEIVABLE', periodYear: 2026, periodMonth: month },
      _sum: { whtAmount: true },
    });
    console.log(
      `  เดือน ${month}/2569: ` +
      `VAT_out=${vatOut._sum.vatAmount?.toString() ?? '0'}, ` +
      `VAT_in=${vatIn._sum.vatAmount?.toString() ?? '0'}, ` +
      `WHT_payable=${whtPay._sum.whtAmount?.toString() ?? '0'}, ` +
      `WHT_recv=${whtRecv._sum.whtAmount?.toString() ?? '0'}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
