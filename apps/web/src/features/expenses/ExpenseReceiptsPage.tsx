'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ExpenseReceiptStatus, PartnerType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Empty } from '@/components/ui/Empty';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api, apiBlob } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort, formatThaiDateTime } from '@/lib/format';

function checkAccount(item: ExpenseReceipt): { ok: boolean; reason: string } {
  const amount = Number(item.grandTotal);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'ต้องระบุยอดรวมมากกว่า 0 ก่อนลงรายจ่าย' };
  }
  if (!item.paidAt && !item.documentDate) {
    return { ok: false, reason: 'ต้องระบุวันที่จ่ายหรือวันที่เอกสารก่อนลงรายจ่าย' };
  }
  return { ok: true, reason: '' };
}

interface Partner {
  id: string;
  code: string | null;
  nameTh: string;
  taxId: string | null;
  branch?: string | null;
  address: string | null;
  type: PartnerType;
}

interface ExpenseReceipt {
  id: string;
  status: ExpenseReceiptStatus;
  vendorId: string | null;
  vendor: Partner | null;
  proposedVendorName: string | null;
  proposedVendorTaxId: string | null;
  proposedVendorBranch: string | null;
  proposedVendorAddress: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  paidAt: string | null;
  category: string | null;
  subtotal: string;
  vatAmount: string;
  withholdingTaxAmount: string;
  grandTotal: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  rejectReason: string | null;
  createdAt: string;
  expenseRecord: { id: string } | null;
}

const STATUS: Record<ExpenseReceiptStatus, { label: string; cls: string }> = {
  UPLOADED: { label: 'รอเติมข้อมูล', cls: 'border-info/40 bg-info/10 text-info' },
  PENDING_VENDOR_APPROVAL: { label: 'รออนุมัติผู้ขาย', cls: 'border-warn/40 bg-warn/10 text-warn' },
  READY_TO_ACCOUNT: { label: 'พร้อมลงรายจ่าย', cls: 'border-ok/40 bg-ok/10 text-ok' },
  ACCOUNTED: { label: 'ลงรายจ่ายแล้ว', cls: 'border-border bg-surface-3 text-text-soft' },
  REJECTED: { label: 'ปฏิเสธ', cls: 'border-bad/40 bg-bad/10 text-bad' },
};

const EMPTY_UPLOAD = {
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
};

