'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ExpenseReceiptStatus, PartnerType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Empty } from '@/components/ui/Empty';
import { Modal } from '@/components/ui/Modal';
import { PartnerPicker } from '@/components/ui/PartnerPicker';
import { Spinner } from '@/components/ui/Spinner';
import { ThaiDatePicker } from '@/components/ui/ThaiDatePicker';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort, formatThaiDateTime } from '@/lib/format';

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
  PENDING_VENDOR_APPROVAL: { label: 'รออนุมัติผู้รับเงินใหม่', cls: 'border-warn/40 bg-warn/10 text-warn' },
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
      toast.success('อนุมัติผู้รับเงินใหม่แล้ว');
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
              เก็บหลักฐานรายจ่าย ตรวจผู้รับเงินใหม่/เก่า และบันทึกรายการจ่าย
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
          <SummaryCard label="รออนุมัติผู้รับเงินใหม่" value={pendingCount.toString()} tone="warn" />
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
            placeholder="ค้นหาผู้รับเงิน / เลขผู้เสียภาษี / เลขที่เอกสาร"
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
                <th className="px-4 py-3 font-medium">ผู้รับเงิน</th>
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
                      <div className="font-medium">{item.vendor?.nameTh ?? item.proposedVendorName ?? 'ยังไม่ระบุผู้รับเงิน'}</div>
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
                      <div className="flex justify-end gap-2">
                        {canApproveVendor && item.status === 'PENDING_VENDOR_APPROVAL' && (
                          <button
                            onClick={() => approveNewVendor(item)}
                            className="rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1 text-[12px] text-warn hover:bg-warn/10"
                          >
                            อนุมัติผู้รับเงินใหม่
                          </button>
                        )}
                        {canUpload && item.status !== 'ACCOUNTED' && item.status !== 'REJECTED' && (
                          <button
                            onClick={() => setLinking(item)}
                            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
                          >
                            ผูกผู้รับเงิน
                          </button>
                        )}
                        {canAccount && item.status === 'READY_TO_ACCOUNT' && (
                          <button
                            onClick={() => accountReceipt(item)}
                            className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90"
                          >
                            บันทึกรายจ่าย
                          </button>
                        )}
                      </div>
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

function UploadReceiptModal({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(EMPTY_UPLOAD);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

  async function extractWithAi() {
    if (!file) {
      toast.error('กรุณาเลือกไฟล์ใบเสร็จก่อน');
      return;
    }

    setExtracting(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await api<{ fields: typeof EMPTY_UPLOAD }>('/expense-receipts/ai-extract', {
        method: 'POST',
        body,
      });
      setForm((current) => ({ ...current, ...res.fields }));
      toast.success('AI อ่านข้อมูลจากใบเสร็จแล้ว กรุณาตรวจทานก่อนอัปโหลด');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExtracting(false);
    }
  }

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
            type="button"
            onClick={extractWithAi}
            disabled={!file || extracting || saving}
            className="rounded-md border border-brand/40 bg-brand/5 px-4 py-2 text-[13px] font-medium text-brand disabled:opacity-60"
          >
            {extracting ? 'AI กำลังอ่าน…' : 'อ่านไฟล์ด้วย AI'}
          </button>
          <button
            type="submit"
            form="upload-expense-receipt-form"
            disabled={saving || extracting}
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
          <span className="mt-1 block text-[11.5px] text-text-mute">
            เลือกไฟล์แล้วกด “อ่านไฟล์ด้วย AI” เพื่อ OCR และเติมข้อมูลอัตโนมัติ ไฟล์เดิมจะถูกแนบตอนกดอัปโหลดจริง
          </span>
        </label>
        <Field label="ชื่อผู้รับเงิน" value={form.vendorName} onChange={(vendorName) => setForm((v) => ({ ...v, vendorName }))} />
        <Field label="เลขผู้เสียภาษีผู้รับเงิน" value={form.vendorTaxId} onChange={(vendorTaxId) => setForm((v) => ({ ...v, vendorTaxId }))} />
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
          <span className="mb-1 block text-[12.5px] text-text-soft">ที่อยู่ผู้รับเงิน / หมายเหตุ</span>
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

function LinkVendorModal({ receipt, onClose, onSaved }: { receipt: ExpenseReceipt | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [vendor, setVendor] = useState<Partner | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVendor(receipt?.vendor ?? null);
  }, [receipt]);

  async function save() {
    if (!receipt || !vendor) return;
    setSaving(true);
    try {
      await api(`/expense-receipts/${receipt.id}/link-vendor`, {
        method: 'POST',
        body: JSON.stringify({ vendorId: vendor.id }),
      });
      toast.success('ผูกผู้รับเงินแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!receipt}
      onClose={onClose}
      title="ผูกใบเสร็จกับผู้รับเงินเดิม"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!vendor || saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {receipt && (
          <div className="rounded-md border border-border bg-surface-2 p-3 text-[13px] text-text-soft">
            ระบบพบจากไฟล์: {receipt.proposedVendorName ?? 'ไม่ระบุชื่อ'} · {receipt.proposedVendorTaxId ?? 'ไม่มีเลขผู้เสียภาษี'}
          </div>
        )}
        <PartnerPicker
          type="VENDOR"
          value={vendor}
          onChange={setVendor}
          placeholder="ค้นหาและเลือกผู้รับเงินเดิม"
        />
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
      {type === 'date' ? (
        <ThaiDatePicker value={value} onChange={(iso) => onChange(iso)} placeholder={placeholder ?? 'เลือกวันที่'} />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
        />
      )}
    </label>
  );
}
