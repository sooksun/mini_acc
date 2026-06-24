'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useRegisterPageDescriptor } from '@/contexts/AssistantContext';
import {
  applyExpenseAssistantValues,
  EXPENSE_ASSISTANT_FIELDS,
  getExpenseAssistantValues,
} from './expense-assistant';
import { CapitalizationFields } from './CapitalizationFields';
import { ExpenseReceiptField } from './ExpenseReceiptField';
import { ForeignExpenseSection } from './ForeignExpenseSection';
import {
  capitalizationPayload,
  computeThb,
  EMPTY_EXPENSE_FORM,
  FOREIGN_KEYS,
  foreignPayload,
  receiptToForm,
} from './expense-receipts.form';
import type { ExpenseReceipt } from './expense-receipts.types';

export function EditReceiptModal({
  receipt,
  onClose,
  onSaved,
}: {
  receipt: ExpenseReceipt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_EXPENSE_FORM);
  const [saving, setSaving] = useState(false);

  useRegisterPageDescriptor(
    () =>
      !receipt
        ? null
        : {
            route: '/expenses/receipts',
            title: 'แก้ไขรายจ่าย',
            operation: 'edit',
            fields: EXPENSE_ASSISTANT_FIELDS,
            getCurrentValues: () => getExpenseAssistantValues(form),
            applyValues: (p) => applyExpenseAssistantValues(setForm, p),
          },
    [receipt],
  );

  useEffect(() => {
    if (!receipt) return;
    setForm(receiptToForm(receipt));
  }, [receipt]);

  useEffect(() => {
    if (!form.isForeign) return;
    const thb = computeThb(form.foreignSubtotal, form.fxRate);
    if (!thb) return;
    const wht = Number(form.withholdingTaxAmount || '0') || 0;
    setForm((v) => ({ ...v, subtotal: thb, vatAmount: '0', grandTotal: (Number(thb) - wht).toFixed(2) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.isForeign, form.foreignSubtotal, form.fxRate, form.withholdingTaxAmount]);

  const reconcile = useMemo(() => {
    const s = Number(form.subtotal || 0);
    const v = Number(form.vatAmount || 0);
    const w = Number(form.withholdingTaxAmount || 0);
    const g = Number(form.grandTotal || 0);
    if (![s, v, w, g].every(Number.isFinite)) return null;
    const expected = Math.round((s + v - w) * 100) / 100;
    return { ok: Math.abs(expected - g) < 0.005, expected, grand: g };
  }, [form.subtotal, form.vatAmount, form.withholdingTaxAmount, form.grandTotal]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!receipt) return;
    setSaving(true);
    try {
      const payload: Record<string, string | boolean> = {};
      Object.entries(form).forEach(([key, value]) => {
        if (key === 'note') return;
        if (FOREIGN_KEYS.has(key)) return;
        if (key === 'vendorTaxId') {
          if (typeof value === 'string' && value.trim()) payload[key] = value;
          return;
        }
        if (typeof value === 'string') payload[key] = value;
      });
      Object.assign(payload, foreignPayload(form), capitalizationPayload(form));
      await api(`/expense-receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('แก้ไขใบเสร็จแล้ว');
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!receipt}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="แก้ไขรายการใบเสร็จ"
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-4 py-2 text-[13px] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            form="edit-expense-receipt-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
          </button>
        </>
      }
    >
      <form id="edit-expense-receipt-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <ExpenseReceiptField label="ชื่อผู้ขาย" value={form.vendorName} onChange={(vendorName) => setForm((v) => ({ ...v, vendorName }))} />
        <ExpenseReceiptField label="เลขผู้เสียภาษีผู้ขาย" value={form.vendorTaxId} onChange={(vendorTaxId) => setForm((v) => ({ ...v, vendorTaxId }))} />
        <ExpenseReceiptField label="สาขา" value={form.vendorBranch} onChange={(vendorBranch) => setForm((v) => ({ ...v, vendorBranch }))} />
        <ExpenseReceiptField label="เลขที่เอกสาร" value={form.documentNumber} onChange={(documentNumber) => setForm((v) => ({ ...v, documentNumber }))} />
        <ExpenseReceiptField type="date" label="วันที่เอกสาร" value={form.documentDate} onChange={(documentDate) => setForm((v) => ({ ...v, documentDate }))} />
        <ExpenseReceiptField type="date" label="วันที่จ่าย" value={form.paidAt} onChange={(paidAt) => setForm((v) => ({ ...v, paidAt }))} />
        <ExpenseReceiptField label="หมวดรายจ่าย" value={form.category} onChange={(category) => setForm((v) => ({ ...v, category }))} placeholder="เช่น ค่าซอฟต์แวร์ / ค่าเดินทาง" />
        <ExpenseReceiptField label="ยอดก่อน VAT (บาท)" value={form.subtotal} onChange={(subtotal) => setForm((v) => ({ ...v, subtotal }))} disabled={form.isForeign} />
        <ExpenseReceiptField label="VAT" value={form.vatAmount} onChange={(vatAmount) => setForm((v) => ({ ...v, vatAmount }))} disabled={form.isForeign} />
        <ExpenseReceiptField label="หัก ณ ที่จ่าย" value={form.withholdingTaxAmount} onChange={(withholdingTaxAmount) => setForm((v) => ({ ...v, withholdingTaxAmount }))} />
        <ExpenseReceiptField label="ยอดสุทธิ (บาท)" value={form.grandTotal} onChange={(grandTotal) => setForm((v) => ({ ...v, grandTotal }))} disabled={form.isForeign} />
        <ForeignExpenseSection form={form} setForm={setForm} />
        <CapitalizationFields form={form} setForm={setForm} />
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">ที่อยู่ผู้ขาย</span>
          <textarea
            value={form.vendorAddress}
            onChange={(e) => setForm((v) => ({ ...v, vendorAddress: e.target.value }))}
            className="min-h-20 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        {reconcile && !reconcile.ok && (
          <div className="md:col-span-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-warn">
            ยอดยังไม่สอดคล้อง: ยอดก่อน VAT + VAT − หัก ณ ที่จ่าย = {reconcile.expected.toFixed(2)} แต่ยอดสุทธิ = {reconcile.grand.toFixed(2)} — ปรับให้ตรงก่อนจึงจะลงรายจ่ายได้
          </div>
        )}
        {reconcile && reconcile.ok && (
          <div className="md:col-span-2 rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-[12px] text-ok">
            ยอดสอดคล้องกัน ✓ ({reconcile.grand.toFixed(2)})
          </div>
        )}
      </form>
    </Modal>
  );
}