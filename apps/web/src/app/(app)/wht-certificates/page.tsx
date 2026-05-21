'use client';

import { useEffect, useState } from 'react';
import type { WhtRecordType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort } from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

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
  sourceType?: string | null;
}

interface PndSplitPreview {
  period: { year: number; month: number };
  pnd3: { count: number; base: string; wht: string };
  pnd53: { count: number; base: string; wht: string };
  pnd54: { count: number; base: string; wht: string };
}

type Tab = 'PND3' | 'PND53' | 'PND54' | 'RECEIVABLE';

function nowYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Infer ภ.ง.ด.3 vs ภ.ง.ด.53 from the partner's tax ID — same rule as backend
 * (apps/api/src/tax/templates/wht-shared.ts). Leading "0" = juristic person.
 */
function inferPnd(taxId: string | null): 'PND3' | 'PND53' {
  if (!taxId) return 'PND3';
  const d = taxId.replace(/\D/g, '');
  if (d.length !== 13) return 'PND3';
  return d[0] === '0' ? 'PND53' : 'PND3';
}

/**
 * Fetches an authenticated PDF and navigates the supplied popup to it.
 * The popup MUST be opened by the caller synchronously inside the click
 * handler, otherwise the browser's popup blocker will swallow it.
 */
async function openAuthedPdf(path: string, popup: Window): Promise<void> {
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
  popup.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function WhtCertificatesPage() {
  const toast = useToast();
  const init = nowYearMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [tab, setTab] = useState<Tab>('PND3');
  const [rows, setRows] = useState<WhtRow[]>([]);
  const [pndSplit, setPndSplit] = useState<PndSplitPreview | null>(null);
  const [loading, setLoading] = useState(true);

  const role = getUser()?.role;
  const canPrint = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const q = `?year=${year}&month=${month}`;
      const [reportData, split] = await Promise.all([
        api<{ items: WhtRow[] }>(`/tax/wht-report${q}`),
        api<PndSplitPreview>(`/tax/wht/pnd-summary/${year}/${month}/preview`),
      ]);
      setRows(reportData.items);
      setPndSplit(split);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูล WHT ล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function printCertificate(row: WhtRow) {
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast.error('เบราว์เซอร์บล็อกการเปิดไฟล์ — กรุณาอนุญาต popup');
      return;
    }
    try {
      await openAuthedPdf(`/tax/wht/certificate/${row.id}`, popup);
    } catch (e: any) {
      popup.close();
      toast.error(e.message ?? 'พิมพ์ 50 ทวิ ล้มเหลว');
    }
  }

  async function printPndAttachment(form: 'PND3' | 'PND53' | 'PND54') {
    const label = form === 'PND3' ? 'ภ.ง.ด.3' : form === 'PND53' ? 'ภ.ง.ด.53' : 'ภ.ง.ด.54';
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast.error('เบราว์เซอร์บล็อกการเปิดไฟล์ — กรุณาอนุญาต popup');
      return;
    }
    try {
      await openAuthedPdf(`/tax/wht/pnd-summary/${year}/${month}/${form}`, popup);
    } catch (e: any) {
      popup.close();
      toast.error(e.message ?? `พิมพ์ใบแนบ ${label} ล้มเหลว`);
    }
  }

  // Partition rows by record type. Foreign payments (sourceType FOREIGN_WHT)
  // are ภ.ง.ด.54; the rest split into ภ.ง.ด.3/53 by the Thai tax ID.
  const payable = rows.filter((r) => r.recordType === 'PAYABLE');
  const receivable = rows.filter((r) => r.recordType === 'RECEIVABLE');
  const isForeignWht = (r: WhtRow) => r.sourceType === 'FOREIGN_WHT';
  const pnd54Rows = payable.filter(isForeignWht);
  const domesticPayable = payable.filter((r) => !isForeignWht(r));
  const pnd3Rows = domesticPayable.filter((r) => inferPnd(r.partnerTaxId) === 'PND3');
  const pnd53Rows = domesticPayable.filter((r) => inferPnd(r.partnerTaxId) === 'PND53');

  const totalPayable = payable.reduce((s, r) => s + Number(r.whtAmount), 0);

  const certColumns: DataTableColumn<WhtRow>[] = [
    { key: 'date', header: 'วันที่จ่าย', render: (r) => formatThaiDateShort(r.paidAt) },
    {
      key: 'partner',
      header: 'ผู้ถูกหักภาษี',
      render: (r) => (
        <div>
          <div className="text-text">{r.partnerName}</div>
          <div className="font-mono text-[11px] text-text-mute">{r.partnerTaxId ?? '—'}</div>
        </div>
      ),
    },
    { key: 'category', header: 'ประเภทเงินได้', render: (r) => r.category ?? '—' },
    { key: 'base', header: 'ฐานภาษี', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.baseAmount) },
    { key: 'rate', header: 'อัตรา', align: 'right', render: (r) => `${r.rate}%` },
    { key: 'wht', header: 'หัก ณ ที่จ่าย', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.whtAmount) },
    {
      key: 'cert',
      header: 'เลข 50 ทวิ',
      render: (r) => <span className="font-mono text-[11px]">{r.certNumber ?? 'auto'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canPrint ? (
          <button
            onClick={() => printCertificate(r)}
            className="rounded-md bg-brand-gradient px-3 py-1 text-[12px] font-medium text-white shadow-sm"
          >
            พิมพ์ 50 ทวิ
          </button>
        ) : null,
    },
  ];

  const receivableColumns: DataTableColumn<WhtRow>[] = [
    { key: 'date', header: 'วันที่ถูกหัก', render: (r) => formatThaiDateShort(r.paidAt) },
    {
      key: 'partner',
      header: 'ผู้หักภาษี (ลูกค้าของเรา)',
      render: (r) => (
        <div>
          <div className="text-text">{r.partnerName}</div>
          <div className="font-mono text-[11px] text-text-mute">{r.partnerTaxId ?? '—'}</div>
        </div>
      ),
    },
    { key: 'base', header: 'ฐานภาษี', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.baseAmount) },
    { key: 'rate', header: 'อัตรา', align: 'right', render: (r) => `${r.rate}%` },
    { key: 'wht', header: 'ภาษีถูกหัก', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.whtAmount) },
    {
      key: 'cert',
      header: 'เลข 50 ทวิ (ที่รับจากลูกค้า)',
      render: (r) => <span className="font-mono text-[11px]">{r.certNumber ?? '—'}</span>,
    },
  ];

  const currentRows =
    tab === 'PND3'
      ? pnd3Rows
      : tab === 'PND53'
        ? pnd53Rows
        : tab === 'PND54'
          ? pnd54Rows
          : receivable;
  const currentColumns = tab === 'RECEIVABLE' ? receivableColumns : certColumns;

  return (
    <>
      <AppTopbar title="หนังสือรับรอง 50 ทวิ + ภ.ง.ด." />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
          <p className="mt-1 text-[13px] text-text-mute">
            พิมพ์หนังสือรับรอง 50 ทวิ ให้ผู้ขาย + ใบแนบ ภ.ง.ด.3 / ภ.ง.ด.53 / ภ.ง.ด.54 (ต่างประเทศ)
            รายเดือนสำหรับยื่นสรรพากร
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

        <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="รายการในงวด (PAYABLE)" value={String(payable.length)} />
          <StatCard
            label="ภาษีหักนำส่งรวม"
            value={formatThaiCurrency(totalPayable)}
            tone="warn"
            hint="ยอดที่ต้องส่งสรรพากร"
          />
          <StatCard
            label="ภ.ง.ด.3 (บุคคลธรรมดา)"
            value={pndSplit ? String(pndSplit.pnd3.count) : '—'}
            tone="info"
            hint={pndSplit ? `${formatThaiCurrency(pndSplit.pnd3.wht)} บาท` : undefined}
          />
          <StatCard
            label="ภ.ง.ด.53 (นิติบุคคล)"
            value={pndSplit ? String(pndSplit.pnd53.count) : '—'}
            tone="info"
            hint={pndSplit ? `${formatThaiCurrency(pndSplit.pnd53.wht)} บาท` : undefined}
          />
          <StatCard
            label="ภ.ง.ด.54 (ต่างประเทศ)"
            value={pndSplit ? String(pndSplit.pnd54.count) : '—'}
            tone="info"
            hint={pndSplit ? `${formatThaiCurrency(pndSplit.pnd54.wht)} บาท` : undefined}
          />
        </div>

        {/* Large print cards for PND attachments (ภ.ง.ด.3 / 53 / 54) */}
        {pndSplit &&
          (pndSplit.pnd3.count > 0 || pndSplit.pnd53.count > 0 || pndSplit.pnd54.count > 0) && (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <PndFilingCard
              code="ภ.ง.ด.3"
              subtitle="แบบยื่นรายการหักภาษี ณ ที่จ่าย — บุคคลธรรมดา"
              count={pndSplit.pnd3.count}
              base={pndSplit.pnd3.base}
              wht={pndSplit.pnd3.wht}
              periodLabel={`${year + 543}/${String(month).padStart(2, '0')}`}
              disabled={!canPrint || pndSplit.pnd3.count === 0}
              onPrint={() => printPndAttachment('PND3')}
            />
            <PndFilingCard
              code="ภ.ง.ด.53"
              subtitle="แบบยื่นรายการหักภาษี ณ ที่จ่าย — นิติบุคคล"
              count={pndSplit.pnd53.count}
              base={pndSplit.pnd53.base}
              wht={pndSplit.pnd53.wht}
              periodLabel={`${year + 543}/${String(month).padStart(2, '0')}`}
              disabled={!canPrint || pndSplit.pnd53.count === 0}
              onPrint={() => printPndAttachment('PND53')}
            />
            <PndFilingCard
              code="ภ.ง.ด.54"
              subtitle="แบบยื่นรายการหักภาษี ณ ที่จ่าย — จ่ายไปต่างประเทศ (ม.70)"
              count={pndSplit.pnd54.count}
              base={pndSplit.pnd54.base}
              wht={pndSplit.pnd54.wht}
              periodLabel={`${year + 543}/${String(month).padStart(2, '0')}`}
              disabled={!canPrint || pndSplit.pnd54.count === 0}
              onPrint={() => printPndAttachment('PND54')}
            />
          </div>
        )}

        <div className="mt-6 flex gap-2 border-b border-border">
          {(
            [
              { key: 'PND3', label: `ภ.ง.ด.3 (${pnd3Rows.length})` },
              { key: 'PND53', label: `ภ.ง.ด.53 (${pnd53Rows.length})` },
              { key: 'PND54', label: `ภ.ง.ด.54 (${pnd54Rows.length})` },
              { key: 'RECEIVABLE', label: `ถูกหักไว้ (${receivable.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium ${
                tab === t.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-soft hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <DataTable
            columns={currentColumns}
            rows={currentRows}
            rowKey={(r) => r.id}
            loading={loading}
            emptyTitle={
              tab === 'RECEIVABLE'
                ? 'ไม่มีรายการที่ถูกลูกค้าหักไว้ในงวดนี้'
                : `ไม่มีรายการ ${
                    tab === 'PND3' ? 'ภ.ง.ด.3' : tab === 'PND53' ? 'ภ.ง.ด.53' : 'ภ.ง.ด.54'
                  } ในงวดนี้`
            }
            emptyDescription="WHT records สร้างอัตโนมัติเมื่อมี payment ที่มี whtAmount > 0"
          />
        </div>

        <div className="mt-6 rounded-md border border-info/30 bg-info/5 p-4 text-[12.5px] text-text-soft">
          <div className="mb-1 font-medium text-text">หมายเหตุ</div>
          <ul className="list-disc space-y-1 pl-5">
            <li>หนังสือรับรอง 50 ทวิ ออกได้เฉพาะรายการ <strong>PAYABLE</strong> เท่านั้น (รายการที่เราหักไว้แทนสรรพากร) — ส่งให้ผู้ขายเป็นต้นฉบับ + สำเนา 2 ใบ</li>
            <li>รายการที่ลูกค้าหักเราไว้ (RECEIVABLE) ผู้ขายจะออก 50 ทวิ ให้เรา — เก็บไว้แนบยื่นภาษีบริษัทประจำปี</li>
            <li>ใบแนบ ภ.ง.ด. ต้องยื่นภายในวันที่ 7 ของเดือนถัดไปพร้อมส่งเงินภาษีให้สรรพากร</li>
            <li>เลข 50 ทวิ "auto" คือเลขที่ระบบสร้างให้อัตโนมัติเมื่อ operator ไม่ได้ตั้งเอง — แก้ได้ใน /payments ขณะบันทึก</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function PndFilingCard({
  code,
  subtitle,
  count,
  base,
  wht,
  periodLabel,
  disabled,
  onPrint,
}: {
  code: string;
  subtitle: string;
  count: number;
  base: string;
  wht: string;
  periodLabel: string;
  disabled: boolean;
  onPrint: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[18px] font-bold tracking-tight text-text">{code}</div>
          <div className="mt-0.5 text-[12px] text-text-mute">{subtitle}</div>
          <div className="mt-0.5 text-[11px] text-text-faint">รอบ {periodLabel}</div>
        </div>
        <button
          onClick={onPrint}
          disabled={disabled}
          className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          พิมพ์ใบแนบ
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-[12.5px]">
        <div>
          <div className="text-[11px] text-text-mute">ผู้รับเงิน</div>
          <div className="mt-0.5 text-[15px] font-bold text-text">{count} ราย</div>
        </div>
        <div>
          <div className="text-[11px] text-text-mute">ฐานภาษีรวม</div>
          <div className="mt-0.5 font-mono text-[13px] text-text">
            {Number(base).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-text-mute">ภาษีที่ต้องส่งสรรพากร</div>
          <div className="mt-0.5 font-mono text-[14px] font-bold text-warn">
            {Number(wht).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}
