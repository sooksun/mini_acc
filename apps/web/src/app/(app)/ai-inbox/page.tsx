'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { AiSuggestionStatus, AiSuggestionType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { AiConfidenceBadge } from '@/components/ui/AiConfidenceBadge';
import { AiExtractedField } from '@/components/ui/AiExtractedField';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api, apiBlob } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateTime } from '@/lib/format';

interface ExtractedPayload {
  vendorName?: string;
  vendorTaxId?: string;
  documentNumber?: string;
  documentDate?: string;
  paidAt?: string;
  category?: string;
  subtotal?: string;
  vatAmount?: string;
  withholdingTaxAmount?: string;
  grandTotal?: string;
  storedPath?: string;
  originalFileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface SuggestionRow {
  id: string;
  type: AiSuggestionType;
  status: AiSuggestionStatus;
  sourceType: string | null;
  sourceId: string | null;
  confidence: number | null;
  payload: ExtractedPayload;
  model: string | null;
  createdAt: string;
  acceptedAt: string | null;
  rejectionReason: string | null;
}

const STATUS_META: Record<AiSuggestionStatus, { label: string; cls: string }> = {
  PENDING: { label: 'รอตรวจ', cls: 'border-warn/40 bg-warn/10 text-warn' },
  ACCEPTED: { label: 'รับ', cls: 'border-ok/40 bg-ok/10 text-ok' },
  REJECTED: { label: 'ปฏิเสธ', cls: 'border-bad/40 bg-bad/10 text-bad' },
  OVERRIDDEN: { label: 'แก้ไข', cls: 'border-info/40 bg-info/10 text-info' },
};

export default function AiInboxPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AiSuggestionStatus | ''>('PENDING');
  const [reviewing, setReviewing] = useState<SuggestionRow | null>(null);
  const [uploading, setUploading] = useState(false);

