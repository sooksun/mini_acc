'use client';

import { useEffect, useState } from 'react';
import type { AccountingPeriodStatus } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { api, apiBlob } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { formatThaiDateTime } from '@/lib/format';

interface PeriodRow {
  id: string;
  year: number;
  month: number;
  status: AccountingPeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
  lockedAt: string | null;
  note: string | null;
}

interface ExportBatchRow {
  id: string;
  year: number;
  month: number;
  fileName: string;
  sizeBytes: number;
  fileCount: number;
  generatedBy: string | null;
  createdAt: string;
}

const STATUS_META: Record<AccountingPeriodStatus, { label: string; cls: string }> = {
  OPEN: { label: 'เปิด', cls: 'border-info/40 bg-info/10 text-info' },
  CLOSING: { label: 'กำลังปิด', cls: 'border-warn/40 bg-warn/10 text-warn' },
  LOCKED: { label: 'ปิดและล็อก', cls: 'border-ok/40 bg-ok/10 text-ok' },
  REOPENED: { label: 'เปิดอีกครั้ง', cls: 'border-warn/40 bg-warn/10 text-warn' },
};

const PACK_CONTENTS = [
  { num: '01', label: 'สมุดรายวันขาย', file: 'sales_register.xlsx' },
  { num: '02', label: 'ทะเบียนใบส่งของ', file: 'delivery_register.xlsx' },
  { num: '03', label: 'สมุดรายจ่าย', file: 'purchase_register.xlsx' },
  { num: '04', label: 'สมุดรับ-จ่ายเงิน', file: 'payment_register.xlsx' },
  { num: '05', label: 'Bank reconciliation', file: 'bank_reconciliation.xlsx' },
  { num: '06', label: 'รายงาน VAT', file: 'vat_report.xlsx' },
  { num: '07', label: 'รายงาน WHT (ภงด.3/53)', file: 'wht_report.xlsx' },
  { num: '08', label: 'Journal entries (Dr=Cr)', file: 'journal_entries.xlsx' },
  { num: '09', label: 'รายงานสต็อก', file: 'inventory_report.xlsx' },
  { num: '10', label: 'ทะเบียนทรัพย์สินถาวร', file: 'fixed_asset_register.xlsx' },
  { num: '11', label: 'กำไรต่อโครงการ', file: 'project_profit_report.xlsx' },
  { num: '12', label: 'สรุปความเสี่ยง', file: 'risk_summary.pdf' },
  { num: '13', label: 'ดัชนีไฟล์แนบ', file: 'attachment_index.xlsx' },
];

