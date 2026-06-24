'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api } from '@/lib/api';
import type { PartnerOption } from '@/lib/master-data-types';
import type { ExpenseReceipt } from './expense-receipts.types';

export function LinkVendorModal({
  receipt,
  canApproveVendor,
  onClose,
  onSaved,
}: {
  receipt: ExpenseReceipt | null;
  canApproveVendor: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PartnerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PartnerOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const isReLink = !!receipt?.vendor;

  const proposed = useMemo(() => {
    if (!receipt) return null;
    const name = receipt.proposedVendorName?.trim() ?? '';
    const taxId = receipt.proposedVendorTaxId?.trim() ?? '';
    const branch = receipt.proposedVendorBranch?.trim() ?? '';
    const address = receipt.proposedVendorAddress?.trim() ?? '';
    if (!name && !taxId && !branch && !address) return null;
    return { nameTh: name, taxId, branch, address };
  }, [receipt]);

  useEffect(() => {
    if (!receipt) return;
    setSelected(receipt.vendor);
    setSaving(false);
    setCreating(false);
    setSearch(receipt.proposedVendorTaxId?.trim() || receipt.proposedVendorName?.trim() || '');
  }, [receipt]);

  useEffect(() => {
    if (!receipt) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('type', 'VENDOR');
        params.set('isActive', 'true');
        if (search.trim()) params.set('search', search.trim());
        params.set('take', '20');
        const res = await api<{ items: PartnerOption[] }>(`/partners?${params.toString()}`);
        setResults(res.items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, receipt]);

  async function save() {
    if (!receipt || !selected) return;
    setSaving(true);
    try {
      await api(`/expense-receipts/${receipt.id}/link-vendor`, {
        method: 'POST',
        body: JSON.stringify({ vendorId: selected.id }),
      });
      toast.success(isReLink ? 'เปลี่ยนผู้ขายแล้ว' : 'ผูกผู้ขายแล้ว');
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function createAndLink() {
    if (!receipt || !proposed) return;
    setCreating(true);
    try {
      await api(`/expense-receipts/${receipt.id}/approve-vendor`, {
        method: 'POST',
        body: JSON.stringify({
          nameTh: proposed.nameTh || undefined,
          taxId: proposed.taxId || undefined,
          branch: proposed.branch || undefined,
          address: proposed.address || undefined,
        }),
      });
      toast.success('สร้างผู้ขายใหม่และผูกใบเสร็จแล้ว');
      onSaved();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error('พบผู้ขายเดิมในระบบแล้ว — กรุณาเลือกจากผลการค้นหา');
        if (proposed.taxId) setSearch(proposed.taxId);
      } else {
        toast.error(e instanceof Error ? e.message : 'สร้างผู้ขายล้มเหลว');
      }
    } finally {
      setCreating(false);
    }
  }

  const unchanged = !!receipt?.vendor && selected?.id === receipt.vendor.id;
  const showCreateNew =
    canApproveVendor && !!proposed?.nameTh && !loading && results.length === 0;
  const showCantCreateHint =
    !canApproveVendor && !!proposed?.nameTh && !loading && results.length === 0;

  return (
    <Modal
      open={!!receipt}
      onClose={() => {
        if (saving || creating) return;
        onClose();
      }}
      title={isReLink ? 'เปลี่ยนผู้ขายของใบเสร็จ' : 'ผูกใบเสร็จกับผู้ขาย'}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || creating}
            className="rounded-md border border-border px-4 py-2 text-[13px] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!selected || saving || creating || unchanged}
            title={
              !selected
                ? 'เลือกผู้ขายจากรายการก่อน'
                : unchanged
                  ? 'ยังไม่ได้เปลี่ยนผู้ขาย'
                  : undefined
            }
            className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {isReLink && receipt && (
          <div className="rounded-md border border-info/40 bg-info/5 p-3">
            <div className="text-[11.5px] text-text-mute">ผู้ขายที่ผูกอยู่</div>
            <div className="mt-0.5 font-medium text-text">{receipt.vendor!.nameTh}</div>
            <div className="font-mono text-[11px] text-text-mute">
              {receipt.vendor!.taxId ?? 'ไม่มีเลขผู้เสียภาษี'}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px] font-medium text-text-soft">
            <span>ค้นหาผู้ขายในระบบ</span>
            {proposed && (
              <span className="text-[11px] font-normal text-text-mute">
                เริ่มต้นจากข้อมูลที่ AI อ่านได้
              </span>
            )}
          </label>
          <div className="relative">
            <input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (selected && !isReLink) setSelected(null);
              }}
              placeholder="ชื่อ / รหัส / เลขผู้เสียภาษี"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 pr-9 text-[14px] outline-none focus:border-brand"
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner size={14} />
              </span>
            )}
          </div>

          <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-border bg-surface">
            {!loading && results.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12.5px] text-text-mute">
                {search.trim() ? 'ไม่พบผู้ขายในระบบที่ตรงกับคำค้น' : 'พิมพ์เพื่อค้นหา…'}
              </div>
            ) : (
              results.map((p) => {
                const isSelected = selected?.id === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`flex w-full items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-left text-[13px] first:border-t-0 ${
                      isSelected ? 'bg-brand/10' : 'hover:bg-surface-3'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text">{p.nameTh}</span>
                      <span className="block font-mono text-[11px] text-text-mute">
                        {p.taxId ?? 'ไม่มีเลขผู้เสียภาษี'}
                        {p.code && ` · ${p.code}`}
                      </span>
                    </span>
                    {isSelected && (
                      <span className="shrink-0 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10.5px] font-medium text-brand">
                        ✓ เลือกแล้ว
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {showCreateNew && (
          <div className="rounded-md border border-warn/40 bg-warn/5 p-3">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-warn">
              <span>ไม่พบในระบบ</span>
              <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] font-normal">
                เพิ่มจากข้อมูลที่ AI พบ
              </span>
            </div>
            <div className="mt-2 grid grid-cols-[80px_1fr] gap-y-1 text-[13px]">
              <div className="text-text-mute">ชื่อ:</div>
              <div className="font-medium text-text">{proposed!.nameTh}</div>
              {proposed!.taxId && (
                <>
                  <div className="text-text-mute">เลขผู้เสียภาษี:</div>
                  <div className="font-mono text-text">{proposed!.taxId}</div>
                </>
              )}
              {proposed!.branch && (
                <>
                  <div className="text-text-mute">สาขา:</div>
                  <div className="text-text">{proposed!.branch}</div>
                </>
              )}
              {proposed!.address && (
                <>
                  <div className="text-text-mute">ที่อยู่:</div>
                  <div className="text-text-soft">{proposed!.address}</div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={createAndLink}
              disabled={creating || saving}
              className="mt-3 w-full rounded-md bg-warn px-3 py-2 text-[13px] font-medium text-white shadow-sm disabled:opacity-60"
            >
              {creating ? 'กำลังสร้างผู้ขายและผูกใบเสร็จ…' : '+ เพิ่มเป็นผู้ขายใหม่ และผูกใบเสร็จทันที'}
            </button>
          </div>
        )}

        {showCantCreateHint && (
          <div className="rounded-md border border-info/40 bg-info/5 p-3 text-[12.5px] text-text-soft">
            ไม่พบในระบบ — เฉพาะ OWNER / ADMIN เท่านั้นที่สามารถเพิ่มผู้ขายใหม่ได้
          </div>
        )}
      </div>
    </Modal>
  );
}