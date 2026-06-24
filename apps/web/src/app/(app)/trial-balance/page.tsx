'use client';

import { useEffect, useState } from 'react';
import { AppTopbar } from '@/components/AppTopbar';
import { api } from '@/lib/api';
import { YEARS, CURRENT_CE_YEAR, asOfMonthOptions as MONTH_OPTIONS, thb } from '@/lib/report-filters';

// ---- Types -----------------------------------------------------------------

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'OTHER';

interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  accountTypeLabel: string;
  debit: number;
  credit: number;
}

interface TrialBalanceSummary {
  asOf: { year: number; beYear: number; month?: number; label: string };
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number; balanced: boolean };
}

// ---- Helpers ---------------------------------------------------------------

// Section order for a conventional trial balance (assets → liabilities → equity
// → revenue → expense). OTHER sinks to the bottom.
const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'OTHER'];

function amount(n: number) {
  return n === 0 ? '—' : thb(n);
}

// ---- Main Page -------------------------------------------------------------

export default function TrialBalancePage() {
  const [year, setYear] = useState(CURRENT_CE_YEAR);
  const [month, setMonth] = useState<string>('all');
  const [data, setData] = useState<TrialBalanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year) });
    if (month !== 'all') params.set('month', month);
    api<TrialBalanceSummary>(`/reports/trial-balance?${params}`)
      .then(setData)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [year, month]);

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  // Group rows by account type, preserving the conventional section order.
  const sections = TYPE_ORDER.map((type) => {
    const sectionRows = rows.filter((r) => r.accountType === type);
    if (sectionRows.length === 0) return null;
    return {
      type,
      label: sectionRows[0]!.accountTypeLabel,
      rows: sectionRows,
      debit: sectionRows.reduce((s, r) => s + r.debit, 0),
      credit: sectionRows.reduce((s, r) => s + r.credit, 0),
    };
  }).filter(Boolean) as {
    type: AccountType;
    label: string;
    rows: TrialBalanceRow[];
    debit: number;
    credit: number;
  }[];

  return (
    <div className="flex flex-col">
      <AppTopbar title={`งบทดลอง${data ? ` — ${data.asOf.label}` : ''}`} />

      <div className="flex flex-col gap-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-text-soft">ปี</label>
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); }}
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
            <label className="text-[13px] text-text-soft">ณ</label>
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

          {loading && <span className="text-[12px] text-text-mute">กำลังโหลด...</span>}
          {error && <span className="text-[12px] text-red-500">{error}</span>}

          {/* Balanced indicator */}
          {totals && (
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${
                totals.balanced
                  ? 'border-ok/40 bg-ok/10 text-ok'
                  : 'border-bad/40 bg-bad/10 text-bad'
              }`}
            >
              {totals.balanced ? '✓ เดบิต = เครดิต' : '✗ ไม่สมดุล — ตรวจสอบบัญชี'}
            </span>
          )}
        </div>

        {/* Trial balance table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-[11.5px] uppercase tracking-wide text-text-mute">
                <th className="w-24 px-4 py-2.5 text-left">รหัส</th>
                <th className="px-4 py-2.5 text-left">ชื่อบัญชี</th>
                <th className="w-40 px-4 py-2.5 text-right">เดบิต</th>
                <th className="w-40 px-4 py-2.5 text-right">เครดิต</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-text-mute">
                    ยังไม่มีรายการในสมุดรายวันสำหรับงวดนี้
                  </td>
                </tr>
              ) : (
                sections.map((section) => (
                  <SectionRows key={section.type} section={section} />
                ))
              )}
            </tbody>
            {totals && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-2 font-bold text-text">
                  <td className="px-4 py-3" colSpan={2}>
                    รวมทั้งสิ้น
                  </td>
                  <td className="px-4 py-3 text-right">{thb(totals.debit)}</td>
                  <td className="px-4 py-3 text-right">{thb(totals.credit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-[11.5px] text-text-faint">
          * งบทดลองคำนวณจากสมุดรายวัน (journal) ที่ลงรายการแล้ว — เป็นยอดสะสมตั้งแต่เริ่มกิจการจนถึงงวดที่เลือก
          (ยังไม่มีรายการปิดบัญชีสิ้นปี รายได้/ค่าใช้จ่ายจึงสะสมต่อเนื่อง) บัญชีที่ยอดเป็นศูนย์จะไม่แสดง
        </p>
      </div>
    </div>
  );
}

function SectionRows({
  section,
}: {
  section: { type: AccountType; label: string; rows: TrialBalanceRow[]; debit: number; credit: number };
}) {
  return (
    <>
      <tr className="border-b border-border/60 bg-surface/60">
        <td colSpan={4} className="px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-text-soft">
          {section.label}
        </td>
      </tr>
      {section.rows.map((r) => (
        <tr
          key={r.accountCode}
          className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2"
        >
          <td className="px-4 py-2 font-mono text-[12px] text-text-mute">{r.accountCode}</td>
          <td className="px-4 py-2 text-text">{r.accountName}</td>
          <td className="px-4 py-2 text-right tabular-nums text-text-soft">{amount(r.debit)}</td>
          <td className="px-4 py-2 text-right tabular-nums text-text-soft">{amount(r.credit)}</td>
        </tr>
      ))}
      <tr className="border-b border-border bg-surface-2/40 text-[12.5px] font-medium text-text-soft">
        <td colSpan={2} className="px-4 py-1.5 text-right">
          รวม{section.label}
        </td>
        <td className="px-4 py-1.5 text-right tabular-nums">{amount(section.debit)}</td>
        <td className="px-4 py-1.5 text-right tabular-nums">{amount(section.credit)}</td>
      </tr>
    </>
  );
}
