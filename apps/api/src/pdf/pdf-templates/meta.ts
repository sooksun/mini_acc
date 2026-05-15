import type { DocumentType } from '@hj/shared-types';

export interface PdfDocMeta {
  title: string;
  primaryColor: string;
  signatures: { left: string; middle: string; right: string };
  receivedNote?: string;
  /**
   * Thai Revenue Department requires every tax-invoice copy to be labeled
   * "ต้นฉบับ" (original) or "สำเนา" (copy). When set, the renderer stamps the
   * top-right corner of the page. Non-VAT docs leave this undefined.
   */
  defaultOriginalCopy?: 'ต้นฉบับ' | 'สำเนา';
  /**
   * Optional subtitle rendered under the title box — used for VAT docs to
   * clarify legal context (e.g. "ใบกำกับภาษีต้นฉบับ").
   */
  legalSubtitle?: string;
}

export const PDF_DOC_META: Record<
  | 'QUOTATION'
  | 'INVOICE'
  | 'DELIVERY_NOTE'
  | 'RECEIPT'
  | 'TAX_INVOICE'
  | 'RECEIPT_TAX_INVOICE',
  PdfDocMeta
> = {
  QUOTATION: {
    title: 'ใบเสนอราคา',
    primaryColor: '#8B2E2E',
    signatures: { left: 'ผู้สั่งสินค้า', middle: 'ผู้เสนอราคา', right: 'ผู้มีอำนาจลงนาม' },
  },
  DELIVERY_NOTE: {
    title: 'ใบส่งของ',
    primaryColor: '#D96B00',
    signatures: { left: 'ผู้รับสินค้า', middle: 'ผู้ส่งสินค้า', right: 'ผู้มีอำนาจลงนาม' },
    receivedNote: 'ได้รับสินค้าตามรายการข้างต้นไว้เรียบร้อยแล้ว',
  },
  INVOICE: {
    title: 'ใบแจ้งหนี้',
    primaryColor: '#4B5563',
    signatures: { left: 'ผู้สั่งซื้อ', middle: 'ผู้แจ้งหนี้', right: 'ผู้มีอำนาจลงนาม' },
  },
  RECEIPT: {
    title: 'ใบเสร็จรับเงิน',
    primaryColor: '#2F7F89',
    signatures: { left: 'ผู้จ่ายเงิน', middle: 'ผู้รับเงิน', right: 'ผู้มีอำนาจลงนาม' },
  },
  TAX_INVOICE: {
    title: 'ใบกำกับภาษี',
    primaryColor: '#1F5F8B',
    signatures: { left: 'ผู้ซื้อ', middle: 'ผู้ออกใบกำกับภาษี', right: 'ผู้มีอำนาจลงนาม' },
    defaultOriginalCopy: 'ต้นฉบับ',
    legalSubtitle: 'ใบกำกับภาษี (Tax Invoice)',
  },
  RECEIPT_TAX_INVOICE: {
    title: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
    primaryColor: '#1F5F8B',
    signatures: { left: 'ผู้จ่ายเงิน', middle: 'ผู้รับเงิน', right: 'ผู้มีอำนาจลงนาม' },
    defaultOriginalCopy: 'ต้นฉบับ',
    legalSubtitle: 'ใบเสร็จรับเงิน/ใบกำกับภาษี (Receipt / Tax Invoice)',
  },
};

export const SLUG_TO_TYPE: Record<string, DocumentType> = {
  quotations: 'QUOTATION',
  invoices: 'INVOICE',
  'delivery-notes': 'DELIVERY_NOTE',
  receipts: 'RECEIPT',
  'tax-invoices': 'TAX_INVOICE',
  'receipt-tax-invoices': 'RECEIPT_TAX_INVOICE',
};
