import { Prisma } from '@prisma/client';
import type { Company, SalesDocument, SalesDocumentItem } from '@prisma/client';
import type { DocumentType } from '@hj/shared-types';
import { buildPdfHtml } from './layout';

function fakeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'co-1',
    nameTh: 'หจก. โซลูชั่น เนกซ์เจน',
    nameEn: 'Solutions Nextgen LP',
    taxId: '0573567001472',
    address: '468/449 หมู่ 3 ต.บ้านดู่ อ.เมืองเชียงราย จ.เชียงราย 57100',
    phone: '081-277-1948',
    email: null,
    brandShort: 'SN',
    tagline: 'NEXTGEN',
    registeredAt: new Date('2024-05-09T00:00:00Z'),
    vatEffectiveDate: new Date('2024-07-08T00:00:00Z'),
    capital: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeDoc(
  type: DocumentType,
  overrides: Partial<SalesDocument> = {},
): SalesDocument & { items: SalesDocumentItem[] } {
  const dec = (n: string) => new Prisma.Decimal(n);
  const base: SalesDocument = {
    id: 'doc-1',
    companyId: 'co-1',
    type,
    number: `INV-2569-0001`,
    beYear: 2569,
    status: 'USER_CONFIRMED',
    customerId: 'cust-1',
    projectId: null,
    parentDocumentId: null,
    documentDate: new Date('2026-05-10T00:00:00Z'),
    dueDate: null,
    reference: null,
    note: null,
    customerSnapshotName: 'บริษัท ทดสอบ จำกัด',
    customerSnapshotAddress: '111 หมู่ 6 ต.ดอนชัย อ.เมืองเชียงราย จ.เชียงราย',
    customerSnapshotTaxId: '0994000675178',
    customerSnapshotBranch: null,
    subtotal: dec('100000'),
    vatRate: dec('7'),
    vatAmount: dec('7000'),
    totalAfterVat: dec('107000'),
    whtRate: dec('0'),
    whtAmount: dec('0'),
    grandTotal: dec('107000'),
    netReceived: dec('107000'),
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
    ...overrides,
  };
  const item: SalesDocumentItem = {
    id: 'item-1',
    salesDocumentId: base.id,
    productId: null,
    lineNumber: 1,
    productCode: 'SVC',
    description: 'ออกแบบและพัฒนาเว็บไซต์',
    unit: 'รายการ',
    quantity: dec('1'),
    unitPrice: dec('100000'),
    discount: dec('0'),
    lineTotal: dec('100000'),
    vatable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, items: [item] };
}

