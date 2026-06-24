import type { ExpenseReceiptStatus, PartnerType } from '@hj/shared-types';

export interface ExpenseVendorRef {
  id: string;
  code: string | null;
  nameTh: string;
  taxId: string | null;
  branch?: string | null;
  address: string | null;
  type: PartnerType;
}

export interface ForeignTaxObligation {
  id: string;
  kind: 'PP36_VAT' | 'PND54_WHT';
  status: 'PENDING' | 'FILED' | 'CREDITED';
  baseAmount: string;
  rate: string;
  taxAmount: string;
  expensePeriodYear: number;
  expensePeriodMonth: number;
  filePeriodYear: number;
  filePeriodMonth: number;
  filedAt: string | null;
  journalEntryId: string | null;
  expenseRecord?: {
    id: string;
    documentNumber: string | null;
    category: string | null;
    expenseDate: string;
    currency: string;
    foreignSubtotal: string | null;
    foreignWhtType: 'ROYALTY' | 'SERVICE' | 'OTHER' | null;
    foreignWhtBorneBy: 'WITHHELD' | 'RECOVERABLE' | 'GROSSED_UP' | null;
    vendor: { nameTh: string } | null;
  } | null;
}

export interface ExpenseReceipt {
  id: string;
  status: ExpenseReceiptStatus;
  vendorId: string | null;
  vendor: ExpenseVendorRef | null;
  proposedVendorName: string | null;
  proposedVendorTaxId: string | null;
  proposedVendorBranch: string | null;
  proposedVendorAddress: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  paidAt: string | null;
  category: string | null;
  subtotal: string;
  vatAmount: string;
  withholdingTaxAmount: string;
  grandTotal: string;
  isForeign: boolean;
  expenseNature: 'GOODS' | 'SERVICE' | null;
  usedInThailand: boolean;
  currency: string;
  fxRate: string;
  foreignSubtotal: string | null;
  reverseChargeVat: boolean;
  reverseChargeVatRate: string;
  dtaCountry: string | null;
  foreignWhtType: 'ROYALTY' | 'SERVICE' | 'OTHER' | null;
  foreignWhtBorneBy: 'WITHHELD' | 'RECOVERABLE' | 'GROSSED_UP' | null;
  foreignWhtRate: string | null;
  billedToName: string | null;
  billingNameMismatch: boolean;
  treatAsIntangible: boolean;
  treatAsPrepaid: boolean;
  intangibleUsefulLifeMonths: number | null;
  serviceStart: string | null;
  serviceEnd: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  rejectReason: string | null;
  createdAt: string;
  expenseRecord: { id: string; foreignTaxObligations?: ForeignTaxObligation[] } | null;
}

export interface PrepaidEntry {
  id: string;
  periodYear: number;
  periodMonth: number;
  amount: string;
  status: 'PENDING' | 'RECOGNIZED';
  expenseRecord?: {
    documentNumber: string | null;
    category: string | null;
    vendor: { nameTh: string } | null;
  } | null;
}

export const EXPENSE_RECEIPT_STATUS: Record<ExpenseReceiptStatus, { label: string; cls: string }> = {
  UPLOADED: { label: 'รอเติมข้อมูล', cls: 'border-info/40 bg-info/10 text-info' },
  PENDING_VENDOR_APPROVAL: { label: 'รออนุมัติผู้ขาย', cls: 'border-warn/40 bg-warn/10 text-warn' },
  READY_TO_ACCOUNT: { label: 'พร้อมลงรายจ่าย', cls: 'border-ok/40 bg-ok/10 text-ok' },
  ACCOUNTED: { label: 'ลงรายจ่ายแล้ว', cls: 'border-border bg-surface-3 text-text-soft' },
  REJECTED: { label: 'ปฏิเสธ', cls: 'border-bad/40 bg-bad/10 text-bad' },
};

export const WHT_BORNE_LABEL: Record<string, string> = {
  WITHHELD: 'หักจากผู้ขาย',
  RECOVERABLE: 'เรียกคืน',
  GROSSED_UP: 'gross-up',
};