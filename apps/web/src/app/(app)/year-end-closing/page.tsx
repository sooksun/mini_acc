'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppTopbar } from '@/components/AppTopbar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { YEARS, CURRENT_CE_YEAR, thb } from '@/lib/report-filters';

interface ClosingLine {
  accountCode: string;
  accountName: string;
  type: 'REVENUE' | 'EXPENSE';
  amount: number;
}

interface ClosingStatus {
  year: number;
  beYear: number;
  closed: boolean;
  closingEntryId: string | null;
  closedAt: string | null;
  revenue: number;
  expense: number;
  netProfit: number;
  retainedEarningsAccount: { code: string; name: string };
  lockedMonthCount: number;
  lines: ClosingLine[];
}

export default function YearEndClosingPage() {
  const toast = useToast();
  const [year, setYear] = useState(CURRENT_CE_YEAR - 1); // close last year by default
  const [data, setData] = useState<ClosingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const role = getUser()?.role;
  const canClose = role === 'OWNER' || role === 'ACCOUNTANT';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<ClosingStatus>(`/year-end-closing/${year}/status`));
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดสถานะปิดบัญชีล้มเหลว');
      setData(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  async function doClose() {
    try {
      await api(`/year-end-closing/${year}/close`, { method: 'POST' });
      toast.success(`ปิดบัญชีปี ${year + 543} แล้ว`);
      setConfirmClose(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'ปิดบัญชีไม่สำเร็จ');
    }
  }

  async function doReopen(reason?: string) {
    try {
      await api(`/year-end-closing/${year}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason ?? '' }),
      });
      toast.success(`เปิดงวดปี ${year + 543} ใหม่แล้ว`);
      setConfirmReopen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'เปิดงวดใหม่ไม่สำเร็จ');
    }
  }

  const revenueLines = data?.lines.filter((l) => l.type === 'REVENUE') ?? [];
  const expenseLines = data?.lines.filter((l) => l.type === 'EXPENSE') ?? [];
  const profit = data?.netProfit ?? 0;

  return (
    <div className="flex flex-col">
      <AppTopbar title={`ปิดบัญชีสิ้นปี${data ? ` — ปี ${data.beYear}` : ''}`} />

      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-text-soft">ปีบัญชี</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {y + 543}
                </option>
              ))}
            </select>
          </div>
          {loading && <span className="text-[12px] text-text-mute">กำลังโหลด...</span>}

          {data?.closed ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok/10 px-3 py-1 text-[12px] font-medium text-ok">
              ✓ ปิดบัญชีแล้ว
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-[12px] font-medium text-warn">
              ยังไม่ปิดบัญชี
            </span>
          )}
        </div>

        {/* Advisory: monthly periods not all locked */}
        {data && !data.closed && data.lockedMonthCount < 12 && (
          <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-[12.5px] text-warn">
            ปิดงวดรายเดือนแล้ว {data.lockedMonthCount}/12 เดือน — แนะนำให้ปิดงวดรายเดือนให้ครบก่อนปิดบัญชีสิ้นปี
            (ระบบไม่บังคับ)
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label="รายได้รวม" value={thb(data?.revenue ?? 0)} className="text-indigo-500" />
          <SummaryCard label="ค่าใช้จ่ายรวม" value={thb(data?.expense ?? 0)} className="text-rose-500" />
          <SummaryCard
            label={profit >= 0 ? 'กำไรสุทธิ → กำไรสะสม' : 'ขาดทุนสุทธิ → กำไรสะสม'}
            value={thb(profit)}
            className={profit >= 0 ? 'text-ok' : 'text-bad'}
          />
        </div>

        {/* Closing entry preview */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 text-[13px] font-semibold text-text">
            รายการปิดบัญชี (ปิดบัญชีรายได้/ค่าใช้จ่าย → {data?.retainedEarningsAccount.code}{' '}
            {data?.retainedEarningsAccount.name})
          </div>
          {(!data || data.lines.length === 0) ? (
            <p className="text-[13px] text-text-mute">ไม่มียอดบัญชีรายได้/ค่าใช้จ่ายให้ปิดในปีนี้</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PreviewColumn title="รายได้ (เดบิตเพื่อปิด)" lines={revenueLines} />
              <PreviewColumn title="ค่าใช้จ่าย (เครดิตเพื่อปิด)" lines={expenseLines} />
            </div>
          )}
        </div>

        {/* Actions */}
        {canClose && (
          <div className="flex gap-3">
            {!data?.closed ? (
              <button
                disabled={!data || data.lines.length === 0}
                onClick={() => setConfirmClose(true)}
                className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
              >
                ปิดบัญชีสิ้นปี {data?.beYear}
              </button>
            ) : (
              <button
                onClick={() => setConfirmReopen(true)}
                className="rounded-md border border-bad/40 bg-bad/5 px-4 py-2 text-[13px] font-medium text-bad hover:bg-bad/10"
              >
                เปิดงวดปิดบัญชีใหม่
              </button>
            )}
          </div>
        )}

        <p className="text-[11.5px] text-text-faint">
          * การปิดบัญชีจะสร้างรายการสมุดรายวันลงวันที่ 31 ธันวาคม โอนยอดรายได้/ค่าใช้จ่ายของปีไปยังบัญชีกำไรสะสม
          — งบกำไรขาดทุนยังแสดงตัวเลขจริง (ไม่รวมรายการปิดบัญชี) ส่วนงบทดลอง/งบดุลจะแสดงสภาพหลังปิดบัญชี
        </p>
      </div>

      <ConfirmDialog
        open={confirmClose}
        title={`ปิดบัญชีปี ${data?.beYear ?? ''}`}
        description={`โอนกำไรสุทธิ ${thb(profit)} บาท ไปยังบัญชีกำไรสะสม และปิดยอดรายได้/ค่าใช้จ่ายของปี — ดำเนินการต่อหรือไม่?`}
        confirmLabel="ปิดบัญชี"
        onConfirm={doClose}
        onClose={() => setConfirmClose(false)}
      />
      <ConfirmDialog
        open={confirmReopen}
        title={`เปิดงวดปี ${data?.beYear ?? ''} ใหม่`}
        description="ระบบจะยกเลิก (void) รายการปิดบัญชี ทำให้ยอดรายได้/ค่าใช้จ่ายกลับมา — ระบุเหตุผล"
        confirmLabel="เปิดงวดใหม่"
        destructive
        requireReason
        onConfirm={doReopen}
        onClose={() => setConfirmReopen(false)}
      />
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-[12px] text-text-mute">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

function PreviewColumn({ title, lines }: { title: string; lines: ClosingLine[] }) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/40">
      <div className="border-b border-border/60 px-3 py-2 text-[12px] font-medium text-text-soft">{title}</div>
      {lines.length === 0 ? (
        <div className="px-3 py-2 text-[12.5px] text-text-mute">—</div>
      ) : (
        lines.map((l) => (
          <div key={l.accountCode} className="flex items-center justify-between px-3 py-1.5 text-[12.5px]">
            <span className="text-text-soft">
              <span className="mr-2 font-mono text-text-mute">{l.accountCode}</span>
              {l.accountName}
            </span>
            <span className="tabular-nums text-text">{thb(l.amount)}</span>
          </div>
        ))
      )}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-[12.5px] font-semibold text-text">
        <span>รวม</span>
        <span className="tabular-nums">{thb(total)}</span>
      </div>
    </div>
  );
}
