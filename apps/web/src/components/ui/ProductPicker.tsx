'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react';
import type { ProductType } from '@hj/shared-types';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Modal } from './Modal';
import { ProductTypeBadge } from './ProductTypeBadge';
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

type TypeFilter = '' | ProductType;
const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'SERVICE', label: 'บริการ' },
  { value: 'GOOD', label: 'สินค้า' },
  { value: 'MATERIAL', label: 'วัสดุ' },
  { value: 'ASSET', label: 'ทรัพย์สิน' },
];

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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
        if (typeFilter) params.set('type', typeFilter);
        params.set('take', '100');
        const res = await api<{ items: Product[] }>(`/products?${params.toString()}`);
        setItems(res.items);
        setHighlightIdx(0);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [open, search, typeFilter]);

  // Focus search when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
      setHighlightIdx(0);
    }
  }, [open]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlightIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  function handleCreated(p: Product) {
    onChange(p);
    setCreateOpen(false);
    setOpen(false);
  }

  function selectAt(idx: number) {
    const p = items[idx];
    if (!p) return;
    onChange(p);
    setOpen(false);
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length > 0) {
        selectAt(highlightIdx);
      } else if (canCreate && search.trim()) {
        setCreateOpen(true);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  const stats = useMemo(() => {
    const tone = value
      ? 'border-brand bg-brand/5'
      : 'border-border bg-surface-2 hover:border-brand';
    return tone;
  }, [value]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors ${stats}`}
      >
        {value ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <ProductTypeBadge type={value.type} />
            <span className="min-w-0 truncate">
              <span className="font-medium">{value.nameTh}</span>
              {value.code && (
                <span className="ml-1.5 text-[11px] text-text-mute">{value.code}</span>
              )}
            </span>
          </span>
        ) : (
          <span className="text-text-mute">{placeholder ?? 'เลือกสินค้า/บริการ'}</span>
        )}
        <span className="ml-2 text-text-mute">▾</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute left-0 z-30 mt-1 w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            role="listbox"
          >
            {/* Search + create header */}
            <div className="border-b border-border bg-surface-2 p-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute">
                    🔍
                  </span>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={onSearchKey}
                    placeholder="พิมพ์เพื่อค้นหา ชื่อ / รหัส…"
                    className="w-full rounded-md border border-border bg-surface px-8 py-2 text-[13.5px] outline-none focus:border-brand"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="clear"
                      className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-text-mute hover:bg-surface-3 hover:text-text"
                    >
                      ×
                    </button>
                  )}
                </div>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="whitespace-nowrap rounded-md bg-brand-gradient px-3 py-2 text-[12.5px] font-medium text-white shadow-sm hover:opacity-90"
                  >
                    + เพิ่มใหม่
                  </button>
                )}
              </div>

              {/* Type filter chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TYPE_FILTERS.map((t) => {
                  const active = typeFilter === t.value;
                  return (
                    <button
                      type="button"
                      key={t.value || 'all'}
                      onClick={() => setTypeFilter(t.value)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors ${
                        active
                          ? 'border-brand bg-brand text-white'
                          : 'border-border bg-surface text-text-soft hover:border-brand/40 hover:text-text'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List */}
            <div
              ref={listRef}
              className="max-h-[70vh] overflow-y-auto"
            >
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Spinner />
                </div>
              )}

              {!loading && items.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <div className="text-[13px] text-text-mute">
                    {search ? (
                      <>
                        ไม่พบ <span className="font-medium text-text">&ldquo;{search}&rdquo;</span>
                        {typeFilter && (
                          <span className="text-text-mute"> ในประเภท {labelOf(typeFilter)}</span>
                        )}
                      </>
                    ) : (
                      'ไม่มีรายการในประเภทนี้'
                    )}
                  </div>
                  {canCreate && search.trim() && (
                    <button
                      type="button"
                      onClick={() => setCreateOpen(true)}
                      className="mt-3 rounded-md border border-brand/40 bg-brand/5 px-3 py-1.5 text-[12.5px] font-medium text-brand hover:bg-brand/10"
                    >
                      + สร้าง &ldquo;{search}&rdquo; เป็นรายการใหม่
                    </button>
                  )}
                </div>
              )}

              {!loading && items.length > 0 && (
                <div>
                  {items.map((p, idx) => {
                    const isHighlight = idx === highlightIdx;
                    const isSelected = value?.id === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        data-idx={idx}
                        onMouseEnter={() => setHighlightIdx(idx)}
                        onClick={() => selectAt(idx)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          isHighlight ? 'bg-brand/5' : ''
                        } ${isSelected ? 'bg-surface-2' : ''}`}
                      >
                        <ProductTypeBadge type={p.type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-[13.5px] font-medium">{p.nameTh}</span>
                            {p.code && (
                              <span className="shrink-0 font-mono text-[11px] text-text-mute">
                                {p.code}
                              </span>
                            )}
                          </div>
                          {p.description && (
                            <div className="mt-0.5 truncate text-[11.5px] text-text-mute">
                              {p.description}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-[13px] font-semibold text-text">
                            ฿{Number(p.unitPrice).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="text-[11px] text-text-mute">
                            / {p.unit} {p.vatable && <span className="text-info">· VAT</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="border-t border-border bg-surface-2 px-3 py-1.5 text-[10.5px] text-text-mute">
              <kbd className="rounded border border-border bg-surface px-1 font-mono">↑↓</kbd>{' '}
              เลือก ·{' '}
              <kbd className="rounded border border-border bg-surface px-1 font-mono">Enter</kbd>{' '}
              ยืนยัน ·{' '}
              <kbd className="rounded border border-border bg-surface px-1 font-mono">Esc</kbd>{' '}
              ปิด · {items.length} รายการ
            </div>
          </div>
        </>
      )}

      <CreateProductModal
        open={createOpen}
        defaultName={search}
        defaultType={typeFilter || 'SERVICE'}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

function labelOf(t: ProductType): string {
  const found = TYPE_FILTERS.find((f) => f.value === t);
  return found?.label ?? t;
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
  defaultType,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultName?: string;
  defaultType?: ProductType;
  onClose: () => void;
  onCreated: (p: Product) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<CreateForm>({
    type: defaultType ?? 'SERVICE',
    code: '',
    nameTh: '',
    unit: 'รายการ',
    unitPrice: '0',
    vatable: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      type: defaultType ?? 'SERVICE',
      code: '',
      nameTh: defaultName?.trim() ?? '',
      unit: 'รายการ',
      unitPrice: '0',
      vatable: true,
    });
    setError(null);
  }, [open, defaultName, defaultType]);

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
          <div className="flex flex-wrap gap-1.5">
            {(['SERVICE', 'GOOD', 'MATERIAL', 'ASSET'] as ProductType[]).map((t) => {
              const active = form.type === t;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setForm((v) => ({ ...v, type: t }))}
                  className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                    active
                      ? 'border-brand bg-brand text-white'
                      : 'border-border bg-surface-2 text-text-soft hover:border-brand/40'
                  }`}
                >
                  {labelOf(t)}
                </button>
              );
            })}
          </div>
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
