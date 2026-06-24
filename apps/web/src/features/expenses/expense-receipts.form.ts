import type { ExpenseReceipt } from './expense-receipts.types';

export const EMPTY_EXPENSE_FORM = {
  vendorName: '',
  vendorTaxId: '',
  vendorBranch: '',
  vendorAddress: '',
  documentNumber: '',
  documentDate: '',
  paidAt: '',
  category: '',
  subtotal: '',
  vatAmount: '',
  withholdingTaxAmount: '',
  grandTotal: '',
  note: '',
  isForeign: false,
  expenseNature: '' as '' | 'GOODS' | 'SERVICE',
  usedInThailand: true,
  currency: '',
  fxRate: '',
  foreignSubtotal: '',
  reverseChargeVat: false,
  reverseChargeVatRate: '',
  dtaCountry: '',
  foreignWhtType: '' as '' | 'ROYALTY' | 'SERVICE' | 'OTHER',
  foreignWhtBorneBy: '' as '' | 'WITHHELD' | 'RECOVERABLE' | 'GROSSED_UP',
  foreignWhtRate: '',
  billedToName: '',
  treatAsIntangible: false,
  treatAsPrepaid: false,
  intangibleUsefulLifeMonths: '',
  serviceStart: '',
  serviceEnd: '',
};

export type ExpenseForm = typeof EMPTY_EXPENSE_FORM;

export const FOREIGN_SKIP_IF_EMPTY = new Set([
  'expenseNature',
  'dtaCountry',
  'currency',
  'fxRate',
  'foreignSubtotal',
  'reverseChargeVatRate',
  'foreignWhtType',
  'foreignWhtBorneBy',
  'foreignWhtRate',
]);

export const FOREIGN_KEYS = new Set([
  'isForeign',
  'expenseNature',
  'usedInThailand',
  'currency',
  'fxRate',
  'foreignSubtotal',
  'reverseChargeVat',
  'reverseChargeVatRate',
  'dtaCountry',
  'foreignWhtType',
  'foreignWhtBorneBy',
  'foreignWhtRate',
  'billedToName',
  'treatAsIntangible',
  'treatAsPrepaid',
  'intangibleUsefulLifeMonths',
  'serviceStart',
  'serviceEnd',
]);

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export function checkAccount(item: ExpenseReceipt): { ok: boolean; reason: string } {
  const amount = Number(item.grandTotal);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'ต้องระบุยอดรวมมากกว่า 0 ก่อนลงรายจ่าย' };
  }
  if (!item.paidAt && !item.documentDate) {
    return { ok: false, reason: 'ต้องระบุวันที่จ่ายหรือวันที่เอกสารก่อนลงรายจ่าย' };
  }
  return { ok: true, reason: '' };
}

export function computeThb(foreignSubtotal: string, fxRate: string): string {
  const fs = Number(foreignSubtotal);
  const fx = Number(fxRate);
  if (!foreignSubtotal || !fxRate || !Number.isFinite(fs) || !Number.isFinite(fx)) return '';
  return (Math.round(fs * fx * 100) / 100).toFixed(2);
}

export function foreignPayload(form: ExpenseForm): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { isForeign: form.isForeign };
  if (!form.isForeign) return out;
  out.usedInThailand = form.usedInThailand;
  out.reverseChargeVat = form.reverseChargeVat;
  for (const key of FOREIGN_SKIP_IF_EMPTY) {
    const value = (form as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return out;
}

export function capitalizationPayload(form: ExpenseForm): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {
    billedToName: form.billedToName,
    treatAsIntangible: form.treatAsIntangible,
    treatAsPrepaid: form.treatAsPrepaid,
  };
  if (form.intangibleUsefulLifeMonths.trim())
    out.intangibleUsefulLifeMonths = form.intangibleUsefulLifeMonths;
  if (form.serviceStart) out.serviceStart = form.serviceStart;
  if (form.serviceEnd) out.serviceEnd = form.serviceEnd;
  return out;
}

export function periodLabel(year: number, month: number): string {
  return `${THAI_MONTHS_SHORT[month - 1] ?? month} ${year + 543}`;
}

export function receiptToForm(receipt: ExpenseReceipt): ExpenseForm {
  return {
    vendorName: receipt.proposedVendorName ?? receipt.vendor?.nameTh ?? '',
    vendorTaxId: receipt.proposedVendorTaxId ?? receipt.vendor?.taxId ?? '',
    vendorBranch: receipt.proposedVendorBranch ?? receipt.vendor?.branch ?? '',
    vendorAddress: receipt.proposedVendorAddress ?? receipt.vendor?.address ?? '',
    documentNumber: receipt.documentNumber ?? '',
    documentDate: receipt.documentDate ? receipt.documentDate.slice(0, 10) : '',
    paidAt: receipt.paidAt ? receipt.paidAt.slice(0, 10) : '',
    category: receipt.category ?? '',
    subtotal: receipt.subtotal ?? '',
    vatAmount: receipt.vatAmount ?? '',
    withholdingTaxAmount: receipt.withholdingTaxAmount ?? '',
    grandTotal: receipt.grandTotal ?? '',
    note: '',
    isForeign: receipt.isForeign,
    expenseNature: receipt.expenseNature ?? '',
    usedInThailand: receipt.usedInThailand,
    currency: receipt.isForeign ? receipt.currency : '',
    fxRate: receipt.isForeign && receipt.fxRate !== '1' ? receipt.fxRate : '',
    foreignSubtotal: receipt.foreignSubtotal ?? '',
    reverseChargeVat: receipt.reverseChargeVat,
    reverseChargeVatRate: receipt.isForeign ? receipt.reverseChargeVatRate : '',
    dtaCountry: receipt.dtaCountry ?? '',
    foreignWhtType: receipt.foreignWhtType ?? '',
    foreignWhtBorneBy: receipt.foreignWhtBorneBy ?? '',
    foreignWhtRate: receipt.foreignWhtRate ?? '',
    billedToName: receipt.billedToName ?? '',
    treatAsIntangible: receipt.treatAsIntangible,
    treatAsPrepaid: receipt.treatAsPrepaid,
    intangibleUsefulLifeMonths:
      receipt.intangibleUsefulLifeMonths != null
        ? String(receipt.intangibleUsefulLifeMonths)
        : '',
    serviceStart: receipt.serviceStart ? receipt.serviceStart.slice(0, 10) : '',
    serviceEnd: receipt.serviceEnd ? receipt.serviceEnd.slice(0, 10) : '',
  };
}