/**
 * Render one sample PDF per sales document type so a human reviewer can open
 * them and visually compare with `Invoice-PP-003-2569.pdf` (the master).
 *
 * Run: pnpm --filter @hj/api run pdf:samples
 * Output: apps/api/var/pdf-samples/{type}-sample.pdf
 *
 * The sample data is hardcoded — this script does NOT touch the database.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import type { Company, SalesDocument, SalesDocumentItem } from '@prisma/client';
import type { DocumentType } from '@hj/shared-types';
import { chromium } from 'playwright';
import { buildPdfHtml } from '../src/pdf/pdf-templates/layout';

const dec = (n: string) => new Prisma.Decimal(n);

const company: Company = {
  id: 'co-1',
  nameTh: 'หจก. โซลูชั่น เนกซ์เจน',
  nameEn: 'SOLUTIONS NEXTGEN LIMITED PARTNERSHIP',
  taxId: '0573567001472',
  address:
    '468/449 หมู่ 3 ต.บ้านดู่ อ.เมืองเชียงราย จ.เชียงราย 57100\nVillage No. 3, Ban Du Subdistrict, Mueang Chiang Rai District, Chiang Rai Province 57100',
  phone: '081-277-1948',
  email: 'contact@solutionsnextgen.co.th',
  brandShort: 'SN',
  tagline: 'NEXTGEN',
  registeredAt: new Date('2024-05-09T00:00:00Z'),
  vatEffectiveDate: new Date('2024-07-08T00:00:00Z'),
  capital: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleItems: SalesDocumentItem[] = [
  {
    id: 'i-1',
    salesDocumentId: 'doc-1',
    productId: null,
    lineNumber: 1,
    productCode: 'SVC',
    description: 'ออกแบบและพัฒนาเว็บไซต์ระบบสนับสนุนภารกิจ ภาคเรียน ที่ 1 (ต้น)',
    unit: 'รายการ',
    quantity: dec('1'),
    unitPrice: dec('100000'),
    discount: dec('0'),
    lineTotal: dec('100000'),
    vatable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function sampleDoc(type: DocumentType, number: string): SalesDocument & { items: SalesDocumentItem[] } {
  const base: SalesDocument = {
    id: 'doc-1',
    companyId: 'co-1',
    type,
    number,
    beYear: 2569,
    status: 'USER_CONFIRMED',
    customerId: 'cust-1',
    projectId: null,
    parentDocumentId: null,
    documentDate: new Date('2026-05-10T00:00:00Z'),
    dueDate: null,
    reference: null,
    note: null,
    customerSnapshotName: 'องค์การบริหารส่วนตำบล ทดสอบ ปี 2568-2569',
    customerSnapshotAddress: 'เลขที่ 111 หมู่ 6 ต.ดอนชัย อ.เมืองเชียงราย จ.เชียงราย',
    customerSnapshotTaxId: '0994000675178',
    customerSnapshotBranch: null,
    subtotal: dec('100000'),
    vatRate: dec('7'),
    vatAmount: dec('7000'),
    totalAfterVat: dec('107000'),
    whtRate: dec('1'),
    whtAmount: dec('1000'),
    grandTotal: dec('107000'),
    netReceived: dec('106000'),
    confirmedAt: new Date(),
    confirmedBy: 'u-1',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    lockedAt: null,
    lockedBy: null,
    pdfPath: null,
    pdfGeneratedAt: null,
    pdfGeneratedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u-1',
  };
  return { ...base, items: sampleItems };
}

async function main() {
  const samples: Array<{ type: DocumentType; number: string }> = [
    { type: 'QUOTATION', number: 'QT-2569-0001' },
    { type: 'DELIVERY_NOTE', number: 'DN-2569-0001' },
    { type: 'INVOICE', number: 'INV-2569-0001' },
    { type: 'RECEIPT', number: 'RC-2569-0001' },
    { type: 'TAX_INVOICE', number: 'TAX-2569-0001' },
    { type: 'RECEIPT_TAX_INVOICE', number: 'RT-2569-0001' },
  ];

  const outDir = join(process.cwd(), 'var', 'pdf-samples');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const { type, number } of samples) {
      const html = buildPdfHtml({ company, doc: sampleDoc(type, number) });
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.setContent(html, { waitUntil: 'networkidle' });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
          preferCSSPageSize: true,
        });
        const path = join(outDir, `${type.toLowerCase()}-sample.pdf`);
        await writeFile(path, pdf);
        console.log(`✓ ${type.padEnd(22)} → ${path}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nเปิดดูเทียบกับ Invoice-PP-003-2569.pdf ที่ root ของ repo`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
