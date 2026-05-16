'use client';

import { useEffect, useState } from 'react';
import type { VatRecordType, WhtRecordType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort } from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Open an authenticated GET in a new browser tab. Used for PDF streaming
 * endpoints where the response is binary and we want the user to preview
 * inline (the browser's native PDF viewer handles printing).
 *
 * We can't just put the URL in <a target="_blank"> because the API requires
 * Authorization header. Instead we fetch as blob then open via blob URL.
 */
async function openAuthedPdf(path: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error('เบราว์เซอร์บล็อกการเปิดไฟล์ — กรุณาอนุญาต popup');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface Dashboard {
  period: { year: number; month: number | null };
  vat: {
    output: { base: string; vat: string; count: number };
    input: { base: string; vat: string; count: number };
    net: string;
    netLabel: string;
  };
  wht: {
    payable: { base: string; amount: string; count: number };
    receivable: { base: string; amount: string; count: number };
  };
}

interface VatRow {
  id: string;
  recordType: VatRecordType;
  sourceType: string;
  documentDate: string;
  documentNumber: string | null;
  partnerName: string;
  partnerTaxId: string | null;
  baseAmount: string;
  vatRate: string;
  vatAmount: string;
}

interface WhtRow {
  id: string;
  recordType: WhtRecordType;
  paidAt: string;
  partnerName: string;
  partnerTaxId: string | null;
  baseAmount: string;
  rate: string;
  whtAmount: string;
  certNumber: string | null;
  category: string | null;
}

interface PndSplitPreview {
  period: { year: number; month: number };
  pnd3: { count: number; base: string; wht: string };
  pnd53: { count: number; base: string; wht: string };
}

function currentBangkokYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function TaxPage() {
  const toast = useToast();
  const initial = currentBangkokYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [tab, setTab] = useState<'vat' | 'wht'>('vat');

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [vatRows, setVatRows] = useState<VatRow[]>([]);
  const [whtRows, setWhtRows] = useState<WhtRow[]>([]);
  const [pndSplit, setPndSplit] = useState<PndSplitPreview | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const q = `?year=${year}&month=${month}`;
      const [d, v, w, split] = await Promise.all([
        api<Dashboard>(`/tax/dashboard${q}`),
        api<{ items: VatRow[] }>(`/tax/vat-report${q}`),
        api<{ items: WhtRow[] }>(`/tax/wht-report${q}`),
        api<PndSplitPreview>(`/tax/wht/pnd-summary/${year}/${month}/preview`),
      ]);
      setDashboard(d);
      setVatRows(v.items);
      setWhtRows(w.items);
      setPndSplit(split);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูลภาษีล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  async function printCert(row: WhtRow) {
    try {
      await openAuthedPdf(`/tax/wht/certificate/${row.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'พิมพ์ 50 ทวิ ล้มเหลว');
    }
  }

  async function printPnd(form: 'PND3' | 'PND53') {
    try {
      await openAuthedPdf(`/tax/wht/pnd-summary/${year}/${month}/${form}`);
    } catch (e: any) {
      toast.error(e.message ?? `พิมพ์ ${form === 'PND3' ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53'} ล้มเหลว`);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const netNum = dashboard ? Number(dashboard.vat.net) : 0;
  const netTone: 'warn' | 'ok' | 'default' =
    netNum > 0 ? 'warn' : netNum < 0 ? 'ok' : 'default';

  const vatColumns: DataTableColumn<VatRow>[] = [
    {
      key: 'type',
      header: 'ประเภท',
      render: (r) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${
            r.recordType === 'OUTPUT'
              ? 'border-warn/40 bg-warn/10 text-warn'
              : 'border-info/40 bg-info/10 text-info'
          }`}
        >
          {r.recordType === 'OUTPUT' ? 'ภาษีขาย' : 'ภาษีซื้อ'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'วันที่',
      render: (r) => formatThaiDateShort(r.documentDate),
    },
    {
      key: 'doc',
      header: 'เลขที่เอกสาร',
      render: (r) => <span className="font-mono">{r.documentNumber ?? r.sourceType}</span>,
    },
    {
      key: 'partner',
      header: 'คู่ค้า',
      render: (r) => (
        <div>
          <div className="text-text">{r.partnerName}</div>
          <div className="font-mono text-[11px] text-text-mute">
            {r.partnerTaxId ?? '—'}
          </div>
        </div>
      ),
    },
    { key: 'base', header: 'ฐานภาษี', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.baseAmount) },
    {
      key: 'rate',
      header: 'อัตรา',
      align: 'right',
      render: (r) => `${r.vatRate}%`,
    },
    { key: 'vat', header: 'VAT', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.vatAmount) },
  ];

  const whtColumns: DataTableColumn<WhtRow>[] = [
    {
      key: 'type',
      header: 'ประเภท',
      render: (r) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${
            r.recordType === 'PAYABLE'
              ? 'border-warn/40 bg-warn/10 text-warn'
              : 'border-ok/40 bg-ok/10 text-ok'
          }`}
        >
          {r.recordType === 'PAYABLE' ? 'หักไว้แทนสรรพากร' : 'ถูกหักไว้รอเรียกคืน'}
        </span>
      ),
    },
    { key: 'date', header: 'วันที่', render: (r) => formatThaiDateShort(r.paidAt) },
    {
      key: 'partner',
      header: 'คู่ค้า',
      render: (r) => (
        <div>
          <div className="text-text">{r.partnerName}</div>
          <div className="font-mono text-[11px] text-text-mute">{r.partnerTaxId ?? '—'}</div>
        </div>
      ),
    },
    { key: 'base', header: 'ฐานภาษี', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.baseAmount) },
    { key: 'rate', header: 'อัตรา', align: 'right', render: (r) => `${r.rate}%` },
    { key: 'wht', header: 'หัก ณ ที่จ่าย', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.whtAmount) },
    { key: 'cert', header: 'เลขที่ 50 ทวิ', render: (r) => <span className="font-mono text-[11px]">{r.certNumber ?? '—'}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        r.recordType === 'PAYABLE' ? (
          <button
            onClick={() => printCert(r)}
            className="rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 text-[12px] text-brand hover:bg-brand/10"
          >
            พิมพ์ 50 ทวิ
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <AppTopbar title="ภาษี / VAT & WHT" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">รายงานภาษี</h1>
          <p className="mt-1 text-[13px] text-text-mute">
            สรุปภาษีมูลค่าเพิ่ม (VAT) และภาษีหัก ณ ที่จ่าย (WHT) แยกตามรอบเดือน — ข้อมูลย้อนกลับไปหาเอกสารต้นทางได้ทุกบรรทัด
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
          <div className="text-[12px] text-text-mute">
            (พ.ศ. {year + 543})
          </div>
        </div>

        {dashboard && (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <StatCard
              label="ภาษีขาย (Output VAT)"
              value={formatThaiCurrency(dashboard.vat.output.vat)}
              tone="warn"
              hint={`${dashboard.vat.output.count} ฉบับ · ฐาน ${formatThaiCurrency(dashboard.vat.output.base)}`}
            />
            <StatCard
              label="ภาษีซื้อ (Input VAT)"
              value={formatThaiCurrency(dashboard.vat.input.vat)}
              tone="info"
              hint={`${dashboard.vat.input.count} ฉบับ · ฐาน ${formatThaiCurrency(dashboard.vat.input.base)}`}
            />
            <StatCard
              label={dashboard.vat.netLabel}
              value={formatThaiCurrency(Math.abs(netNum))}
              tone={netTone}
              hint={netNum > 0 ? 'ภพ.30 ต้องนำส่ง' : netNum < 0 ? 'ยกไปเดือนถัดไป' : '—'}
            />
            <StatCard
              label="WHT ที่หักไว้แทนสรรพากร"
              value={formatThaiCurrency(dashboard.wht.payable.amount)}
              tone="warn"
              hint={`${dashboard.wht.payable.count} รายการ · ภงด.3/53`}
            />
            <StatCard
              label="WHT ถูกหักไว้รอเรียกคืน"
              value={formatThaiCurrency(dashboard.wht.receivable.amount)}
              tone="ok"
              hint={`${dashboard.wht.receivable.count} รายการ · 50 ทวิรับเข้า`}
            />
          </div>
        )}

        <div className="mt-6 flex gap-2 border-b border-border">
          {(['vat', 'wht'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium ${
                tab === t
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-soft hover:text-text'
              }`}
            >
              {t === 'vat' ? 'รายงาน VAT' : 'รายงาน WHT'}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'vat' ? (
            <DataTable
              columns={vatColumns}
              rows={vatRows}
              rowKey={(r) => r.id}
              loading={loading}
              emptyTitle="ยังไม่มี VAT record ในงวดนี้"
              emptyDescription="ใบกำกับภาษีที่ยืนยันแล้วจะปรากฏที่นี่อัตโนมัติ"
            />
          ) : (
            <>
              {pndSplit && (pndSplit.pnd3.count > 0 || pndSplit.pnd53.count > 0) && (
                <div className="mb-4 grid gap-3 md:grid-cols-2">
                  <PndPrintCard
                    title="ใบแนบ ภ.ง.ด.3"
                    subtitle="สำหรับยื่นพร้อมส่งเงินภาษี (บุคคลธรรมดา)"
                    count={pndSplit.pnd3.count}
                    base={pndSplit.pnd3.base}
                    wht={pndSplit.pnd3.wht}
                    disabled={pndSplit.pnd3.count === 0}
                    onPrint={() => printPnd('PND3')}
                  />
                  <PndPrintCard
                    title="ใบแนบ ภ.ง.ด.53"
                    subtitle="สำหรับยื่นพร้อมส่งเงินภาษี (นิติบุคคล)"
                    count={pndSplit.pnd53.count}
                    base={pndSplit.pnd53.base}
                    wht={pndSplit.pnd53.wht}
                    disabled={pndSplit.pnd53.count === 0}
                    onPrint={() => printPnd('PND53')}
                  />
                </div>
              )}
              <DataTable
                columns={whtColumns}
                rows={whtRows}
                rowKey={(r) => r.id}
                loading={loading}
                emptyTitle="ยังไม่มี WHT record ในงวดนี้"
                emptyDescription='หัก ณ ที่จ่ายในหน้า "รับ/จ่ายเงิน" จะปรากฏที่นี่อัตโนมัติ'
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function PndPrintCard({
  title,
  subtitle,
  count,
  base,
  wht,
  disabled,
  onPrint,
}: {
  title: string;
  subtitle: string;
  count: number;
  base: string;
  wht: string;
  disabled: boolean;
  onPrint: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14.5px] font-semibold text-text">{title}</div>
          <div className="mt-0.5 text-[11.5px] text-text-mute">{subtitle}</div>
        </div>
        <button
          onClick={onPrint}
          disabled={disabled}
          className="rounded-md bg-brand-gradient px-3 py-1.5 text-[12.5px] font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          พิมพ์ใบแนบ
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
        <div>
          <div className="text-text-mute text-[11px]">ผู้รับ</div>
          <div className="font-medium text-text">{count} ราย</div>
        </div>
        <div>
          <div className="text-text-mute text-[11px]">ฐานภาษีรวม</div>
          <div className="font-mono text-text">
            {Number(base).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <div className="text-text-mute text-[11px]">ภาษีที่หักนำส่ง</div>
          <div className="font-mono font-medium text-warn">
            {Number(wht).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}
