'use client';

import { useEffect, useState } from 'react';
import type { ProductType } from '@hj/shared-types';
import { api } from '@/lib/api';
import { Spinner } from './Spinner';

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
        </div>
      )}

      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />}
    </div>
  );
}
