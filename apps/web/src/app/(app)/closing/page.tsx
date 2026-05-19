'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { AccountingPeriodStatus } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiDateTime } from '@/lib/format';

interface CheckResult {
  period: { year: number; month: number };
  status: AccountingPeriodStatus;
  canClose: boolean;
  blockers: { code: string; message: string; count?: number }[];
  summary: {
    salesCount: number;
    salesTotal: string;
    expenseCount: number;
    expenseTotal: string;
    journalEntries: number;
    criticalRisks: number;
  };
  closedAt: string | null;
  closedBy: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
}

interface PeriodRow {
  id: string;
  year: number;
  month: number;
  status: AccountingPeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  note: string | null;
}

const STATUS_META: Record<AccountingPeriodStatus, { label: string; cls: string }> = {
  OPEN: { label: 'เปิด', cls: 'border-info/40 bg-info/10 text-info' },
  CLOSING: { label: 'กำลังปิด', cls: 'border-warn/40 bg-warn/10 text-warn' },
  LOCKED: { label: 'ปิดและล็อกแล้ว', cls: 'border-ok/40 bg-ok/10 text-ok' },
  REOPENED: { label: 'เปิดอีกครั้ง', cls: 'border-warn/40 bg-warn/10 text-warn' },
};

function nowYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function ClosingPage() {
  const toast = useToast();
  const init = nowYearMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [reopen, setReopen] = useState<PeriodRow | null>(null);

  const role = getUser()?.role;
  const canClose = role === 'OWNER' || role === 'ACCOUNTANT';
  const canReopen = role === 'OWNER';

  async function load() {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        api<CheckResult>(`/closing/${year}/${month}/check`),
        api<PeriodRow[]>('/closing/periods'),
      ]);
      setCheck(c);
      setPeriods(p);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูลปิดงวดล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function doClose() {
    if (!check || !check.canClose) return;
    setClosing(true);
    try {
      await api('/closing/close', {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      });
      toast.success(`ปิดงวด ${year}-${String(month).padStart(2, '0')} เรียบร้อย`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'ปิดงวดล้มเหลว');
    } finally {
      setClosing(false);
    }
  }

  const periodColumns: DataTableColumn<PeriodRow>[] = [
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
      render: (p) =>
        canReopen && (p.status === 'LOCKED' || p.status === 'CLOSING') ? (
          <button
            onClick={() => setReopen(p)}
            className="rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1 text-[12px] text-warn hover:bg-warn/10"
          >
            เปิดอีกครั้ง
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <AppTopbar title="ปิดงวดบัญชี" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ปิดงวดบัญชี</h1>
          <p className="mt-1 text-[13px] text-text-mute">
            ปิดงวดรายเดือนเมื่อเอกสารครบ + ไม่มีความเสี่ยงระดับ CRITICAL ค้าง
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
            ปี (ค.ศ.)
            <input
              type="number"
              min={2000}
              max={2200}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-brand"
            />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
            เดือน
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-brand"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[12px] text-text-mute">(พ.ศ. {year + 543})</div>
        </div>

        {check && (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <StatCard
                label="ยอดขายในงวด"
                value={Number(check.summary.salesTotal).toLocaleString('th-TH', {
                  minimumFractionDigits: 2,
                })}
                hint={`${check.summary.salesCount} ฉบับ`}
              />
              <StatCard
                label="รายจ่ายในงวด"
                value={Number(check.summary.expenseTotal).toLocaleString('th-TH', {
                  minimumFractionDigits: 2,
                })}
                hint={`${check.summary.expenseCount} รายการ`}
                tone="warn"
              />
              <StatCard
                label="Journal entries"
                value={String(check.summary.journalEntries)}
                tone="info"
              />
              <StatCard
                label="CRITICAL ค้าง"
                value={String(check.summary.criticalRisks)}
                tone={check.summary.criticalRisks > 0 ? 'bad' : 'ok'}
              />
            </div>

            <div className="mt-5 rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] text-text-mute">สถานะปัจจุบัน</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-[13px] font-medium ${STATUS_META[check.status].cls}`}
                    >
                      {STATUS_META[check.status].label}
                    </span>
                    {check.canClose ? (
                      <span className="text-[12px] text-ok">พร้อมปิดงวด</span>
                    ) : (
                      <span className="text-[12px] text-bad">
                        ปิดงวดไม่ได้ — มี {check.blockers.length} รายการต้องแก้
                      </span>
                    )}
                  </div>
                </div>
                {canClose && check.status !== 'LOCKED' && (
                  <button
                    onClick={doClose}
                    disabled={!check.canClose || closing}
                    title={
                      check.canClose
                        ? 'ปิดงวด — จะ lock ข้อมูลในงวดนี้ทั้งหมด'
                        : 'แก้รายการที่ค้างก่อน'
                    }
                    className="rounded-md bg-brand-gradient px-5 py-2 text-[13.5px] font-medium text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {closing ? 'กำลังปิด…' : 'ปิดงวด'}
                  </button>
                )}
              </div>

              {check.blockers.length > 0 && (
                <div className="mt-4 rounded-md border border-bad/30 bg-bad/5 p-3">
                  <div className="text-[12.5px] font-medium text-bad">รายการที่ต้องแก้ก่อนปิดงวด</div>
                  <ul className="mt-2 space-y-1.5">
                    {check.blockers.map((b) => (
                      <li key={b.code} className="text-[13px] text-text">
                        <span className="font-mono text-[11px] text-text-mute">{b.code}</span>
                        <span className="ml-2">{b.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {check.status === 'LOCKED' && check.closedAt && (
                <div className="mt-4 rounded-md border border-ok/30 bg-ok/5 p-3 text-[12.5px] text-text-soft">
                  ปิดงวดเมื่อ {formatThaiDateTime(check.closedAt)}
                  {check.closedBy && ` โดย ${check.closedBy}`}
                </div>
              )}
            </div>
          </>
        )}

        <div className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">ประวัติการปิดงวด</h2>
          <DataTable
            columns={periodColumns}
            rows={periods}
            rowKey={(p) => p.id}
            loading={loading}
            emptyTitle="ยังไม่เคยปิดงวด"
          />
        </div>
      </div>

      <ReopenModal
        period={reopen}
        onClose={() => setReopen(null)}
        onSaved={() => {
          setReopen(null);
          load();
        }}
      />
    </>
  );
}

function ReopenModal({
  period,
  onClose,
  onSaved,
}: {
  period: PeriodRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (period) setReason('');
  }, [period]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!period || !reason.trim()) return;
    setSaving(true);
    try {
      await api('/closing/reopen', {
        method: 'POST',
        body: JSON.stringify({
          year: period.year,
          month: period.month,
          reason: reason.trim(),
        }),
      });
      toast.success('เปิดงวดอีกครั้งแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'เปิดงวดล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!period}
      onClose={onClose}
      title="เปิดงวดที่ปิดแล้ว"
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
            form="reopen-form"
            disabled={saving || !reason.trim()}
            className="rounded-md bg-warn px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังเปิด…' : 'ยืนยันเปิดงวด'}
          </button>
        </>
      }
    >
      {period && (
        <form id="reopen-form" onSubmit={submit} className="space-y-3">
          <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-[12.5px] text-text-soft">
            <div>
              งวด <span className="font-medium text-text">{period.year + 543}/{String(period.month).padStart(2, '0')}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-text-mute">
              การเปิดงวดที่ปิดไปแล้วจะทำให้ตัวเลขเปลี่ยนได้ — ใช้เฉพาะกรณีจำเป็น
            </div>
          </div>
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">เหตุผล *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="min-h-20 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            />
          </label>
        </form>
      )}
    </Modal>
  );
}
