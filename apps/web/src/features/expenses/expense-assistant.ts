import type { Dispatch, SetStateAction } from 'react';
import type { AssistantFieldSchema } from '@hj/shared-types';
import type { ExpenseForm } from './expense-receipts.form';

export const EXPENSE_ASSISTANT_FIELDS: AssistantFieldSchema[] = [
  { name: 'vendorName', label: 'ชื่อผู้ขาย', type: 'text' },
  { name: 'vendorTaxId', label: 'เลขผู้เสียภาษีผู้ขาย (13 หลัก)', type: 'text', hint: 'จำเป็นเมื่อหัก ณ ที่จ่าย' },
  { name: 'documentNumber', label: 'เลขที่เอกสาร', type: 'text' },
  { name: 'documentDate', label: 'วันที่เอกสาร', type: 'date' },
  { name: 'paidAt', label: 'วันที่จ่าย', type: 'date' },
  { name: 'category', label: 'หมวดรายจ่าย', type: 'text', hint: 'เช่น ค่าเดินทาง ค่าซอฟต์แวร์' },
  { name: 'subtotal', label: 'ยอดก่อน VAT', type: 'number' },
  { name: 'vatAmount', label: 'ภาษีมูลค่าเพิ่ม', type: 'number' },
  { name: 'withholdingTaxAmount', label: 'หัก ณ ที่จ่าย', type: 'number' },
  { name: 'grandTotal', label: 'ยอดรวมสุทธิ', type: 'number' },
  { name: 'note', label: 'หมายเหตุ', type: 'textarea' },
];

export function getExpenseAssistantValues(form: ExpenseForm): Record<string, unknown> {
  return {
    vendorName: form.vendorName,
    vendorTaxId: form.vendorTaxId,
    documentNumber: form.documentNumber,
    documentDate: form.documentDate,
    paidAt: form.paidAt,
    category: form.category,
    subtotal: form.subtotal,
    vatAmount: form.vatAmount,
    withholdingTaxAmount: form.withholdingTaxAmount,
    grandTotal: form.grandTotal,
    note: form.note,
  };
}

export function applyExpenseAssistantValues(
  setForm: Dispatch<SetStateAction<ExpenseForm>>,
  p: Record<string, unknown>,
) {
  setForm((f) => ({
    ...f,
    ...(p.vendorName !== undefined ? { vendorName: String(p.vendorName) } : {}),
    ...(p.vendorTaxId !== undefined ? { vendorTaxId: String(p.vendorTaxId).replace(/\D/g, '').slice(0, 13) } : {}),
    ...(p.documentNumber !== undefined ? { documentNumber: String(p.documentNumber) } : {}),
    ...(p.documentDate !== undefined ? { documentDate: String(p.documentDate).slice(0, 10) } : {}),
    ...(p.paidAt !== undefined ? { paidAt: String(p.paidAt).slice(0, 10) } : {}),
    ...(p.category !== undefined ? { category: String(p.category) } : {}),
    ...(p.subtotal !== undefined ? { subtotal: String(p.subtotal) } : {}),
    ...(p.vatAmount !== undefined ? { vatAmount: String(p.vatAmount) } : {}),
    ...(p.withholdingTaxAmount !== undefined ? { withholdingTaxAmount: String(p.withholdingTaxAmount) } : {}),
    ...(p.grandTotal !== undefined ? { grandTotal: String(p.grandTotal) } : {}),
    ...(p.note !== undefined ? { note: String(p.note) } : {}),
  }));
}