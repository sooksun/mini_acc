'use client';

import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from 'react';
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

interface ForeignTaxObligation {
  id: string;
  kind: 'PP36_VAT' | 'PND54_WHT';
  status: 'PENDING' | 'FILED' | 'CREDITED';
  baseAmount: string;
  rate: string;
  taxAmount: string;
  expensePeriodYear: number;
  expensePeriodMonth: number;
  filePeriodYear: number;
  filePeriodMonth: number;
  filedAt: string | null;
  journalEntryId: string | null;
  expenseRecord?: {
    id: string;
    documentNumber: string | null;
    category: string | null;
    expenseDate: string;
    currency: string;
    foreignSubtotal: string | null;
    foreignWhtType: 'ROYALTY' | 'SERVICE' | 'OTHER' | null;
    foreignWhtBorneBy: 'WITHHELD' | 'RECOVERABLE' | 'GROSSED_UP' | null;
    vendor: { nameTh: string } | null;
  } | null;
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
  isForeign: boolean;
  expenseNature: 'GOODS' | 'SERVICE' | null;
  usedInThailand: boolean;
  currency: string;
  fxRate: string;
  foreignSubtotal: string | null;
  reverseChargeVat: boolean;
  reverseChargeVatRate: string;
  dtaCountry: string | null;
  foreignWhtType: 'ROYALTY' | 'SERVICE' | 'OTHER' | null;
  foreignWhtBorneBy: 'WITHHELD' | 'RECOVERABLE' | 'GROSSED_UP' | null;
  foreignWhtRate: string | null;
  billedToName: string | null;
  billingNameMismatch: boolean;
  treatAsIntangible: boolean;
  intangibleUsefulLifeMonths: number | null;
  serviceStart: string | null;
  serviceEnd: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  rejectReason: string | null;
  createdAt: string;
  expenseRecord: { id: string; foreignTaxObligations?: ForeignTaxObligation[] } | null;
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
  // Foreign expense (PP.36). Booleans stay booleans; the rest are strings.
  isForeign: false,
  expenseNature: '' as '' | 'GOODS' | 'SERVICE',
  usedInThailand: true,
  currency: '',
  fxRate: '',
  foreignSubtotal: '',
  reverseChargeVat: false,
  reverseChargeVatRate: '',
  dtaCountry: '',
  // PND.54 (F3)
  foreignWhtType: '' as '' | 'ROYALTY' | 'SERVICE' | 'OTHER',
  foreignWhtBorneBy: '' as '' | 'WITHHELD' | 'RECOVERABLE' | 'GROSSED_UP',
  foreignWhtRate: '',
  // F4 — billing-name guard / capitalize / prepaid window
  billedToName: '',
  treatAsIntangible: false,
  intangibleUsefulLifeMonths: '',
  serviceStart: '',
  serviceEnd: '',
};

type ExpenseForm = typeof EMPTY_UPLOAD;

// Foreign string fields that must be omitted (not sent as "") when empty —
// the API validates enum/currency/country formats and rejects empty strings.
const FOREIGN_SKIP_IF_EMPTY = new Set([
  'expenseNature',
  'dtaCountry',
  'currency',
  'fxRate',
  'foreignSubtotal',
  'reverseChargeVatRate',
  'foreignWhtType',
  'foreignWhtBorneBy',
  'foreignWhtRate',
]);

