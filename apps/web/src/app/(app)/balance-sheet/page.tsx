'use client';

import { useEffect, useState } from 'react';
import { AppTopbar } from '@/components/AppTopbar';
import { api } from '@/lib/api';
import { YEARS, CURRENT_CE_YEAR, asOfMonthOptions as MONTH_OPTIONS, thb } from '@/lib/report-filters';

// ---- Types -----------------------------------------------------------------

interface BalanceSheetRow {
  accountCode: string;
  accountName: string;
  amount: number;
  synthetic?: boolean;
}

interface BalanceSheetSummary {
  asOf: { year: number; beYear: number; month?: number; label: string };
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilitiesAndEquity: number;
    balanced: boolean;
  };
}

// ---- Section block ---------------------------------------------------------

function Section({
  title,
  rows,
  total,
  totalLabel,
}: {
  title: string;
  rows: BalanceSheetRow[];
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border bg-surface-2 px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-text-soft">
        {title}
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-text-mute" colSpan={2}>
                — ไม่มีรายการ —
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.accountCode} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2">
                  <span className="mr-2 font-mono text-[11.5px] text-text-mute">
                    {r.synthetic ? '' : r.accountCode}
                  </span>
                  <span className={r.synthetic ? 'italic text-text-soft' : 'text-text'}>
                    {r.accountName}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-text-soft">{thb(r.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-surface-2 font-bold text-text">
            <td className="px-4 py-2.5">{totalLabel}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{thb(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---- Main Page -------------------------------------------------------------

export default function BalanceSheetPage() {
  const [year, setYear] = useState(CURRENT_CE_YEAR);
  const [month, setMonth] = useState<string>('all');
  const [data, setData] = useState<BalanceSheetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year) });
    if (month !== 'all') params.set('month', month);
    api<BalanceSheetSummary>(`/reports/balance-sheet?${params}`)
      .then(setData)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [year, month]);

  const totals = data?.totals;

  return (
    <div className="flex flex-col">
      <AppTopbar title={`งบแสดงฐานะการเงิน${data ? ` — ${data.asOf.label}` : ''}`} />

      <div className="flex flex-col gap-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-text-soft">ปี</label>
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

          {totals && (
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${
                totals.balanced
                  ? 'border-ok/40 bg-ok/10 text-ok'
                  : 'border-bad/40 bg-bad/10 text-bad'
              }`}
            >
              {totals.balanced
                ? '✓ สินทรัพย์ = หนี้สิน + ส่วนของผู้ถือหุ้น'
                : '✗ ไม่สมดุล — ตรวจสอบบัญชี'}
            </span>
          )}
        </div>

        {/* Two-sided layout: assets | liabilities + equity */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Section
              title="สินทรัพย์"
              rows={data?.assets ?? []}
              total={totals?.assets ?? 0}
              totalLabel="รวมสินทรัพย์"
            />
          </div>

          <div className="flex flex-col gap-5">
            <Section
              title="หนี้สิน"
              rows={data?.liabilities ?? []}
              total={totals?.liabilities ?? 0}
              totalLabel="รวมหนี้สิน"
            />
            <Section
              title="ส่วนของผู้ถือหุ้น"
              rows={data?.equity ?? []}
              total={totals?.equity ?? 0}
              totalLabel="รวมส่วนของผู้ถือหุ้น"
            />
            <div className="rounded-xl border-2 border-border bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between font-bold text-text">
                <span>รวมหนี้สินและส่วนของผู้ถือหุ้น</span>
                <span className="tabular-nums">{thb(totals?.liabilitiesAndEquity ?? 0)}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11.5px] text-text-faint">
          * งบแสดงฐานะการเงินคำนวณจากสมุดรายวันแบบยอดสะสม ณ วันที่เลือก — กำไร(ขาดทุน)ของงวดปัจจุบันที่ยังไม่ปิดบัญชี
          จะรวมอยู่ในส่วนของผู้ถือหุ้นเป็นบรรทัด &quot;กำไร(ขาดทุน)สะสม - งวดปัจจุบัน&quot; เพื่อให้งบสมดุล
          (ยอดยกมา เช่น ทุนจดทะเบียน/สินทรัพย์เดิม ต้องบันทึกผ่านรายการสมุดรายวันยกมา)
          <br />
          * บัญชีสินทรัพย์ที่มียอดด้านเครดิต (เช่น เงินเบิกเกินบัญชี) จะแสดงเป็นค่าลบในหมวดสินทรัพย์
          ยังไม่ได้จัดประเภทใหม่ไปฝั่งหนี้สิน — ส่วนค่าเสื่อมราคาสะสมเป็นบัญชีปรับมูลค่า (contra) หักจากสินทรัพย์ถูกต้องแล้ว
        </p>
      </div>
    </div>
  );
}
