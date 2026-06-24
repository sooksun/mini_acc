'use client';

import { useEffect, useState } from 'react';
import type { PartnerType } from '@hj/shared-types';
import { api } from '@/lib/api';
import type { PartnerOption } from '@/lib/master-data-types';
import { Spinner } from './Spinner';

interface PartnerPickerProps {
  type: PartnerType;
  value: PartnerOption | null;
  onChange: (p: PartnerOption | null) => void;
  placeholder?: string;
  requireTaxId?: boolean;
}

export function PartnerPicker({ type, value, onChange, placeholder, requireTaxId }: PartnerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<PartnerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('type', type);
        params.set('isActive', 'true');
        if (search) params.set('search', search);
        params.set('take', '50');
        const res = await api<{ items: PartnerOption[] }>(`/partners?${params.toString()}`);
        setItems(res.items);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [open, search, type]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-left text-[13.5px] outline-none hover:border-brand"
      >
        {value ? (
          <span>
            <span className="font-medium">{value.nameTh}</span>
            {value.code && <span className="ml-2 text-text-mute">· {value.code}</span>}
          </span>
        ) : (
          <span className="text-text-mute">{placeholder ?? 'เลือก…'}</span>
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
              placeholder="ค้นหาชื่อ / รหัส / เลขผู้เสียภาษี"
              className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
            />
          </div>
          {loading && <div className="px-3 py-4 text-center"><Spinner /></div>}
          {!loading && items.length === 0 && (
            <div className="px-3 py-4 text-center text-[12.5px] text-text-mute">ไม่พบรายการ</div>
          )}
          {!loading &&
            items.map((p) => {
              const taxIdValue = p.taxId?.trim() ?? '';
              const noTaxId = !taxIdValue;
              const badFormat = !!taxIdValue && !/^\d{13}$/.test(taxIdValue);
              const blocked = requireTaxId && (noTaxId || badFormat);
              const blockReason = noTaxId
                ? 'ลูกค้านี้ไม่มีเลขผู้เสียภาษี'
                : badFormat
                  ? 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก'
                  : undefined;
              return (
                <button
                  type="button"
                  key={p.id}
                  disabled={blocked}
                  onClick={() => {
                    if (blocked) return;
                    onChange(p);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`block w-full px-3 py-2 text-left text-[13px] ${
                    blocked
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:bg-surface-3'
                  } ${value?.id === p.id ? 'bg-surface-2' : ''}`}
                  title={blockReason}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.nameTh}</span>
                    {p.code && <span className="text-[11px] text-text-mute">{p.code}</span>}
                  </div>
                  {taxIdValue ? (
                    <div className={`font-mono text-[11px] ${badFormat ? 'text-bad' : 'text-text-mute'}`}>
                      {p.taxId}{badFormat && ' — ไม่ใช่ 13 หลัก'}
                    </div>
                  ) : requireTaxId ? (
                    <div className="text-[11px] text-bad">ไม่มีเลขผู้เสียภาษี</div>
                  ) : null}
                </button>
              );
            })}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    </div>
  );
}
