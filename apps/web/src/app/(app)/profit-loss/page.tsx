'use client';

import { useEffect, useState } from 'react';
import { AppTopbar } from '@/components/AppTopbar';
import { StatCard } from '@/components/ui/StatCard';
import { api } from '@/lib/api';
import { YEARS, rangeMonthOptions as MONTH_OPTIONS, thb } from '@/lib/report-filters';

// ---- Types -----------------------------------------------------------------

interface ProfitLossBreakdown {
  key: string;
  label: string;
  amount: number;
  count: number;
}

interface ProfitLossMonthly {
  month: number;
  monthLabel: string;
  revenue: number;
  expense: number;
  profit: number;
  marginPercent: number;
}

interface ProfitLossSummary {
  mode: 'monthly' | 'yearly';
  period: {
    year: number;
    beYear: number;
    month?: number;
    label: string;
  };
  totals: {
    revenue: number;
    revenueGross: number;
    expense: number;
    expenseGross: number;
    profit: number;
    marginPercent: number;
  };
  revenueByType: ProfitLossBreakdown[];
  expenseByCategory: ProfitLossBreakdown[];
  monthly: ProfitLossMonthly[];
}

// ---- Helpers ---------------------------------------------------------------

function pct(n: number) {
  return `${n >= 0 ? '' : ''}${n.toFixed(1)}%`;
}

function profitColor(n: number) {
  if (n > 0) return 'text-ok';
  if (n < 0) return 'text-bad';
  return 'text-text-mute';
}

function profitTone(n: number): 'ok' | 'bad' | 'default' {
  if (n > 0) return 'ok';
  if (n < 0) return 'bad';
  return 'default';
}

// ---- Bar Chart (inline SVG) ------------------------------------------------

