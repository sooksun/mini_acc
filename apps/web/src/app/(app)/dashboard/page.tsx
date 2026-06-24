'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppTopbar } from '@/components/AppTopbar';
import { StatCard } from '@/components/ui/StatCard';
import { api } from '@/lib/api';
import { thb } from '@/lib/report-filters';

// ---- Types -----------------------------------------------------------------

interface MonthlyPoint {
  month: number;
  monthLabel: string;
  revenue: number;
  expense: number;
  profit: number;
  marginPercent: number;
}

interface DashboardSummary {
  period: { year: number; month: number; beYear: number; monthLabel: string };
  thisMonth: { revenue: number; expense: number; profit: number };
  thisYear: { revenue: number; expense: number; profit: number };
  monthly: MonthlyPoint[];
  pending: {
    draftSalesDocs: number;
    pendingExpenses: number;
    aiInboxPending: number;
    openRisks: number;
    criticalRisks: number;
    unmatchedBank: number;
  };
}

// ---- Helpers ---------------------------------------------------------------

function profitTone(n: number): 'ok' | 'bad' | 'default' {
  if (n > 0) return 'ok';
  if (n < 0) return 'bad';
  return 'default';
}

// ---- Pending-work card -----------------------------------------------------

function PendingCard({
  href,
  label,
  count,
  note,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  note?: string;
  tone: 'clear' | 'warn' | 'bad';
}) {
  const valueCls = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ok';
  return (
    <Link
      href={href as never}
      className="group flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text">{label}</div>
        <div className="mt-0.5 text-[11.5px] text-text-mute">
          {count === 0 ? 'ไม่มีงานค้าง' : (note ?? 'รอดำเนินการ')}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${valueCls}`}>{count}</span>
        <svg
          className="h-4 w-4 text-text-mute transition-transform group-hover:translate-x-0.5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

// ---- Mini revenue/expense bar chart ----------------------------------------

function MiniBars({ data }: { data: MonthlyPoint[] }) {
  const max = Math.max(...data.map((d) => Math.max(d.revenue, d.expense)), 1);
  const H = 104;
  return (
    <div className="flex items-end gap-1.5">
      {data.map((d) => (
        <div
          key={d.month}
          className="flex flex-1 flex-col items-center gap-1"
          title={`${d.monthLabel}: รายรับ ${thb(d.revenue)} / รายจ่าย ${thb(d.expense)}`}
        >
          <div className="flex items-end gap-0.5" style={{ height: `${H}px` }}>
            <div
              className="w-2.5 rounded-t-sm bg-indigo-400/70"
              style={{ height: `${Math.round((d.revenue / max) * H)}px` }}
            />
            <div
              className="w-2.5 rounded-t-sm bg-rose-400/70"
              style={{ height: `${Math.round((d.expense / max) * H)}px` }}
            />
          </div>
          <span className="text-[9px] leading-none text-text-mute">{d.monthLabel.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Main page -------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardSummary>('/reports/dashboard')
      .then(setData)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const tm = data?.thisMonth;
  const ty = data?.thisYear;
  const p = data?.pending;
  const subtitle = data
    ? `ภาพรวมกิจการ · ${data.period.monthLabel} พ.ศ. ${data.period.beYear}`
    : 'ภาพรวมกิจการ';

  return (
    <div className="flex flex-col">
      <AppTopbar title="Dashboard" />

      <div className="flex flex-col gap-5 p-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">สวัสดีครับ</h1>
          <p className="mt-1 text-[13px] text-text-mute">{subtitle}</p>
        </div>

        {loading && <p className="text-[13px] text-text-mute">กำลังโหลดข้อมูล...</p>}
        {error && (
          <p className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-[13px] text-bad">
            โหลดข้อมูลไม่สำเร็จ: {error}
          </p>
        )}

        {data && (
          <>
            {/* This-month figures */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="รายรับเดือนนี้"
                value={thb(tm?.revenue ?? 0)}
                hint="ก่อน VAT"
              />
              <StatCard
                label="รายจ่ายเดือนนี้"
                value={thb(tm?.expense ?? 0)}
                hint="ก่อน VAT"
              />
              <StatCard
                label={!tm || tm.profit >= 0 ? 'กำไรเดือนนี้' : 'ขาดทุนเดือนนี้'}
                value={thb(tm?.profit ?? 0)}
                tone={profitTone(tm?.profit ?? 0)}
                hint="รายรับ – รายจ่าย"
              />
              <StatCard
                label={!ty || ty.profit >= 0 ? 'กำไรสะสมทั้งปี' : 'ขาดทุนสะสมทั้งปี'}
                value={thb(ty?.profit ?? 0)}
                tone={profitTone(ty?.profit ?? 0)}
                hint={`ทั้งปี พ.ศ. ${data.period.beYear}`}
              />
            </div>

            {/* Pending work */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold text-text">งานที่ค้างอยู่</h2>
                <span className="text-[11.5px] text-text-mute">คลิกเพื่อไปจัดการ</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <PendingCard
                  href="/sales/quotations"
                  label="เอกสารขายฉบับร่าง"
                  count={p?.draftSalesDocs ?? 0}
                  note="ยัง confirm หรือ void ไม่ครบ"
                  tone={(p?.draftSalesDocs ?? 0) > 0 ? 'warn' : 'clear'}
                />
                <PendingCard
                  href="/expenses/receipts"
                  label="ใบเสร็จรายจ่ายรอลงบัญชี"
                  count={p?.pendingExpenses ?? 0}
                  note="รอตรวจ/อนุมัติ/ลงบัญชี"
                  tone={(p?.pendingExpenses ?? 0) > 0 ? 'warn' : 'clear'}
                />
                <PendingCard
                  href="/ai-inbox"
                  label="AI Inbox รอตรวจ"
                  count={p?.aiInboxPending ?? 0}
                  note="ข้อมูลที่ AI อ่านไว้ รอยืนยัน"
                  tone={(p?.aiInboxPending ?? 0) > 0 ? 'warn' : 'clear'}
                />
                <PendingCard
                  href="/risks"
                  label="ความเสี่ยงที่เปิดอยู่"
                  count={p?.openRisks ?? 0}
                  note={
                    (p?.criticalRisks ?? 0) > 0
                      ? `มีระดับ CRITICAL ${p?.criticalRisks} รายการ`
                      : 'รอตรวจสอบ/จัดการ'
                  }
                  tone={
                    (p?.criticalRisks ?? 0) > 0 ? 'bad' : (p?.openRisks ?? 0) > 0 ? 'warn' : 'clear'
                  }
                />
                <PendingCard
                  href="/bank"
                  label="รายการธนาคารยังไม่จับคู่"
                  count={p?.unmatchedBank ?? 0}
                  note="รอกระทบยอดกับการรับ/จ่ายเงิน"
                  tone={(p?.unmatchedBank ?? 0) > 0 ? 'warn' : 'clear'}
                />
              </div>
            </section>

            {/* Monthly revenue vs expense */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-text">
                  รายรับ vs รายจ่าย รายเดือน (พ.ศ. {data.period.beYear})
                </span>
                <Link
                  href="/profit-loss"
                  className="text-[12px] font-medium text-indigo-500 hover:text-indigo-600"
                >
                  ดูสรุปกำไรขาดทุน →
                </Link>
              </div>
              <div className="mb-2 flex items-center gap-4 text-[11.5px]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-400/70" />
                  รายรับ
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400/70" />
                  รายจ่าย
                </span>
              </div>
              <MiniBars data={data.monthly} />
            </div>

            <p className="text-[11.5px] text-text-faint">
              * ตัวเลขรายรับ/รายจ่ายคำนวณจากสมุดรายวัน (journal) ฐานก่อน VAT — ตรงกับหน้าสรุปกำไรขาดทุน
            </p>
          </>
        )}
      </div>
    </div>
  );
}