describe('buildPdfHtml', () => {
  describe('per-type title + signatures (PRD §10.2, §13)', () => {
    const cases: Array<[DocumentType, string, string]> = [
      ['QUOTATION', 'ใบเสนอราคา', 'ผู้สั่งสินค้า'],
      ['DELIVERY_NOTE', 'ใบส่งของ', 'ผู้รับสินค้า'],
      ['INVOICE', 'ใบแจ้งหนี้', 'ผู้สั่งซื้อ'],
      ['RECEIPT', 'ใบเสร็จรับเงิน', 'ผู้จ่ายเงิน'],
      ['TAX_INVOICE', 'ใบกำกับภาษี', 'ผู้ซื้อ'],
      ['RECEIPT_TAX_INVOICE', 'ใบเสร็จรับเงิน/ใบกำกับภาษี', 'ผู้จ่ายเงิน'],
    ];

    it.each(cases)('%s renders title %s and left signature %s', (type, title, leftSig) => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc(type) });
      expect(html).toContain(title);
      expect(html).toContain(leftSig);
    });
  });

  describe('summary box (PRD §12.2 — 5 rows)', () => {
    it('renders all 5 required English labels', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('INVOICE') });
      // PRD §12.2: รวมเงิน / VAT / รวมหลัง VAT / WHT / NET RECEIVED
      expect(html).toContain('TOTAL AMOUNT');
      expect(html).toContain('VAT');
      expect(html).toContain('TOTAL AFTER VAT');
      expect(html).toContain('WITHHOLDING TAX');
      expect(html).toContain('NET RECEIVED');
    });
  });

  describe('VAT documents — original/copy stamp', () => {
    it('TAX_INVOICE defaults to ต้นฉบับ stamp', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('TAX_INVOICE') });
      expect(html).toContain('class="oc-badge badge-original"');
      expect(html).toContain('ต้นฉบับ');
    });

    it('RECEIPT_TAX_INVOICE defaults to ต้นฉบับ stamp', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('RECEIPT_TAX_INVOICE') });
      expect(html).toContain('class="oc-badge badge-original"');
    });

    it('explicit สำเนา override produces COPY stamp', () => {
      const html = buildPdfHtml({
        company: fakeCompany(),
        doc: fakeDoc('TAX_INVOICE'),
        originalCopy: 'สำเนา',
      });
      expect(html).toContain('class="oc-badge badge-copy"');
      expect(html).toContain('สำเนา');
    });

    it('non-VAT docs have no stamp', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('QUOTATION') });
      // The CSS rule `.oc-badge { ... }` is always in the <style> block; check
      // that no actual <div class="oc-badge"> is rendered.
      expect(html).not.toContain('<div class="oc-badge');
    });
  });

  describe('legal subtitle under title', () => {
    it('VAT docs render legal subtitle', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('TAX_INVOICE') });
      expect(html).toContain('title-subtitle');
      expect(html).toContain('Tax Invoice');
    });

    it('non-VAT docs have no subtitle', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('QUOTATION') });
      // CSS rule for .title-subtitle is in the <style> block regardless; check
      // that no actual <div class="title-subtitle"> is rendered.
      expect(html).not.toContain('<div class="title-subtitle">');
    });
  });

  describe('Delivery Note received-note position', () => {
    it('received-note appears AFTER notes block and BEFORE signatures', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('DELIVERY_NOTE') });
      const notesIdx = html.indexOf('class="notes"');
      const receivedIdx = html.indexOf('class="received-note"');
      const signaturesIdx = html.indexOf('class="signatures"');
      expect(notesIdx).toBeGreaterThan(-1);
      expect(receivedIdx).toBeGreaterThan(notesIdx);
      expect(signaturesIdx).toBeGreaterThan(receivedIdx);
    });

    it('non-Delivery doc types do not render received-note', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('INVOICE') });
      expect(html).not.toContain('class="received-note"');
    });
  });

  describe('header — multi-line address support', () => {
    it('renders each line of company.address with newlines as separate <div>', () => {
      const html = buildPdfHtml({
        company: fakeCompany({
          address: '468/449 หมู่ 3 ต.บ้านดู่ อ.เมืองเชียงราย จ.เชียงราย 57100\n468/449 Village No. 3, Ban Du Subdistrict, Mueang Chiang Rai',
        }),
        doc: fakeDoc('INVOICE'),
      });
      // Both lines should appear
      expect(html).toContain('สำนักงานใหญ่ : 468/449 หมู่ 3');
      expect(html).toContain('Village No. 3, Ban Du Subdistrict');
    });
  });

  describe('PRD §10.1 — all 16 required sections present', () => {
    it('all required structural elements are in the HTML', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('INVOICE') });
      // (1) brand mark, (2-6) company info, (7) สำหรับลูกค้า, (8) title box,
      // (9-11) customer/number/date, (12) items table, (13) amount-in-words,
      // (14) summary, (15) notes, (16) signatures
      expect(html).toContain('class="brand-mark"');
      expect(html).toContain('class="company-name-th"');
      expect(html).toContain('class="company-name-en"');
      expect(html).toContain('class="for-customer"');
      expect(html).toContain('class="title-box"');
      expect(html).toContain('class="meta-grid"');
      expect(html).toContain('class="items"');
      expect(html).toContain('class="amount-words"');
      expect(html).toContain('class="summary"');
      expect(html).toContain('class="notes"');
      expect(html).toContain('class="signatures"');
    });
  });

  describe('amount in words (PRD §12.3)', () => {
    it('renders Thai baht text for grandTotal', () => {
      const html = buildPdfHtml({ company: fakeCompany(), doc: fakeDoc('INVOICE') });
      // grandTotal = 107,000 → "หนึ่งแสนเจ็ดพันบาทถ้วน"
      expect(html).toContain('หนึ่งแสนเจ็ดพันบาทถ้วน');
    });
  });

  describe('DRAFT placeholder vs real number', () => {
    it('DRAFT- prefix renders with italic styling', () => {
      const html = buildPdfHtml({
        company: fakeCompany(),
        doc: fakeDoc('QUOTATION', { number: 'DRAFT-ABCD1234' }),
      });
      expect(html).toContain('font-style:italic');
      expect(html).toContain('DRAFT-ABCD1234');
    });

    it('real number renders bold without italic', () => {
      const html = buildPdfHtml({
        company: fakeCompany(),
        doc: fakeDoc('QUOTATION', { number: 'QT-2569-0001' }),
      });
      expect(html).toContain('<strong>QT-2569-0001</strong>');
    });
  });

  describe('throws on unknown doc type', () => {
    it('throws Error with informative message', () => {
      expect(() =>
        buildPdfHtml({
          company: fakeCompany(),
          doc: fakeDoc('PURCHASE' as DocumentType),
        }),
      ).toThrow(/Unsupported document type/);
    });
  });
});
