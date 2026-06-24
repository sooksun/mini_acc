'use client';

import { FormEvent, useEffect, useState } from 'react';
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
} from './expense-receipts.form';

export function UploadReceiptModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(EMPTY_EXPENSE_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.isForeign) return;
    const thb = computeThb(form.foreignSubtotal, form.fxRate);
    if (!thb) return;
    const wht = Number(form.withholdingTaxAmount || '0') || 0;
    setForm((v) => ({ ...v, subtotal: thb, vatAmount: '0', grandTotal: (Number(thb) - wht).toFixed(2) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.isForeign, form.foreignSubtotal, form.fxRate, form.withholdingTaxAmount]);

  useRegisterPageDescriptor(
    () =>
      !open
        ? null
        : {
            route: '/expenses/receipts',
            title: 'อัปโหลดใบเสร็จ/บันทึกรายจ่าย',
            operation: 'create',
            fields: EXPENSE_ASSISTANT_FIELDS,
            getCurrentValues: () => getExpenseAssistantValues(form),
            applyValues: (p) => applyExpenseAssistantValues(setForm, p),
          },
    [open],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error('กรุณาเลือกไฟล์ใบเสร็จ');
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      body.set('file', file);
      Object.entries(form).forEach(([key, value]) => {
        if (FOREIGN_KEYS.has(key)) return;
        if (typeof value !== 'string' || !value) return;
        body.set(key, value);
      });
      Object.entries(foreignPayload(form)).forEach(([key, value]) => body.set(key, String(value)));
      Object.entries(capitalizationPayload(form)).forEach(([key, value]) =>
        body.set(key, String(value)),
      );
      await api('/expense-receipts/upload', { method: 'POST', body });
      toast.success('อัปโหลดใบเสร็จแล้ว');
      setFile(null);
      setForm(EMPTY_EXPENSE_FORM);
      onUploaded();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="อัปโหลดใบเสร็จรายจ่าย"
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="upload-expense-receipt-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังอัปโหลด…' : 'อัปโหลด'}
          </button>
        </>
      }
    >
      <form id="upload-expense-receipt-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">ไฟล์ใบเสร็จ / ใบกำกับภาษีซื้อ</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px]"
          />
        </label>
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
          <span className="mb-1 block text-[12.5px] text-text-soft">ที่อยู่ผู้ขาย / หมายเหตุ</span>
          <textarea
            value={form.vendorAddress}
            onChange={(e) => setForm((v) => ({ ...v, vendorAddress: e.target.value }))}
            className="min-h-20 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
      </form>
    </Modal>
  );
}