  const role = getUser()?.role;
  const canAct = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('take', '200');
      const result = await api<{ items: SuggestionRow[]; total: number }>(
        `/ai-inbox?${params.toString()}`,
      );
      setRows(result.items);
      setTotal(result.total);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลด AI Inbox ล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      await api('/ai-inbox/upload', { method: 'POST', body });
      toast.success('AI กำลังประมวลผลเอกสาร — ดูใน inbox ด้านล่าง');
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'อัปโหลดล้มเหลว');
    } finally {
      setUploading(false);
    }
  }

  const pendingCount = rows.filter((r) => r.status === 'PENDING').length;
  const acceptedCount = rows.filter((r) => r.status === 'ACCEPTED').length;
  const lowConfidence = rows.filter(
    (r) => r.status === 'PENDING' && r.confidence !== null && r.confidence < 0.6,
  ).length;

  const columns: DataTableColumn<SuggestionRow>[] = [
    {
      key: 'createdAt',
      header: 'อัปโหลด',
      render: (s) => formatThaiDateTime(s.createdAt),
    },
    {
      key: 'file',
      header: 'ไฟล์',
      render: (s) => (
        <div>
          <div className="font-medium text-text">{s.payload.originalFileName ?? '—'}</div>
          <div className="font-mono text-[11px] text-text-mute">{s.model ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'extracted',
      header: 'AI อ่านได้',
      render: (s) => (
        <div className="text-[12px]">
          <div>{s.payload.vendorName ?? <span className="text-text-mute">— ไม่พบผู้ขาย —</span>}</div>
          {s.payload.grandTotal && (
            <div className="font-mono text-text-soft">{formatThaiCurrency(s.payload.grandTotal)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'confidence',
      header: 'ความมั่นใจ',
      render: (s) =>
        s.confidence !== null ? <AiConfidenceBadge score={s.confidence} showLabel /> : '—',
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (s) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${STATUS_META[s.status].cls}`}
        >
          {STATUS_META[s.status].label}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) =>
        canAct && s.status === 'PENDING' ? (
          <button
            onClick={() => setReviewing(s)}
            className="rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 text-[12px] text-brand hover:bg-brand/10"
          >
            ตรวจสอบ
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <AppTopbar title="AI Inbox" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Document Inbox</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              อัปโหลดใบเสร็จ — AI อ่านข้อมูลตั้งต้น ผู้ใช้ตรวจและยืนยันก่อนกลายเป็น expense receipt
              <br />
              <span className="text-[11px] text-text-faint">PRD §6.5 — AI ช่วยอ่าน, ผู้ใช้ยืนยัน, ระบบเก็บประวัติ</span>
            </p>
          </div>
          {canAct && (
            <label className="cursor-pointer rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md">
              {uploading ? 'กำลังอัปโหลด…' : '+ อัปโหลดเอกสาร'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatCard label="รอตรวจ" value={String(pendingCount)} tone={pendingCount > 0 ? 'warn' : 'default'} />
          <StatCard label="รับเข้าระบบแล้ว" value={String(acceptedCount)} tone="ok" />
          <StatCard
            label="ความมั่นใจต่ำ (<60%)"
            value={String(lowConfidence)}
            tone={lowConfidence > 0 ? 'bad' : 'ok'}
          />
        </div>

        <div className="mt-5">
          <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
            สถานะ
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AiSuggestionStatus | '')}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-brand"
            >
              <option value="">ทั้งหมด</option>
              {Object.entries(STATUS_META).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="ml-2 text-text-mute">({total} รายการ)</span>
          </label>
        </div>

        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={loading}
            emptyTitle="AI Inbox ว่าง"
            emptyDescription={canAct ? 'กดปุ่ม "อัปโหลดเอกสาร" เพื่อเริ่มต้น' : undefined}
          />
        </div>
      </div>

      <ReviewModal
        suggestion={reviewing}
        onClose={() => setReviewing(null)}
        onSaved={() => {
          setReviewing(null);
          load();
        }}
      />
    </>
  );
}

function ReviewModal({
  suggestion,
  onClose,
  onSaved,
}: {
  suggestion: SuggestionRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<ExtractedPayload>({});
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'review' | 'reject'>('review');

  useEffect(() => {
    if (suggestion) {
      setForm({
        vendorName: suggestion.payload.vendorName ?? '',
        vendorTaxId: suggestion.payload.vendorTaxId ?? '',
        documentNumber: suggestion.payload.documentNumber ?? '',
        documentDate: suggestion.payload.documentDate ?? '',
        paidAt: suggestion.payload.paidAt ?? '',
        category: suggestion.payload.category ?? '',
        subtotal: suggestion.payload.subtotal ?? '',
        vatAmount: suggestion.payload.vatAmount ?? '',
        withholdingTaxAmount: suggestion.payload.withholdingTaxAmount ?? '',
        grandTotal: suggestion.payload.grandTotal ?? '',
      });
      setRejectReason('');
      setMode('review');
    }
  }, [suggestion]);

  async function accept(e: FormEvent) {
    e.preventDefault();
    if (!suggestion) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === 'string' && v.trim()) body[k] = v.trim();
      }
      await api(`/ai-inbox/${suggestion.id}/accept`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success('รับและสร้างใบเสร็จรายจ่ายแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'รับล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    if (!suggestion) return;
    setSaving(true);
    try {
      await api(`/ai-inbox/${suggestion.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      toast.success('ปฏิเสธแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'ปฏิเสธล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  async function viewFile() {
    if (!suggestion) return;
    try {
      const blob = await apiBlob(`/ai-inbox/${suggestion.id}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error(e.message ?? 'เปิดไฟล์ไม่สำเร็จ');
    }
  }

  return (
    <Modal
      open={!!suggestion}
      onClose={onClose}
      title={suggestion ? `ตรวจสอบ — ${suggestion.payload.originalFileName ?? 'เอกสาร'}` : ''}
      size="xl"
      footer={
        mode === 'review' ? (
          <>
            <button
              type="button"
              onClick={() => setMode('reject')}
              className="rounded-md border border-bad/40 bg-bad/5 px-4 py-2 text-[13px] text-bad hover:bg-bad/10"
            >
              ปฏิเสธ
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-[13px]"
            >
              ปิด
            </button>
            <button
              type="submit"
              form="ai-accept-form"
              disabled={saving}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {saving ? 'กำลังบันทึก…' : 'รับและสร้างใบเสร็จ'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMode('review')}
              className="rounded-md border border-border px-4 py-2 text-[13px]"
            >
              กลับ
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={saving}
              className="rounded-md bg-bad px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {saving ? 'กำลังปฏิเสธ…' : 'ยืนยันปฏิเสธ'}
            </button>
          </>
        )
      }
    >
      {suggestion && mode === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-info/30 bg-info/5 p-3 text-[12.5px]">
            <div>
              <div className="font-medium text-text">{suggestion.payload.originalFileName}</div>
              <div className="mt-0.5 text-[11.5px] text-text-mute">
                AI model: <span className="font-mono">{suggestion.model}</span>
                {suggestion.confidence !== null && (
                  <span className="ml-2">
                    · <AiConfidenceBadge score={suggestion.confidence} showLabel />
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={viewFile}
              className="rounded-md border border-border bg-surface px-3 py-1 text-[12px] text-text-soft hover:bg-surface-3"
            >
              ดูไฟล์ต้นฉบับ
            </button>
          </div>

          <form id="ai-accept-form" onSubmit={accept} className="grid gap-3 md:grid-cols-2">
            <AiExtractedField
              label="ชื่อผู้ขาย"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.vendorName ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, vendorName: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13.5px] outline-none focus:border-brand"
                />
              }
              rawText={suggestion.payload.vendorName}
            />
            <AiExtractedField
              label="เลขผู้เสียภาษีผู้ขาย"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.vendorTaxId ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, vendorTaxId: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-[13.5px] outline-none focus:border-brand"
                />
              }
              rawText={suggestion.payload.vendorTaxId}
            />
            <AiExtractedField
              label="เลขที่เอกสาร"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.documentNumber ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, documentNumber: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13.5px] outline-none focus:border-brand"
                />
              }
            />
            <AiExtractedField
              label="วันที่เอกสาร"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  type="date"
                  value={form.documentDate ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, documentDate: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13.5px] outline-none focus:border-brand"
                />
              }
            />
            <AiExtractedField
              label="วันที่จ่าย"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  type="date"
                  value={form.paidAt ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, paidAt: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13.5px] outline-none focus:border-brand"
                />
              }
            />
            <AiExtractedField
              label="หมวดรายจ่าย"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.category ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13.5px] outline-none focus:border-brand"
                />
              }
            />
            <AiExtractedField
              label="ยอดก่อน VAT"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.subtotal ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, subtotal: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right font-mono text-[14px] outline-none focus:border-brand"
                />
              }
            />
            <AiExtractedField
              label="VAT"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.vatAmount ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, vatAmount: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right font-mono text-[14px] outline-none focus:border-brand"
                />
              }
            />
            <AiExtractedField
              label="หัก ณ ที่จ่าย"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.withholdingTaxAmount ?? ''}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, withholdingTaxAmount: e.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right font-mono text-[14px] outline-none focus:border-brand"
                />
              }
            />
            <AiExtractedField
              label="ยอดสุทธิ"
              confidence={suggestion.confidence ?? undefined}
              value={
                <input
                  value={form.grandTotal ?? ''}
                  onChange={(e) => setForm((v) => ({ ...v, grandTotal: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right font-mono text-[14px] outline-none focus:border-brand"
                />
              }
            />
          </form>
        </div>
      )}

      {suggestion && mode === 'reject' && (
        <div className="space-y-3">
          <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-[12.5px] text-text-soft">
            ปฏิเสธจะลบไฟล์ที่ AI อ่านออกจากระบบ — ดำเนินการต่อหรือไม่?
          </div>
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">เหตุผล (optional)</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="เช่น 'ไม่ใช่ใบเสร็จ' / 'อ่านไม่ออก'"
              className="min-h-20 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
