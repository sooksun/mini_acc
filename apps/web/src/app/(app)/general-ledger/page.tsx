'use client';

import { useEffect, useState } from 'react';
import { AppTopbar } from '@/components/AppTopbar';
import { api } from '@/lib/api';
import { formatThaiDateShort } from '@/lib/format';
import { YEARS, CURRENT_CE_YEAR, rangeMonthOptions as MONTH_OPTIONS, thb } from '@/lib/report-filters';

// ---- Types -----------------------------------------------------------------

interface AccountOption {
  code: string;
  name: string;
  accountType: string;
  accountTypeLabel: string;
}

interface GeneralLedgerLine {
  date: string;
  journalEntryId: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface GeneralLedgerReport {
  account: { code: string; name: string; accountType: string; accountTypeLabel: string };
  period: { year: number; beYear: number; month?: number; label: string };
  openingBalance: number;
  lines: GeneralLedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

// ---- Helpers ---------------------------------------------------------------

// Signed (debit-positive) balance → absolute value + Dr/Cr suffix.
function balanceLabel(n: number) {
  if (n === 0) return '0.00';
  return `${thb(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`;
}

// ---- Main Page -------------------------------------------------------------

export default function GeneralLedgerPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountCode, setAccountCode] = useState<string>('');
  const [year, setYear] = useState(CURRENT_CE_YEAR);
  const [month, setMonth] = useState<string>('all');
  const [data, setData] = useState<GeneralLedgerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the chart of accounts once for the picker.
  useEffect(() => {
    api<AccountOption[]>('/reports/accounts')
      .then((list) => {
        setAccounts(list);
        if (list.length > 0 && !accountCode) setAccountCode(list[0]!.code);
      })
      .catch((e: unknown) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountCode) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ accountCode, year: String(year) });
    if (month !== 'all') params.set('month', month);
    api<GeneralLedgerReport>(`/reports/general-ledger?${params}`)
      .then(setData)
      .catch((e: unknown) => {
        setError((e as Error).message);
        setData(null); // clear stale report so the table doesn't show the wrong account
      })
      .finally(() => setLoading(false));
  }, [accountCode, year, month]);

  return (
    <div className="flex flex-col">
      <AppTopbar title={`บัญชีแยกประเภท${data ? ` — ${data.account.code} ${data.account.name}` : ''}`} />

      <div className="flex flex-col gap-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-text-soft">บัญชี</label>
            <select
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              className="min-w-[260px] rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name} ({a.accountTypeLabel})
                </option>
              ))}
            </select>
          </div>

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

          {loading && <span className="text-[12px] text-text-mute">กำลังโหลด...</span>}
          {error && <span className="text-[12px] text-red-500">{error}</span>}
        </div>

        {/* Ledger table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-[11.5px] uppercase tracking-wide text-text-mute">
                <th className="w-28 px-4 py-2.5 text-left">วันที่</th>
                <th className="px-4 py-2.5 text-left">รายการ</th>
                <th className="w-32 px-4 py-2.5 text-right">เดบิต</th>
                <th className="w-32 px-4 py-2.5 text-right">เครดิต</th>
                <th className="w-36 px-4 py-2.5 text-right">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance */}
              <tr className="border-b border-border/60 bg-surface/60 text-text-soft">
                <td className="px-4 py-2" colSpan={4}>
                  ยอดยกมา
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {balanceLabel(data?.openingBalance ?? 0)}
                </td>
              </tr>

              {data && data.lines.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-mute">
                    ไม่มีรายการเคลื่อนไหวในงวดนี้
                  </td>
                </tr>
              ) : (
                data?.lines.map((l, i) => (
                  <tr
                    key={`${l.journalEntryId}-${i}`}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-2 text-text-soft">{formatThaiDateShort(l.date)}</td>
                    <td className="px-4 py-2 text-text">{l.description}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-soft">
                      {l.debit === 0 ? '—' : thb(l.debit)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-soft">
                      {l.credit === 0 ? '—' : thb(l.credit)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-text">
                      {balanceLabel(l.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {data && (
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-2 font-bold text-text">
                  <td className="px-4 py-3" colSpan={2}>
                    รวมเคลื่อนไหว / ยอดคงเหลือ
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{thb(data.totalDebit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{thb(data.totalCredit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {balanceLabel(data.closingBalance)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-[11.5px] text-text-faint">
          * ยอดคงเหลือแสดงแบบ Dr (เดบิต) / Cr (เครดิต) ตามด้านของยอด — บัญชีสินทรัพย์/ค่าใช้จ่ายปกติเป็น Dr,
          หนี้สิน/ส่วนของผู้ถือหุ้น/รายได้ปกติเป็น Cr ยอดยกมาคือผลสะสมก่อนเริ่มงวดที่เลือก
        </p>
      </div>
    </div>
  );
}