export default function AccountantPackPage() {
  const toast = useToast();
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [batches, setBatches] = useState<ExportBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const role = getUser()?.role;
  const canExport = role === 'OWNER' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const data = await api<PeriodRow[]>('/closing/periods');
      setPeriods(data);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดประวัติงวดล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  async function loadBatches() {
    try {
      setBatches(await api<ExportBatchRow[]>('/accountant-pack/batches'));
    } catch {
      // history is non-critical — ignore load errors
    }
  }

  useEffect(() => {
    load();
    loadBatches();
  }, []);

  async function redownload(batch: ExportBatchRow) {
    setDownloadingId(batch.id);
    try {
      const blob = await apiBlob(`/accountant-pack/${batch.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = batch.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast.error(e.message ?? 'ดาวน์โหลดซ้ำล้มเหลว');
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadPack(period: PeriodRow) {
    if (!canExport) return;
    const key = `${period.year}-${period.month}`;
    setExporting(key);
    try {
      // The export endpoint streams a ZIP. We can't use apiBlob (which does
      // POST without body) cleanly here — manual fetch with token + JSON body.
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${baseUrl}/api/accountant-pack/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ year: period.year, month: period.month }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const filenameFromHeader = res.headers
        .get('Content-Disposition')
        ?.match(/filename="([^"]+)"/)?.[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFromHeader ?? `accountant-pack-${key}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Export ${period.year + 543}/${String(period.month).padStart(2, '0')} เรียบร้อย`);
      loadBatches();
    } catch (e: any) {
      toast.error(e.message ?? 'Export ล้มเหลว');
    } finally {
      setExporting(null);
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  const lockedPeriods = periods.filter((p) => p.status === 'LOCKED');

  const columns: DataTableColumn<PeriodRow>[] = [
    {
      key: 'period',
      header: 'งวด',
      render: (p) => (
        <span className="font-medium">
          {p.year + 543}/{String(p.month).padStart(2, '0')}
          <span className="ml-2 font-mono text-[11px] text-text-mute">
            ({p.year}-{String(p.month).padStart(2, '0')})
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (p) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${STATUS_META[p.status].cls}`}
        >
          {STATUS_META[p.status].label}
        </span>
      ),
    },
    {
      key: 'closedAt',
      header: 'ปิดเมื่อ',
      render: (p) => (
        <span className="text-text-soft">
          {p.closedAt ? formatThaiDateTime(p.closedAt) : '—'}
        </span>
      ),
    },
    { key: 'note', header: 'หมายเหตุ', render: (p) => p.note ?? '—' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => {
        if (!canExport) return null;
        if (p.status !== 'LOCKED') {
          return (
            <span className="text-[11.5px] text-text-mute">ต้องปิดงวดก่อน</span>
          );
        }
        const key = `${p.year}-${p.month}`;
        const busy = exporting === key;
        return (
          <button
            onClick={() => downloadPack(p)}
            disabled={busy}
            className="rounded-md bg-brand-gradient px-3 py-1 text-[12px] font-medium text-white shadow-sm disabled:opacity-60"
          >
            {busy ? 'กำลัง Export…' : 'ดาวน์โหลด ZIP'}
          </button>
        );
      },
    },
  ];

  return (
    <>
      <AppTopbar title="แพ็กสำหรับนักบัญชี" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">แพ็กสำหรับนักบัญชี</h1>
          <p className="mt-1 text-[13px] text-text-mute">
            ZIP สำหรับสำนักงานบัญชี — สร้างได้เฉพาะงวดที่ปิดและล็อกแล้ว
            ทุกตัวเลขย้อนกลับไปหา journal + เอกสารต้นทางได้
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[1fr,320px]">
          <div>
            <h2 className="mb-3 text-[15px] font-semibold tracking-tight">
              งวดที่พร้อม Export ({lockedPeriods.length})
            </h2>
            <DataTable
              columns={columns}
              rows={periods}
              rowKey={(p) => p.id}
              loading={loading}
              emptyTitle="ยังไม่มีงวดที่ปิด"
              emptyDescription='ปิดงวดที่หน้า "ปิดงวดบัญชี" ก่อน'
            />
          </div>

          <aside className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="text-[14px] font-semibold tracking-tight">เนื้อหาใน ZIP</div>
            <div className="mt-1 text-[11.5px] text-text-mute">
              13 ไฟล์ตาม PRD §18 + README.txt
            </div>
            <ul className="mt-3 space-y-1.5 text-[12px]">
              {PACK_CONTENTS.map((c) => (
                <li key={c.num} className="flex items-baseline gap-2">
                  <span className="font-mono text-[10.5px] text-text-mute w-5 text-right">{c.num}</span>
                  <span className="flex-1 text-text">{c.label}</span>
                  <span className="font-mono text-[10px] text-text-faint">{c.file}</span>
                </li>
              ))}
            </ul>
            {!canExport && (
              <div className="mt-4 rounded-md border border-warn/30 bg-warn/5 p-2 text-[12px] text-warn">
                เฉพาะ OWNER / ACCOUNTANT เท่านั้นที่ export ได้
              </div>
            )}
          </aside>
        </div>

        {batches.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-[15px] font-semibold tracking-tight">
              ประวัติการ Export ({batches.length})
            </h2>
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-text-soft">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">งวด</th>
                    <th className="px-4 py-2.5 font-medium">ไฟล์</th>
                    <th className="px-4 py-2.5 text-right font-medium">ขนาด</th>
                    <th className="px-4 py-2.5 font-medium">สร้างเมื่อ</th>
                    <th className="px-4 py-2.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-4 py-2.5 font-medium">
                        {b.year + 543}/{String(b.month).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-text-soft">{b.fileName}</td>
                      <td className="px-4 py-2.5 text-right text-text-soft">{formatBytes(b.sizeBytes)}</td>
                      <td className="px-4 py-2.5 text-text-soft">{formatThaiDateTime(b.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {canExport && (
                          <button
                            onClick={() => redownload(b)}
                            disabled={downloadingId === b.id}
                            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3 disabled:opacity-60"
                          >
                            {downloadingId === b.id ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดซ้ำ'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