// All foreign-expense keys — excluded from the generic field loop so booleans
// (incl. `false`) and skip-if-empty optionals are sent via foreignPayload().
const FOREIGN_KEYS = new Set([
  'isForeign',
  'expenseNature',
  'usedInThailand',
  'currency',
  'fxRate',
  'foreignSubtotal',
  'reverseChargeVat',
  'reverseChargeVatRate',
  'dtaCountry',
  'foreignWhtType',
  'foreignWhtBorneBy',
  'foreignWhtRate',
  // F4 — handled via capitalizationPayload (booleans/dates/optionals)
  'billedToName',
  'treatAsIntangible',
  'intangibleUsefulLifeMonths',
  'serviceStart',
  'serviceEnd',
]);

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/** THB subtotal from foreign amount × fx rate, rounded to 2 dp. '' if incomplete. */
function computeThb(foreignSubtotal: string, fxRate: string): string {
  const fs = Number(foreignSubtotal);
  const fx = Number(fxRate);
  if (!foreignSubtotal || !fxRate || !Number.isFinite(fs) || !Number.isFinite(fx)) return '';
  return (Math.round(fs * fx * 100) / 100).toFixed(2);
}

/** Build the foreign-field subset of a request payload, skipping empty optionals. */
function foreignPayload(form: ExpenseForm): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { isForeign: form.isForeign };
  if (!form.isForeign) return out;
  out.usedInThailand = form.usedInThailand;
  out.reverseChargeVat = form.reverseChargeVat;
  for (const key of FOREIGN_SKIP_IF_EMPTY) {
    const value = (form as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return out;
}

/** F4 fields — sent for every expense (not foreign-only). */
function capitalizationPayload(form: ExpenseForm): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {
    billedToName: form.billedToName,
    treatAsIntangible: form.treatAsIntangible,
  };
  if (form.intangibleUsefulLifeMonths.trim())
    out.intangibleUsefulLifeMonths = form.intangibleUsefulLifeMonths;
  if (form.serviceStart) out.serviceStart = form.serviceStart;
  if (form.serviceEnd) out.serviceEnd = form.serviceEnd;
  return out;
}

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
  const [editing, setEditing] = useState<ExpenseReceipt | null>(null);
  const [pp36Open, setPp36Open] = useState(false);

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
    // window.open must be called synchronously within the click handler to avoid
    // popup blockers. If it still gets blocked (null), fall back to download.
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    try {
      const blob = await apiBlob(`/expense-receipts/${receipt.id}/file`);
      const url = URL.createObjectURL(blob);
      if (popup) {
        popup.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = receipt.originalFileName ?? 'receipt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (e: any) {
      popup?.close();
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPp36Open(true)}
              className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-soft hover:bg-surface-3"
            >
              ภาษีนำส่ง (ภ.พ.36/54)
            </button>
            {canUpload && (
              <button
                onClick={() => setUploadOpen(true)}
                className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
              >
                + อัปโหลดใบเสร็จ
              </button>
            )}
          </div>
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
                  <td colSpan={7} className="px-4 py-10 text-center"><Spinner /></td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10">
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
                      {item.billingNameMismatch && (
                        <span className="mt-0.5 inline-flex rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">
                          ชื่อบนใบไม่ตรงกิจการ
                        </span>
                      )}
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
                        onEdit={() => setEditing(item)}
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

      <EditReceiptModal
        receipt={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      <Pp36Modal open={pp36Open} onClose={() => setPp36Open(false)} canFile={canAccount} />
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
  onEdit,
}: {
  item: ExpenseReceipt;
  canApproveVendor: boolean;
  canUpload: boolean;
  canAccount: boolean;
  onApproveNewVendor: () => void;
  onLink: () => void;
  onAccount: () => void;
  onView: () => void;
  onEdit: () => void;
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
  const showEdit =
    canUpload && item.status !== 'ACCOUNTED' && item.status !== 'REJECTED';

  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={onView}
        title="เปิดไฟล์ใบเสร็จในแท็บใหม่"
        className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
      >
        ดูไฟล์
      </button>
      {showEdit && (
        <button
          onClick={onEdit}
          title="แก้ไขข้อมูล/ยอดเงินของใบเสร็จ"
          className="rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 text-[12px] font-medium text-brand hover:bg-brand/10"
        >
          แก้ไข
        </button>
      )}
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

  // Foreign expenses are booked in THB: derive subtotal/grandTotal from the
  // foreign amount × fx rate and force VAT=0 (the vendor charges no Thai VAT).
  useEffect(() => {
    if (!form.isForeign) return;
    const thb = computeThb(form.foreignSubtotal, form.fxRate);
    if (!thb) return;
    const wht = Number(form.withholdingTaxAmount || '0') || 0;
    setForm((v) => ({ ...v, subtotal: thb, vatAmount: '0', grandTotal: (Number(thb) - wht).toFixed(2) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.isForeign, form.foreignSubtotal, form.fxRate, form.withholdingTaxAmount]);

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
        <Field label="ยอดก่อน VAT (บาท)" value={form.subtotal} onChange={(subtotal) => setForm((v) => ({ ...v, subtotal }))} disabled={form.isForeign} />
        <Field label="VAT" value={form.vatAmount} onChange={(vatAmount) => setForm((v) => ({ ...v, vatAmount }))} disabled={form.isForeign} />
        <Field label="หัก ณ ที่จ่าย" value={form.withholdingTaxAmount} onChange={(withholdingTaxAmount) => setForm((v) => ({ ...v, withholdingTaxAmount }))} />
        <Field label="ยอดสุทธิ (บาท)" value={form.grandTotal} onChange={(grandTotal) => setForm((v) => ({ ...v, grandTotal }))} disabled={form.isForeign} />
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

function EditReceiptModal({
  receipt,
  onClose,
  onSaved,
}: {
  receipt: ExpenseReceipt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_UPLOAD);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    setForm({
      vendorName: receipt.proposedVendorName ?? receipt.vendor?.nameTh ?? '',
      vendorTaxId: receipt.proposedVendorTaxId ?? receipt.vendor?.taxId ?? '',
      vendorBranch: receipt.proposedVendorBranch ?? receipt.vendor?.branch ?? '',
      vendorAddress: receipt.proposedVendorAddress ?? receipt.vendor?.address ?? '',
      documentNumber: receipt.documentNumber ?? '',
      documentDate: receipt.documentDate ? receipt.documentDate.slice(0, 10) : '',
      paidAt: receipt.paidAt ? receipt.paidAt.slice(0, 10) : '',
      category: receipt.category ?? '',
      subtotal: receipt.subtotal ?? '',
      vatAmount: receipt.vatAmount ?? '',
      withholdingTaxAmount: receipt.withholdingTaxAmount ?? '',
      grandTotal: receipt.grandTotal ?? '',
      note: '',
      isForeign: receipt.isForeign,
      expenseNature: receipt.expenseNature ?? '',
      usedInThailand: receipt.usedInThailand,
      currency: receipt.isForeign ? receipt.currency : '',
      fxRate: receipt.isForeign && receipt.fxRate !== '1' ? receipt.fxRate : '',
      foreignSubtotal: receipt.foreignSubtotal ?? '',
      reverseChargeVat: receipt.reverseChargeVat,
      reverseChargeVatRate: receipt.isForeign ? receipt.reverseChargeVatRate : '',
      dtaCountry: receipt.dtaCountry ?? '',
      foreignWhtType: receipt.foreignWhtType ?? '',
      foreignWhtBorneBy: receipt.foreignWhtBorneBy ?? '',
      foreignWhtRate: receipt.foreignWhtRate ?? '',
      billedToName: receipt.billedToName ?? '',
      treatAsIntangible: receipt.treatAsIntangible,
      intangibleUsefulLifeMonths:
        receipt.intangibleUsefulLifeMonths != null
          ? String(receipt.intangibleUsefulLifeMonths)
          : '',
      serviceStart: receipt.serviceStart ? receipt.serviceStart.slice(0, 10) : '',
      serviceEnd: receipt.serviceEnd ? receipt.serviceEnd.slice(0, 10) : '',
    });
  }, [receipt]);

  // Mirror the upload modal: keep THB amounts in sync with foreign × fx.
  useEffect(() => {
    if (!form.isForeign) return;
    const thb = computeThb(form.foreignSubtotal, form.fxRate);
    if (!thb) return;
    const wht = Number(form.withholdingTaxAmount || '0') || 0;
    setForm((v) => ({ ...v, subtotal: thb, vatAmount: '0', grandTotal: (Number(thb) - wht).toFixed(2) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.isForeign, form.foreignSubtotal, form.fxRate, form.withholdingTaxAmount]);

  // Live reconcile preview so the operator fixes mismatches before saving —
  // the account step requires subtotal + VAT − WHT === grandTotal exactly.
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
      // Send all fields shown (incl. empty → clears server-side), except:
      // - note: not edited here, omit so it isn't wiped
      // - vendorTaxId: only when filled (server validates strict 13 digits)
      const payload: Record<string, string | boolean> = {};
      Object.entries(form).forEach(([key, value]) => {
        if (key === 'note') return;
        if (FOREIGN_KEYS.has(key)) return; // sent via foreignPayload below
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
    } catch (e: any) {
      toast.error(e.message);
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
        <Field label="ชื่อผู้ขาย" value={form.vendorName} onChange={(vendorName) => setForm((v) => ({ ...v, vendorName }))} />
        <Field label="เลขผู้เสียภาษีผู้ขาย" value={form.vendorTaxId} onChange={(vendorTaxId) => setForm((v) => ({ ...v, vendorTaxId }))} />
        <Field label="สาขา" value={form.vendorBranch} onChange={(vendorBranch) => setForm((v) => ({ ...v, vendorBranch }))} />
        <Field label="เลขที่เอกสาร" value={form.documentNumber} onChange={(documentNumber) => setForm((v) => ({ ...v, documentNumber }))} />
        <Field type="date" label="วันที่เอกสาร" value={form.documentDate} onChange={(documentDate) => setForm((v) => ({ ...v, documentDate }))} />
        <Field type="date" label="วันที่จ่าย" value={form.paidAt} onChange={(paidAt) => setForm((v) => ({ ...v, paidAt }))} />
        <Field label="หมวดรายจ่าย" value={form.category} onChange={(category) => setForm((v) => ({ ...v, category }))} placeholder="เช่น ค่าซอฟต์แวร์ / ค่าเดินทาง" />
        <Field label="ยอดก่อน VAT (บาท)" value={form.subtotal} onChange={(subtotal) => setForm((v) => ({ ...v, subtotal }))} disabled={form.isForeign} />
        <Field label="VAT" value={form.vatAmount} onChange={(vatAmount) => setForm((v) => ({ ...v, vatAmount }))} disabled={form.isForeign} />
        <Field label="หัก ณ ที่จ่าย" value={form.withholdingTaxAmount} onChange={(withholdingTaxAmount) => setForm((v) => ({ ...v, withholdingTaxAmount }))} />
        <Field label="ยอดสุทธิ (บาท)" value={form.grandTotal} onChange={(grandTotal) => setForm((v) => ({ ...v, grandTotal }))} disabled={form.isForeign} />
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

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="mb-1 block text-[12.5px] text-text-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function ForeignExpenseSection({
  form,
  setForm,
}: {
  form: ExpenseForm;
  setForm: Dispatch<SetStateAction<ExpenseForm>>;
}) {
  const thb = computeThb(form.foreignSubtotal, form.fxRate);
  const isService = form.expenseNature === 'SERVICE';
  const rate = form.reverseChargeVatRate || '7';
  const pp36 =
    isService && form.reverseChargeVat && thb
      ? ((Number(thb) * Number(rate)) / 100).toFixed(2)
      : '';

  const whtRate = Number(form.foreignWhtRate || '0') || 0;
  const whtActive = !!form.foreignWhtType && whtRate > 0 && !!thb;
  const whtAmount = whtActive
    ? form.foreignWhtBorneBy === 'GROSSED_UP'
      ? Number(thb) / (1 - whtRate / 100) - Number(thb)
      : (Number(thb) * whtRate) / 100
    : 0;

  async function suggestRate() {
    try {
      const params = new URLSearchParams();
      if (form.dtaCountry) params.set('country', form.dtaCountry);
      params.set('incomeType', form.foreignWhtType || 'OTHER');
      const res = await api<{ rate: string } | null>(
        `/expense-receipts/foreign-wht-rate?${params.toString()}`,
      );
      if (res && res.rate) setForm((v) => ({ ...v, foreignWhtRate: res.rate }));
    } catch {
      /* suggestion only — ignore lookup errors */
    }
  }

  return (
    <div className="md:col-span-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
        <input
          type="checkbox"
          checked={form.isForeign}
          onChange={(e) => setForm((v) => ({ ...v, isForeign: e.target.checked }))}
        />
        รายจ่ายต่างประเทศ (ต่างสกุลเงิน / ภ.พ.36)
      </label>

      {form.isForeign && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">ประเภท</span>
            <select
              value={form.expenseNature}
              onChange={(e) =>
                setForm((v) => ({ ...v, expenseNature: e.target.value as '' | 'GOODS' | 'SERVICE' }))
              }
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            >
              <option value="">— เลือก —</option>
              <option value="SERVICE">บริการ / ซอฟต์แวร์ (ภ.พ.36)</option>
              <option value="GOODS">สินค้า (VAT ที่ศุลกากร)</option>
            </select>
          </label>
          <Field
            label="สกุลเงิน (เช่น USD)"
            value={form.currency}
            onChange={(currency) => setForm((v) => ({ ...v, currency }))}
            placeholder="USD"
          />
          <Field
            label="อัตราแลกเปลี่ยน (บาท/หน่วย)"
            value={form.fxRate}
            onChange={(fxRate) => setForm((v) => ({ ...v, fxRate }))}
            placeholder="36.50"
          />
          <Field
            label={`ยอดสกุลต่างประเทศ${form.currency ? ` (${form.currency})` : ''}`}
            value={form.foreignSubtotal}
            onChange={(foreignSubtotal) => setForm((v) => ({ ...v, foreignSubtotal }))}
            placeholder="106.65"
          />

          <div className="md:col-span-2 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-[12px] text-text-soft">
            ยอดบาทที่จะลงบัญชี ={' '}
            <span className="font-mono font-medium text-text">{thb || '—'}</span> บาท — VAT
            ในใบ = 0 (ผู้ขายต่างประเทศไม่เก็บ VAT ไทย)
          </div>

          {form.expenseNature === 'GOODS' && (
            <div className="md:col-span-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-warn">
              สินค้านำเข้า: VAT 7% เกิดที่ศุลกากร ใช้ใบขนสินค้า/ใบเสร็จกรมศุลกากรเป็นภาษีซื้อแยก —
              ระบบไม่ตั้ง ภ.พ.36 ให้
            </div>
          )}

          {isService && (
            <>
              <label className="flex items-center gap-2 text-[12.5px] text-text-soft md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.usedInThailand}
                  onChange={(e) => setForm((v) => ({ ...v, usedInThailand: e.target.checked }))}
                />
                บริการนี้ใช้ในประเทศไทย (เข้าเงื่อนไข ภ.พ.36)
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
                <input
                  type="checkbox"
                  checked={form.reverseChargeVat}
                  onChange={(e) => setForm((v) => ({ ...v, reverseChargeVat: e.target.checked }))}
                />
                ต้องนำส่ง VAT แทน (ภ.พ.36)
              </label>
              <Field
                label="อัตรา VAT ภ.พ.36 (%)"
                value={form.reverseChargeVatRate}
                onChange={(reverseChargeVatRate) => setForm((v) => ({ ...v, reverseChargeVatRate }))}
                placeholder="7"
              />
              {pp36 && (
                <div className="md:col-span-2 rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-[12px] text-ok">
                  ภ.พ.36 ที่ต้องนำส่ง ≈ <span className="font-mono font-medium">{pp36}</span> บาท —
                  ระบบจะตั้งยอดให้หลังลงรายจ่าย แล้วเครดิตภาษีซื้อเดือนถัดไป
                </div>
              )}
              <Field
                label="ประเทศคู่สัญญา (DTA, เช่น US)"
                value={form.dtaCountry}
                onChange={(dtaCountry) => setForm((v) => ({ ...v, dtaCountry }))}
                placeholder="US"
              />
            </>
          )}

          {/* PND.54 — withholding tax on the foreign payment */}
          <div className="md:col-span-2 border-t border-border pt-3">
            <div className="mb-2 text-[12.5px] font-medium text-text-soft">
              หัก ณ ที่จ่าย (ภ.ง.ด.54)
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-[12.5px] text-text-soft">ประเภทเงินได้</span>
                <select
                  value={form.foreignWhtType}
                  onChange={(e) =>
                    setForm((v) => ({
                      ...v,
                      foreignWhtType: e.target.value as '' | 'ROYALTY' | 'SERVICE' | 'OTHER',
                    }))
                  }
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
                >
                  <option value="">— ไม่หัก ณ ที่จ่าย —</option>
                  <option value="ROYALTY">ค่าสิทธิ 40(3) (license/ซอฟต์แวร์)</option>
                  <option value="SERVICE">ค่าบริการ/กำไรธุรกิจ</option>
                  <option value="OTHER">อื่น ๆ</option>
                </select>
              </label>
              {form.foreignWhtType && (
                <label>
                  <span className="mb-1 block text-[12.5px] text-text-soft">ผู้รับภาระภาษี</span>
                  <select
                    value={form.foreignWhtBorneBy}
                    onChange={(e) =>
                      setForm((v) => ({
                        ...v,
                        foreignWhtBorneBy: e.target.value as
                          | ''
                          | 'WITHHELD'
                          | 'RECOVERABLE'
                          | 'GROSSED_UP',
                      }))
                    }
                    className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
                  >
                    <option value="">— เลือก —</option>
                    <option value="WITHHELD">หักจากผู้ขาย</option>
                    <option value="RECOVERABLE">จ่ายเต็ม เรียกคืนภายหลัง</option>
                    <option value="GROSSED_UP">กิจการรับภาระเอง (gross-up)</option>
                  </select>
                </label>
              )}
              {form.foreignWhtType && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field
                      label="อัตรา (%)"
                      value={form.foreignWhtRate}
                      onChange={(foreignWhtRate) => setForm((v) => ({ ...v, foreignWhtRate }))}
                      placeholder="5"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={suggestRate}
                    className="mb-[1px] rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-text-soft hover:bg-surface-3"
                  >
                    ดึงอัตราแนะนำ
                  </button>
                </div>
              )}
              {whtAmount > 0 && (
                <div className="md:col-span-2 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-[12px] text-text-soft">
                  ภ.ง.ด.54 ประมาณ{' '}
                  <span className="font-mono font-medium text-text">{whtAmount.toFixed(2)}</span> บาท
                  {form.foreignWhtBorneBy === 'WITHHELD'
                    ? ' — กรอกยอดนี้ในช่อง “หัก ณ ที่จ่าย” ด้วย เพื่อหักจากยอดจ่ายผู้ขาย'
                    : form.foreignWhtBorneBy === 'GROSSED_UP'
                      ? ' (gross-up — เป็นค่าใช้จ่ายเพิ่มของกิจการ)'
                      : form.foreignWhtBorneBy === 'RECOVERABLE'
                        ? ' (จ่ายเต็มก่อน ตั้งเป็นลูกหนี้รอเรียกคืน)'
                        : ''}
                  {' — นักบัญชีต้องยืนยันประเภท/อัตราตามอนุสัญญา'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CapitalizationFields({
  form,
  setForm,
}: {
  form: ExpenseForm;
  setForm: Dispatch<SetStateAction<ExpenseForm>>;
}) {
  return (
    <div className="md:col-span-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">
            ชื่อผู้ซื้อบนใบ (กรอกเมื่อไม่ใช่ชื่อกิจการ)
          </span>
          <input
            value={form.billedToName}
            onChange={(e) => setForm((v) => ({ ...v, billedToName: e.target.value }))}
            placeholder="เช่น ชื่อบุคคลบนใบแจ้งหนี้ Cursor"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        {form.billedToName.trim() && (
          <div className="md:col-span-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-warn">
            ถ้าชื่อบนใบไม่ใช่ชื่อกิจการ ให้แนบใบสำคัญจ่ายคืน + เหตุผลใช้ในกิจการ และแก้ billing name รอบหน้า
          </div>
        )}
        <label className="flex items-center gap-2 text-[12.5px] text-text-soft md:col-span-2">
          <input
            type="checkbox"
            checked={form.treatAsIntangible}
            onChange={(e) => setForm((v) => ({ ...v, treatAsIntangible: e.target.checked }))}
          />
          ลงเป็นสินทรัพย์ไม่มีตัวตน (ตัดจำหน่ายแทนลงค่าใช้จ่ายทันที)
        </label>
        {form.treatAsIntangible && (
          <Field
            label="อายุการใช้งาน (เดือน)"
            value={form.intangibleUsefulLifeMonths}
            onChange={(intangibleUsefulLifeMonths) =>
              setForm((v) => ({ ...v, intangibleUsefulLifeMonths }))
            }
            placeholder="36"
          />
        )}
        <Field
          type="date"
          label="ช่วงบริการ — เริ่ม (จ่ายล่วงหน้า)"
          value={form.serviceStart}
          onChange={(serviceStart) => setForm((v) => ({ ...v, serviceStart }))}
        />
        <Field
          type="date"
          label="ช่วงบริการ — สิ้นสุด"
          value={form.serviceEnd}
          onChange={(serviceEnd) => setForm((v) => ({ ...v, serviceEnd }))}
        />
        {form.serviceStart && form.serviceEnd && !form.treatAsIntangible && (
          <div className="md:col-span-2 text-[11.5px] text-text-mute">
            ช่วงบริการคร่อมเดือน — บันทึกไว้ให้นักบัญชีทยอยรับรู้ค่าใช้จ่าย (prepaid); ระบบยังลงค่าใช้จ่ายเต็มในงวดที่จ่าย
          </div>
        )}
      </div>
    </div>
  );
}

function periodLabel(year: number, month: number): string {
  return `${THAI_MONTHS_SHORT[month - 1] ?? month} ${year + 543}`;
}

const WHT_BORNE_LABEL: Record<string, string> = {
  WITHHELD: 'หักจากผู้ขาย',
  RECOVERABLE: 'เรียกคืน',
  GROSSED_UP: 'gross-up',
};

function Pp36Modal({
  open,
  onClose,
  canFile,
}: {
  open: boolean;
  onClose: () => void;
  canFile: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState<ForeignTaxObligation[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'FILED' | ''>('PENDING');
  const [kindFilter, setKindFilter] = useState<'' | 'PP36_VAT' | 'PND54_WHT'>('');
  const [filing, setFiling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kindFilter) params.set('kind', kindFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('take', '100');
      const res = await api<{ items: ForeignTaxObligation[]; total: number }>(
        `/expense-receipts/pp36?${params.toString()}`,
      );
      setItems(res.items);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, statusFilter, kindFilter]);

  async function file(id: string) {
    setFiling(id);
    try {
      await api(`/expense-receipts/pp36/${id}/file`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast.success('บันทึกการนำส่งภาษีแล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFiling(null);
    }
  }

  const pendingTax = items
    .filter((i) => i.status === 'PENDING')
    .reduce((sum, i) => sum + Number(i.taxAmount || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ภาษีนำส่ง — ภ.พ.36 (VAT) / ภ.ง.ด.54 (WHT)"
      size="xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2 text-[13px]"
        >
          ปิด
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as '' | 'PP36_VAT' | 'PND54_WHT')}
              className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
            >
              <option value="">ทุกประเภท</option>
              <option value="PP36_VAT">ภ.พ.36 (VAT)</option>
              <option value="PND54_WHT">ภ.ง.ด.54 (WHT)</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'PENDING' | 'FILED' | '')}
              className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
            >
              <option value="PENDING">รอนำส่ง</option>
              <option value="FILED">นำส่งแล้ว</option>
              <option value="">ทั้งหมด</option>
            </select>
          </div>
          {statusFilter !== 'FILED' && (
            <div className="text-[12.5px] text-text-soft">
              รวมที่ต้องนำส่ง:{' '}
              <span className="font-mono font-semibold text-text">
                {formatThaiCurrency(pendingTax.toFixed(2))}
              </span>{' '}
              บาท
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">ผู้ขาย / เอกสาร</th>
                <th className="px-3 py-2 font-medium">งวดรายจ่าย</th>
                <th className="px-3 py-2 font-medium">งวดยื่น</th>
                <th className="px-3 py-2 text-right font-medium">ฐาน (บาท)</th>
                <th className="px-3 py-2 text-right font-medium">ภาษี</th>
                <th className="px-3 py-2 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8">
                    <Empty
                      title="ไม่มีรายการ ภ.พ.36"
                      description="ลงรายจ่ายต่างประเทศ (บริการ ใช้ในไทย) ที่ติ๊ก ภ.พ.36 เพื่อให้ระบบตั้งยอดให้"
                    />
                  </td>
                </tr>
              ) : (
                items.map((o) => (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${
                          o.kind === 'PP36_VAT'
                            ? 'border-info/40 bg-info/10 text-info'
                            : 'border-warn/40 bg-warn/10 text-warn'
                        }`}
                      >
                        {o.kind === 'PP36_VAT' ? 'ภ.พ.36' : 'ภ.ง.ด.54'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{o.expenseRecord?.vendor?.nameTh ?? '—'}</div>
                      <div className="text-[11px] text-text-mute">
                        {o.expenseRecord?.documentNumber ?? o.expenseRecord?.category ?? ''}
                        {o.kind === 'PND54_WHT' && o.expenseRecord?.foreignWhtBorneBy
                          ? ` · ${WHT_BORNE_LABEL[o.expenseRecord.foreignWhtBorneBy]}`
                          : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-text-soft">
                      {periodLabel(o.expensePeriodYear, o.expensePeriodMonth)}
                    </td>
                    <td className="px-3 py-2 text-text-soft">
                      {periodLabel(o.filePeriodYear, o.filePeriodMonth)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatThaiCurrency(o.baseAmount)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatThaiCurrency(o.taxAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      {o.status === 'PENDING' ? (
                        canFile ? (
                          <button
                            onClick={() => file(o.id)}
                            disabled={filing === o.id}
                            className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {filing === o.id ? 'กำลังบันทึก…' : 'นำส่งแล้ว'}
                          </button>
                        ) : (
                          <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
                            รอนำส่ง
                          </span>
                        )
                      ) : (
                        <span className="rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] text-ok">
                          นำส่งแล้ว
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[11.5px] text-text-mute">
          ภ.พ.36 / ภ.ง.ด.54 ยื่นภายในวันที่ 7 ของเดือนถัดไป — VAT จาก ภ.พ.36 ตั้งเป็นภาษีซื้อใน ภ.พ.30
          และ ภ.ง.ด.54 บันทึกเป็น WHT (หนังสือรับรอง 50 ทวิ + รายงานออกได้ที่หน้า ภาษี VAT/WHT)
        </p>
      </div>
    </Modal>
  );
}