function MonthlyBar({
  data,
  selectedMonth,
  onSelect,
}: {
  data: ProfitLossMonthly[];
  selectedMonth: string;
  onSelect: (m: string) => void;
}) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.revenue, d.expense)), 1);
  const BAR_H = 120;

  return (
    <div className="flex items-end gap-1">
      {data.map((d) => {
        const rH = Math.round((d.revenue / maxVal) * BAR_H);
        const eH = Math.round((d.expense / maxVal) * BAR_H);
        const active = selectedMonth === String(d.month);
        return (
          <button
            key={d.month}
            onClick={() => onSelect(active ? 'all' : String(d.month))}
            className={`group flex flex-1 flex-col items-center gap-0.5 rounded-lg px-0.5 py-2 transition-colors ${
              active ? 'bg-brand-gradient/10 ring-1 ring-inset ring-indigo-400/30' : 'hover:bg-surface-3'
            }`}
            title={`${d.monthLabel}: รายรับ ${thb(d.revenue)} รายจ่าย ${thb(d.expense)}`}
          >
            <div className="flex items-end gap-0.5" style={{ height: `${BAR_H}px` }}>
              <div
                className="w-3 rounded-t-sm bg-indigo-400/70 transition-all group-hover:bg-indigo-400"
                style={{ height: `${rH}px` }}
              />
              <div
                className="w-3 rounded-t-sm bg-rose-400/70 transition-all group-hover:bg-rose-400"
                style={{ height: `${eH}px` }}
              />
            </div>
            <span className="text-[9px] leading-tight text-text-mute">
              {d.monthLabel.slice(0, 3)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Breakdown Panel -------------------------------------------------------

function BreakdownPanel({
  title,
  rows,
  total,
  colorClass,
}: {
  title: string;
  rows: ProfitLossBreakdown[];
  total: number;
  colorClass: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-[13px] font-semibold text-text">{title}</div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-text-mute">ไม่มีข้อมูล</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const pct = total > 0 ? (r.amount / total) * 100 : 0;
            return (
              <div key={r.key} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="truncate text-text-soft">{r.label}</span>
                  <span className={`ml-2 shrink-0 font-medium ${colorClass}`}>
                    {thb(r.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full ${colorClass.includes('indigo') ? 'bg-indigo-400' : 'bg-rose-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-[10.5px] text-text-mute">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Monthly Table ---------------------------------------------------------

function MonthlyTable({
  data,
  beYear,
  onMonthClick,
}: {
  data: ProfitLossMonthly[];
  beYear: number;
  onMonthClick: (m: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-[11.5px] uppercase tracking-wide text-text-mute">
            <th className="px-4 py-2.5 text-left">เดือน ({beYear})</th>
            <th className="px-4 py-2.5 text-right">รายรับ</th>
            <th className="px-4 py-2.5 text-right">รายจ่าย</th>
            <th className="px-4 py-2.5 text-right">กำไร (ขาดทุน)</th>
            <th className="px-4 py-2.5 text-right">อัตรากำไร</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.month}
              className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2"
              onClick={() => onMonthClick(String(row.month))}
            >
              <td className="px-4 py-2.5 font-medium text-text">{row.monthLabel}</td>
              <td className="px-4 py-2.5 text-right text-indigo-500">{thb(row.revenue)}</td>
              <td className="px-4 py-2.5 text-right text-rose-500">{thb(row.expense)}</td>
              <td className={`px-4 py-2.5 text-right font-semibold ${profitColor(row.profit)}`}>
                {thb(row.profit)}
              </td>
              <td className={`px-4 py-2.5 text-right ${profitColor(row.marginPercent)}`}>
                {row.revenue > 0 ? pct(row.marginPercent) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Main Page -------------------------------------------------------------

export default function ProfitLossPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<string>('all');
  const [data, setData] = useState<ProfitLossSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year) });
    if (month !== 'all') params.set('month', month);
    api<ProfitLossSummary>(`/reports/profit-loss?${params}`)
      .then(setData)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [year, month]);

  const totals = data?.totals;
  const revenueByType = data?.revenueByType ?? [];
  const expenseByCat = data?.expenseByCategory ?? [];
  const monthly = data?.monthly ?? [];

  return (
    <div className="flex flex-col">
      <AppTopbar title={`สรุปกำไรขาดทุน${data ? ` — ${data.period.label}` : ''}`} />

      <div className="flex flex-col gap-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-text-soft">ปี</label>
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setMonth('all'); }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {y + 543}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[13px] text-text-soft">เดือน</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {MONTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <span className="text-[12px] text-text-mute">กำลังโหลด...</span>
          )}
          {error && (
            <span className="text-[12px] text-red-500">{error}</span>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="รายรับรวม"
            value={thb(totals?.revenue ?? 0)}
            hint="ก่อน VAT (accrual basis)"
          />
          <StatCard
            label="รายจ่ายรวม"
            value={thb(totals?.expense ?? 0)}
            hint="ก่อน VAT"
          />
          <StatCard
            label={!totals || totals.profit >= 0 ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ'}
            value={thb(totals?.profit ?? 0)}
            tone={profitTone(totals?.profit ?? 0)}
            hint="รายรับ – รายจ่าย (ก่อน VAT)"
          />
          <StatCard
            label="อัตรากำไร"
            value={totals && totals.revenue > 0 ? pct(totals.marginPercent) : '—'}
            tone={profitTone(totals?.marginPercent ?? 0)}
            hint={totals && totals.revenue > 0 ? 'กำไร / รายรับ × 100' : 'ยังไม่มีรายรับ'}
          />
        </div>

        {/* Yearly mode: Bar chart + table */}
        {month === 'all' && (
          <>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text">
                  รายรับ vs รายจ่าย รายเดือน (พ.ศ. {year + 543})
                </span>
                <span className="text-[11px] text-text-mute">
                  คลิกแท่งเพื่อดูรายละเอียดเดือนนั้น
                </span>
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
              <MonthlyBar data={monthly} selectedMonth={month} onSelect={setMonth} />
            </div>

            <MonthlyTable
              data={monthly}
              beYear={year + 543}
              onMonthClick={setMonth}
            />
          </>
        )}

        {/* Breakdown panels (always shown, more prominent in monthly mode) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BreakdownPanel
            title="รายรับแยกตามประเภทเอกสาร"
            rows={revenueByType}
            total={totals?.revenue ?? 0}
            colorClass="text-indigo-500"
          />
          <BreakdownPanel
            title="รายจ่ายแยกตามหมวดหมู่"
            rows={expenseByCat}
            total={totals?.expense ?? 0}
            colorClass="text-rose-500"
          />
        </div>

        {/* VAT note */}
        <p className="text-[11.5px] text-text-faint">
          * ยอดรายรับและรายจ่ายคำนวณจากฐานก่อน VAT (accrual basis) — รายรับจากใบแจ้งหนี้/ใบกำกับภาษีที่ยืนยันแล้ว
          และ ใบเสร็จรับเงินที่ออกตรง (ไม่ผ่านใบแจ้งหนี้) — รายจ่ายจากใบเสร็จรายจ่ายที่บันทึกแล้ว
        </p>
      </div>
    </div>
  );
}
