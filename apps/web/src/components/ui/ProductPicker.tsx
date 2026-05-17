'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { ProductType } from '@hj/shared-types';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { useToast } from './Toast';

interface Product {
  id: string;
  code: string | null;
  nameTh: string;
  type: ProductType;
  unit: string;
  unitPrice: string;
  vatable: boolean;
  description: string | null;
}

export function ProductPicker({
  value,
  onChange,
  placeholder,
}: {
  value: Product | null;
  onChange: (p: Product | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const role = getUser()?.role;
  const canCreate = role === 'OWNER' || role === 'ADMIN';

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('isActive', 'true');
        if (search) params.set('search', search);
        params.set('take', '50');
        const res = await api<{ items: Product[] }>(`/products?${params.toString()}`);
        setItems(res.items);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [open, search]);

  function handleCreated(p: Product) {
    onChange(p);
    setCreateOpen(false);
    setOpen(false);
    setSearch('');
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-left text-[13px] outline-none hover:border-brand"
      >
        {value ? (
          <span className="truncate">
            <span className="font-medium">{value.nameTh}</span>
            {value.code && <span className="ml-1.5 text-[11px] text-text-mute">{value.code}</span>}
          </span>
        ) : (
          <span className="text-text-mute">{placeholder ?? 'เลือกสินค้า/บริการ'}</span>
        )}
        <span className="text-text-mute">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
          <div className="sticky top-0 border-b border-border bg-surface p-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา…"
              className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
            />
          </div>
          {loading && (
            <div className="px-3 py-4 text-center">
              <Spinner />
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-4 text-center text-[12.5px] text-text-mute">ไม่พบรายการ</div>
          )}
          {!loading &&
            items.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                  setSearch('');
                }}
                className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-surface-3 ${
                  value?.id === p.id ? 'bg-surface-2' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{p.nameTh}</span>
                  <span className="whitespace-nowrap font-mono text-[11px] text-text-mute">
                    ฿ {p.unitPrice} / {p.unit}
                  </span>
                </div>
                {p.code && <div className="text-[11px] text-text-mute">{p.code}</div>}
              </button>
            ))}
          {canCreate && (
            <div className="sticky bottom-0 border-t border-border bg-surface p-2">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="block w-full rounded-md border border-brand/40 bg-brand/5 px-3 py-2 text-left text-[12.5px] font-medium text-brand hover:bg-brand/10"
              >
                + เพิ่มสินค้า/บริการใหม่
              </button>
            </div>
          )}
        </div>
      )}

      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />}

      <CreateProductModal
        open={createOpen}
        defaultName={search}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

interface CreateForm {
  type: ProductType;
  code: string;
  nameTh: string;
  unit: string;
  unitPrice: string;
  vatable: boolean;
}

function CreateProductModal({
  open,
  defaultName,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultName?: string;
  onClose: () => void;
  onCreated: (p: Product) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<CreateForm>({
    type: 'SERVICE',
    code: '',
    nameTh: '',
    unit: 'รายการ',
    unitPrice: '0',
    vatable: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens; seed nameTh from the picker's search box if any.
  useEffect(() => {
    if (!open) return;
    setForm({
      type: 'SERVICE',
      code: '',
      nameTh: defaultName?.trim() ?? '',
      unit: 'รายการ',
      unitPrice: '0',
      vatable: true,
    });
    setError(null);
  }, [open, defaultName]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = form.nameTh.trim();
    const unit = form.unit.trim();
    const price = Number(form.unitPrice);
    if (!name) {
      setError('กรุณากรอกชื่อสินค้า/บริการ');
      return;
    }
    if (!unit) {
      setError('กรุณากรอกหน่วย');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('ราคาต้องเป็นตัวเลข ≥ 0');
      return;
    }
    setSaving(true);
    try {
      const created = await api<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          code: form.code.trim() || undefined,
          nameTh: name,
          unit,
          unitPrice: price,
          vatable: form.vatable,
        }),
      });
      toast.success(`เพิ่ม "${created.nameTh}" แล้ว`);
      onCreated(created);
    } catch (err: any) {
      setError(err.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13.5px] outline-none focus:border-brand';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มสินค้า/บริการ"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[13px]"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            form="create-product-form"
            disabled={saving}
            className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก + ใช้รายการนี้'}
          </button>
        </>
      }
    >
      <form id="create-product-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        {error && (
          <div className="md:col-span-2 rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-[12.5px] text-bad">
            {error}
          </div>
        )}

        <label>
          <span className="mb-1 block text-[12px] text-text-soft">ประเภท</span>
          <select
            value={form.type}
            onChange={(e) => setForm((v) => ({ ...v, type: e.target.value as ProductType }))}
            className={inputCls}
          >
            <option value="SERVICE">บริการ</option>
            <option value="GOOD">สินค้า</option>
            <option value="MATERIAL">วัสดุ</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[12px] text-text-soft">รหัส (optional)</span>
          <input
            value={form.code}
            onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
            placeholder="SVC-002"
            maxLength={32}
            className={`${inputCls} font-mono`}
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-[12px] text-text-soft">
            ชื่อ <span className="text-bad">*</span>
          </span>
          <input
            value={form.nameTh}
            onChange={(e) => setForm((v) => ({ ...v, nameTh: e.target.value }))}
            required
            maxLength={200}
            autoFocus
            className={inputCls}
          />
        </label>

        <label>
          <span className="mb-1 block text-[12px] text-text-soft">
            หน่วย <span className="text-bad">*</span>
          </span>
          <input
            value={form.unit}
            onChange={(e) => setForm((v) => ({ ...v, unit: e.target.value }))}
            required
            maxLength={32}
            className={inputCls}
          />
        </label>
        <label>
          <span className="mb-1 block text-[12px] text-text-soft">
            ราคา/หน่วย (บาท) <span className="text-bad">*</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.unitPrice}
            onChange={(e) => setForm((v) => ({ ...v, unitPrice: e.target.value }))}
            required
            className={`${inputCls} text-right font-mono`}
          />
        </label>

        <label className="md:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.vatable}
            onChange={(e) => setForm((v) => ({ ...v, vatable: e.target.checked }))}
          />
          <span className="text-[13px]">มี VAT (ราคาที่กรอกยังไม่รวม VAT)</span>
        </label>
      </form>
    </Modal>
  );
}
