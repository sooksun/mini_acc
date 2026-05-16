'use client';

import { useEffect, useState } from 'react';
import type { VatRecordType, WhtRecordType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatThaiCurrency, formatThaiDateShort } from '@/lib/format';

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
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const q = `?year=${year}&month=${month}`;
      const [d, v, w] = await Promise.all([
        api<Dashboard>(`/tax/dashboard${q}`),
        api<{ items: VatRow[] }>(`/tax/vat-report${q}`),
        api<{ items: WhtRow[] }>(`/tax/wht-report${q}`),
      ]);
      setDashboard(d);
      setVatRows(v.items);
      setWhtRows(w.items);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูลภาษีล้มเหลว');
    } finally {
      setLoading(false);
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
    { key: 'cert', header: 'เลขที่ 50 ทวิ', render: (r) => r.certNumber ?? '—' },
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
            <DataTable
              columns={whtColumns}
              rows={whtRows}
              rowKey={(r) => r.id}
              loading={loading}
              emptyTitle="ยังไม่มี WHT record ในงวดนี้"
              emptyDescription='หัก ณ ที่จ่ายในหน้า "รับ/จ่ายเงิน" จะปรากฏที่นี่อัตโนมัติ'
            />
          )}
        </div>
      </div>
    </>
  );
}
