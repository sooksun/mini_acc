'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { ProductType } from '@hj/shared-types';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

interface FormState {
  type: ProductType;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  unit: string;
  unitPrice: string;
  vatable: boolean;
  isActive: boolean;
}

const empty: FormState = {
  type: 'SERVICE',
  code: '',
  nameTh: '',
  nameEn: '',
  description: '',
  unit: 'รายการ',
  unitPrice: '0',
  vatable: true,
  isActive: true,
};

export function ProductForm({
  open,
  onClose,
  onSaved,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  productId?: string | null;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!productId) {
      setForm(empty);
      return;
    }
    setLoading(true);
    api<any>(`/products/${productId}`)
      .then((p) =>
        setForm({
          type: p.type,
          code: p.code ?? '',
          nameTh: p.nameTh,
          nameEn: p.nameEn ?? '',
          description: p.description ?? '',
          unit: p.unit,
          unitPrice: String(p.unitPrice),
          vatable: p.vatable,
          isActive: p.isActive,
        }),
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, productId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const price = Number(form.unitPrice);
    if (!isFinite(price) || price < 0) {
      setError('ราคาต่อหน่วยไม่ถูกต้อง');
      setSaving(false);
      return;
    }
    const payload = {
      type: form.type,
      code: form.code || undefined,
      nameTh: form.nameTh,
      nameEn: form.nameEn || undefined,
      description: form.description || undefined,
      unit: form.unit,
      unitPrice: price,
      vatable: form.vatable,
      ...(productId ? { isActive: form.isActive } : {}),
    };
    try {
      if (productId) {
        await api(`/products/${productId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      }
      toast.success(productId ? 'อัปเดตแล้ว' : 'เพิ่มแล้ว');
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={productId ? 'แก้ไขสินค้า/บริการ' : 'เพิ่มสินค้า/บริการ'}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] text-text-soft hover:bg-surface-3 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={saving || loading || !form.nameTh}
            className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-text-mute">กำลังโหลด…</div>
      ) : (
        <form id="product-form" onSubmit={onSubmit} className="grid gap-3">
          {error && (
            <div className="rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-[12.5px] text-bad">
              {error}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="ประเภท" required>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ProductType })}
                className={inputCls}
              >
                <option value="SERVICE">บริการ</option>
                <option value="GOOD">สินค้า</option>
                <option value="MATERIAL">วัสดุ</option>
                <option value="ASSET">ทรัพย์สิน</option>
              </select>
            </Field>
            <Field label="รหัส">
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} maxLength={32} />
            </Field>
            <Field label="หน่วย" required>
              <input required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls} maxLength={32} />
            </Field>
          </div>
          <Field label="ชื่อภาษาไทย" required>
            <input
              required
              value={form.nameTh}
              onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
              className={inputCls}
              maxLength={200}
            />
          </Field>
          <Field label="ชื่อภาษาอังกฤษ">
            <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className={inputCls} maxLength={200} />
          </Field>
          <Field label="รายละเอียด">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} maxLength={2000} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ราคาต่อหน่วย (THB)" required>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                className={`${inputCls} font-mono text-right`}
              />
            </Field>
            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.vatable}
                  onChange={(e) => setForm({ ...form, vatable: e.target.checked })}
                />
                คำนวณ VAT 7%
              </label>
            </div>
          </div>
          {productId && (
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              ใช้งานอยู่
            </label>
          )}
        </form>
      )}
    </Modal>
  );
}

const inputCls =
  'w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13.5px] outline-none focus:border-brand';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-text-soft">
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </span>
      {children}
    </label>
  );
}