export function ExpenseReceiptsPage() {
  const toast = useToast();
  const [items, setItems] = useState<ExpenseReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ExpenseReceiptStatus | ''>('');
  const [includeAccounted, setIncludeAccounted] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [linking, setLinking] = useState<ExpenseReceipt | null>(null);

  const role = getUser()?.role;
  const canUpload = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';
  const canApproveVendor = role === 'OWNER' || role === 'ADMIN';
  const canAccount = canUpload;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (includeAccounted) params.set('includeAccounted', 'true');
      params.set('take', '100');
      const res = await api<{ items: ExpenseReceipt[]; total: number }>(`/expense-receipts?${params.toString()}`);
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, includeAccounted]);

  async function approveNewVendor(receipt: ExpenseReceipt) {
    try {
      await api(`/expense-receipts/${receipt.id}/approve-vendor`, {
        method: 'POST',
        body: JSON.stringify({
          nameTh: receipt.proposedVendorName,
          taxId: receipt.proposedVendorTaxId,
          branch: receipt.proposedVendorBranch,
          address: receipt.proposedVendorAddress,
        }),
      });
      toast.success('อนุมัติและเพิ่มผู้ขายแล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function accountReceipt(receipt: ExpenseReceipt) {
    try {
      await api(`/expense-receipts/${receipt.id}/account`, { method: 'POST' });
      toast.success('บันทึกรายจ่ายแล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function viewFile(receipt: ExpenseReceipt) {
    // Open the tab synchronously inside the click handler — popup blockers
    // require the window.open() call to be within the original user gesture,
    // so we cannot wait for the fetch to finish first.
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast.error('เบราว์เซอร์บล็อกการเปิดไฟล์ — กรุณาอนุญาต popup');
      return;
    }
    try {
      const blob = await apiBlob(`/expense-receipts/${receipt.id}/file`);
      const url = URL.createObjectURL(blob);
      popup.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      popup.close();
      toast.error(e.message ?? 'เปิดไฟล์ไม่สำเร็จ');
    }
  }

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === 'PENDING_VENDOR_APPROVAL').length,
    [items],
  );

  return (
    <>
      <AppTopbar title="รายจ่าย / ใบเสร็จ" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">อัปโหลดใบเสร็จรายจ่าย</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              เก็บหลักฐานรายจ่าย ตรวจผู้ขายใหม่/เก่า และบันทึกรายการจ่ายเข้ากับผู้ขาย
            </p>
          </div>
          {canUpload && (
            <button
              onClick={() => setUploadOpen(true)}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + อัปโหลดใบเสร็จ
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <SummaryCard label="ทั้งหมดในมุมมองนี้" value={total.toString()} />
          <SummaryCard label="รออนุมัติผู้ขาย" value={pendingCount.toString()} tone="warn" />
          <SummaryCard
            label="พร้อมลงรายจ่าย"
            value={items.filter((item) => item.status === 'READY_TO_ACCOUNT').length.toString()}
            tone="ok"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาผู้ขาย / เลขผู้เสียภาษี / เลขที่เอกสาร"
            className="w-96 rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ExpenseReceiptStatus | '')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
          >
            <option value="">ทุกสถานะที่ยังไม่ลงบัญชี</option>
            {Object.entries(STATUS).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-[13px] text-text-soft">
            <input
              type="checkbox"
              checked={includeAccounted}
              onChange={(e) => setIncludeAccounted(e.target.checked)}
            />
            แสดงที่ลงรายจ่ายแล้ว
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-4 py-3 font-medium">วันที่</th>
                <th className="px-4 py-3 font-medium">ผู้ขาย</th>
                <th className="px-4 py-3 font-medium">เอกสาร</th>
                <th className="px-4 py-3 text-right font-medium">ยอดสุทธิ</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center"><Spinner /></td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <Empty title="ยังไม่มีใบเสร็จรายจ่าย" description="เริ่มจากอัปโหลดไฟล์ PDF หรือรูปภาพใบเสร็จ" />
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text-soft">
                      {item.documentDate ? formatThaiDateShort(item.documentDate) : formatThaiDateTime(item.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.vendor?.nameTh ?? item.proposedVendorName ?? 'ยังไม่ระบุผู้ขาย'}</div>
                      <div className="font-mono text-[11px] text-text-mute">
                        {item.vendor?.taxId ?? item.proposedVendorTaxId ?? 'ไม่มีเลขผู้เสียภาษี'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.documentNumber ?? item.originalFileName}</div>
                      <div className="text-[11px] text-text-mute">{item.category ?? 'ไม่ระบุหมวดรายจ่าย'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatThaiCurrency(item.grandTotal)}</td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3">
                      <RowActions
                        item={item}
                        canApproveVendor={canApproveVendor}
                        canUpload={canUpload}
                        canAccount={canAccount}
                        onApproveNewVendor={() => approveNewVendor(item)}
                        onLink={() => setLinking(item)}
                        onAccount={() => accountReceipt(item)}
                        onView={() => viewFile(item)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UploadReceiptModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          setUploadOpen(false);
          load();
        }}
      />

      <LinkVendorModal
        receipt={linking}
        canApproveVendor={canApproveVendor}
        onClose={() => setLinking(null)}
        onSaved={() => {
          setLinking(null);
          load();
        }}
      />
    </>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' }) {
  const cls = tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-text';
  return (
    <div className="rounded-lg border border-border bg-surface/80 px-4 py-3 shadow-sm">
      <div className="text-[12px] text-text-mute">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ExpenseReceiptStatus }) {
  const meta = STATUS[status];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function RowActions({
  item,
  canApproveVendor,
  canUpload,
  canAccount,
  onApproveNewVendor,
  onLink,
  onAccount,
  onView,
}: {
  item: ExpenseReceipt;
  canApproveVendor: boolean;
  canUpload: boolean;
  canAccount: boolean;
  onApproveNewVendor: () => void;
  onLink: () => void;
  onAccount: () => void;
  onView: () => void;
}) {
  // Mirror server-side guards (H4) so the user sees the failure reason before
  // hitting the API and getting a 422 in a toast.
  const preflight = checkAccount(item);
  const showLink =
    canUpload && (item.status === 'UPLOADED' || item.status === 'PENDING_VENDOR_APPROVAL');
  const showReLink = canUpload && item.status === 'READY_TO_ACCOUNT';
  const showApproveNew =
    canApproveVendor && item.status === 'PENDING_VENDOR_APPROVAL' && !!item.proposedVendorName;
  const showAccount = canAccount && item.status === 'READY_TO_ACCOUNT';

  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={onView}
        title="เปิดไฟล์ใบเสร็จในแท็บใหม่"
        className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
      >
        ดูไฟล์
      </button>
      {showApproveNew && (
        <button
          onClick={onApproveNewVendor}
          className="rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1 text-[12px] text-warn hover:bg-warn/10"
        >
          อนุมัติผู้ขายใหม่
        </button>
      )}
      {showLink && (
        <button
          onClick={onLink}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
        >
          ผูกผู้ขายเดิม
        </button>
      )}
      {showReLink && (
        <button
          onClick={onLink}
          title="เปลี่ยนผู้ขายที่ผูกไว้ก่อนลงรายจ่าย"
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
        >
          เปลี่ยนผู้ขาย
        </button>
      )}
      {showAccount && (
        <button
          onClick={onAccount}
          disabled={!preflight.ok}
          title={preflight.ok ? 'ลงรายจ่ายเข้าระบบ' : preflight.reason}
          className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
        >
          บันทึกรายจ่าย
        </button>
      )}
    </div>
  );
}

function UploadReceiptModal({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(EMPTY_UPLOAD);
  const [saving, setSaving] = useState(false);

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
        if (value) body.set(key, value);
      });
      await api('/expense-receipts/upload', { method: 'POST', body });
      toast.success('อัปโหลดใบเสร็จแล้ว');
      setFile(null);
      setForm(EMPTY_UPLOAD);
      onUploaded();
    } catch (e: any) {
      toast.error(e.message);
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
        <Field label="ชื่อผู้ขาย" value={form.vendorName} onChange={(vendorName) => setForm((v) => ({ ...v, vendorName }))} />
        <Field label="เลขผู้เสียภาษีผู้ขาย" value={form.vendorTaxId} onChange={(vendorTaxId) => setForm((v) => ({ ...v, vendorTaxId }))} />
        <Field label="สาขา" value={form.vendorBranch} onChange={(vendorBranch) => setForm((v) => ({ ...v, vendorBranch }))} />
        <Field label="เลขที่เอกสาร" value={form.documentNumber} onChange={(documentNumber) => setForm((v) => ({ ...v, documentNumber }))} />
        <Field type="date" label="วันที่เอกสาร" value={form.documentDate} onChange={(documentDate) => setForm((v) => ({ ...v, documentDate }))} />
        <Field type="date" label="วันที่จ่าย" value={form.paidAt} onChange={(paidAt) => setForm((v) => ({ ...v, paidAt }))} />
        <Field label="หมวดรายจ่าย" value={form.category} onChange={(category) => setForm((v) => ({ ...v, category }))} placeholder="เช่น ค่าซอฟต์แวร์ / ค่าเดินทาง" />
        <Field label="ยอดก่อน VAT" value={form.subtotal} onChange={(subtotal) => setForm((v) => ({ ...v, subtotal }))} />
        <Field label="VAT" value={form.vatAmount} onChange={(vatAmount) => setForm((v) => ({ ...v, vatAmount }))} />
        <Field label="หัก ณ ที่จ่าย" value={form.withholdingTaxAmount} onChange={(withholdingTaxAmount) => setForm((v) => ({ ...v, withholdingTaxAmount }))} />
        <Field label="ยอดสุทธิ" value={form.grandTotal} onChange={(grandTotal) => setForm((v) => ({ ...v, grandTotal }))} />
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

function LinkVendorModal({
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
  const [results, setResults] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Partner | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const isReLink = !!receipt?.vendor;

  // The AI-extracted vendor info from the file. Used as the seed for both
  // the search query (so user sees matches by taxId/name immediately) and
  // the "create new + link" CTA when nothing matches.
  const proposed = useMemo(() => {
    if (!receipt) return null;
    const name = receipt.proposedVendorName?.trim() ?? '';
    const taxId = receipt.proposedVendorTaxId?.trim() ?? '';
    const branch = receipt.proposedVendorBranch?.trim() ?? '';
    const address = receipt.proposedVendorAddress?.trim() ?? '';
    if (!name && !taxId && !branch && !address) return null;
    return { nameTh: name, taxId, branch, address };
  }, [receipt]);

  // Pre-seed search: prefer taxId (exact match), fall back to name. Pre-select
  // the currently-linked vendor when re-linking so save is disabled until
  // the operator actually picks a different one.
  useEffect(() => {
    if (!receipt) return;
    setSelected(receipt.vendor);
    setSaving(false);
    setCreating(false);
    setSearch(receipt.proposedVendorTaxId?.trim() || receipt.proposedVendorName?.trim() || '');
  }, [receipt]);

  // Debounced live search — re-runs on every keystroke or when the modal opens.
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
        const res = await api<{ items: Partner[] }>(`/partners?${params.toString()}`);
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
    } catch (e: any) {
      toast.error(e.message);
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
    } catch (e: any) {
      // H5 — backend rejected because a vendor with this taxId/name already
      // exists. Nudge the operator to pick from the list (re-running search
      // by the exact taxId surfaces the existing row at the top).
      if (e instanceof ApiError && e.status === 409) {
        toast.error('พบผู้ขายเดิมในระบบแล้ว — กรุณาเลือกจากผลการค้นหา');
        if (proposed.taxId) setSearch(proposed.taxId);
      } else {
        toast.error(e.message ?? 'สร้างผู้ขายล้มเหลว');
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

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="mb-1 block text-[12.5px] text-text-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
      />
    </label>
  );
}
