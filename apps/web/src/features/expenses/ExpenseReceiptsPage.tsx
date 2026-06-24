'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ExpenseReceiptStatus } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Empty } from '@/components/ui/Empty';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api, apiBlob } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort, formatThaiDateTime } from '@/lib/format';
import { EditReceiptModal } from './EditReceiptModal';
import { ExpenseReceiptRowActions } from './ExpenseReceiptRowActions';
import { ExpenseStatusBadge, ExpenseSummaryCard } from './ExpenseReceiptSummary';
import { EXPENSE_RECEIPT_STATUS, type ExpenseReceipt } from './expense-receipts.types';
import { LinkVendorModal } from './LinkVendorModal';
import { Pp36Modal } from './Pp36Modal';
import { PrepaidModal } from './PrepaidModal';
import { UploadReceiptModal } from './UploadReceiptModal';

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
  const [prepaidOpen, setPrepaidOpen] = useState(false);

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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'อนุมัติไม่สำเร็จ');
    }
  }

  async function accountReceipt(receipt: ExpenseReceipt) {
    try {
      await api(`/expense-receipts/${receipt.id}/account`, { method: 'POST' });
      toast.success('บันทึกรายจ่ายแล้ว');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'บันทึกรายจ่ายไม่สำเร็จ');
    }
  }

  async function viewFile(receipt: ExpenseReceipt) {
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
    } catch (e: unknown) {
      popup?.close();
      toast.error(e instanceof Error ? e.message : 'เปิดไฟล์ไม่สำเร็จ');
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
            <button
              onClick={() => setPrepaidOpen(true)}
              className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-soft hover:bg-surface-3"
            >
              ตัด prepaid
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
          <ExpenseSummaryCard label="ทั้งหมดในมุมมองนี้" value={total.toString()} />
          <ExpenseSummaryCard label="รออนุมัติผู้ขาย" value={pendingCount.toString()} tone="warn" />
          <ExpenseSummaryCard
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
            {Object.entries(EXPENSE_RECEIPT_STATUS).map(([key, meta]) => (
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
                    <td className="px-4 py-3"><ExpenseStatusBadge status={item.status} /></td>
                    <td className="px-4 py-3">
                      <ExpenseReceiptRowActions
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
      <PrepaidModal open={prepaidOpen} onClose={() => setPrepaidOpen(false)} canRun={canAccount} />
    </>
  );
}