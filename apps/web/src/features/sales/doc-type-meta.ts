import type { DocumentType } from '@hj/shared-types';

export interface DocTypeMeta {
  type: DocumentType;
  title: string;
  shortTitle: string;
  listHref: string;
  newHref: string;
  apiBase: string;
  pdfBase: string;
  requireCustomerTaxId: boolean;
  prefix: string;
  /** Label for the "create next document in chain" button. Undefined = end of chain. */
  nextLabel?: string;
  /** Whether this doc type can be marked ACCOUNTED ("ลงบัญชี" — เงินเข้าบัญชีแล้ว). */
  canAccount?: boolean;
}

export const DOC_TYPE_META: Record<
  | 'QUOTATION'
  | 'INVOICE'
  | 'DELIVERY_NOTE'
  | 'RECEIPT'
  | 'TAX_INVOICE'
  | 'RECEIPT_TAX_INVOICE',
  DocTypeMeta
> = {
  QUOTATION: {
    type: 'QUOTATION',
    title: 'ใบเสนอราคา',
    shortTitle: 'ใบเสนอราคา',
    listHref: '/sales/quotations',
    newHref: '/sales/quotations/new',
    apiBase: '/sales/quotations',
    pdfBase: '/sales-pdf/quotations',
    requireCustomerTaxId: false,
    prefix: 'QT',
    nextLabel: 'สร้างใบส่งของ →',
  },
  INVOICE: {
    type: 'INVOICE',
    title: 'ใบแจ้งหนี้',
    shortTitle: 'ใบแจ้งหนี้',
    listHref: '/sales/invoices',
    newHref: '/sales/invoices/new',
    apiBase: '/sales/invoices',
    pdfBase: '/sales-pdf/invoices',
    requireCustomerTaxId: false,
    prefix: 'INV',
    nextLabel: 'ออกใบเสร็จ/ใบกำกับภาษี →',
  },
  DELIVERY_NOTE: {
    type: 'DELIVERY_NOTE',
    title: 'ใบส่งของ',
    shortTitle: 'ใบส่งของ',
    listHref: '/sales/delivery-notes',
    newHref: '/sales/delivery-notes/new',
    apiBase: '/sales/delivery-notes',
    pdfBase: '/sales-pdf/delivery-notes',
    requireCustomerTaxId: false,
    prefix: 'DN',
    nextLabel: 'สร้างใบแจ้งหนี้ →',
  },
  RECEIPT: {
    type: 'RECEIPT',
    title: 'ใบเสร็จรับเงิน',
    shortTitle: 'ใบเสร็จ',
    listHref: '/sales/receipts',
    newHref: '/sales/receipts/new',
    apiBase: '/sales/receipts',
    pdfBase: '/sales-pdf/receipts',
    requireCustomerTaxId: false,
    prefix: 'RC',
    canAccount: true,
  },
  TAX_INVOICE: {
    type: 'TAX_INVOICE',
    title: 'ใบกำกับภาษี',
    shortTitle: 'ใบกำกับภาษี',
    listHref: '/sales/tax-invoices',
    newHref: '/sales/tax-invoices/new',
    apiBase: '/sales/tax-invoices',
    pdfBase: '/sales-pdf/tax-invoices',
    requireCustomerTaxId: true,
    prefix: 'TAX',
  },
  RECEIPT_TAX_INVOICE: {
    type: 'RECEIPT_TAX_INVOICE',
    title: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
    shortTitle: 'ใบเสร็จ+ภาษี',
    listHref: '/sales/receipt-tax-invoices',
    newHref: '/sales/receipt-tax-invoices/new',
    apiBase: '/sales/receipt-tax-invoices',
    pdfBase: '/sales-pdf/receipt-tax-invoices',
    requireCustomerTaxId: true,
    prefix: 'RT',
    canAccount: true,
  },
};
