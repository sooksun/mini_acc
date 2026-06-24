'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { PaymentDirection, PaymentMethod, PaymentStatus, PartnerType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PartnerPicker } from '@/components/ui/PartnerPicker';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort, localDateString } from '@/lib/format';
import { useRegisterPageDescriptor } from '@/contexts/AssistantContext';

interface PartnerLite {
  id: string;
  code: string | null;
  nameTh: string;
  taxId: string | null;
  type: PartnerType;
  /** Required for PartnerPicker compat — Payment payload doesn't include it
   * but the picker fills it in when the user selects. We default to null when
   * the value comes back from /payments. */
  address: string | null;
}

interface PaymentRow {
  id: string;
  direction: PaymentDirection;
  partnerId: string;
  paymentDate: string;
  amount: string;
  whtAmount: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  status: PaymentStatus;
  sourceType: string | null;
  sourceId: string | null;
  voidReason: string | null;
  partner: PartnerLite;
  whtRecord: { id: string; certNumber: string | null } | null;
  createdAt: string;
}

const DIRECTION_LABEL: Record<PaymentDirection, { label: string; tone: string }> = {
  IN: { label: 'รับเงิน', tone: 'border-ok/40 bg-ok/10 text-ok' },
  OUT: { label: 'จ่ายเงิน', tone: 'border-warn/40 bg-warn/10 text-warn' },
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนธนาคาร',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
  PROMPT_PAY: 'พร้อมเพย์',
  OTHER: 'อื่น ๆ',
};

const STATUS_LABEL: Record<PaymentStatus, { label: string; tone: string }> = {
  PENDING: { label: 'รอชำระ', tone: 'border-warn/40 bg-warn/10 text-warn' },
  COMPLETED: { label: 'สำเร็จ', tone: 'border-ok/40 bg-ok/10 text-ok' },
  VOIDED: { label: 'ยกเลิก', tone: 'border-bad/40 bg-bad/10 text-bad' },
};

export default function PaymentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<PaymentDirection | ''>('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);

  const role = getUser()?.role;
  const canCreate = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';
  const canVoid = role === 'OWNER' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (direction) params.set('direction', direction);
      if (search) params.set('search', search);
      params.set('take', '100');
      const result = await api<{ items: PaymentRow[]; total: number }>(
        `/payments?${params.toString()}`,
      );
      setRows(result.items);
      setTotal(result.total);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, search]);

  // KPI cards (visible-rows aggregate)
  const inTotal = rows
    .filter((r) => r.direction === 'IN' && r.status !== 'VOIDED')
    .reduce((s, r) => s + Number(r.amount), 0);
  const outTotal = rows
    .filter((r) => r.direction === 'OUT' && r.status !== 'VOIDED')
    .reduce((s, r) => s + Number(r.amount), 0);
  const whtTotal = rows
    .filter((r) => r.status !== 'VOIDED')
    .reduce((s, r) => s + Number(r.whtAmount), 0);

  const columns: DataTableColumn<PaymentRow>[] = [
    {
      key: 'paymentDate',
      header: 'วันที่',
      render: (r) => formatThaiDateShort(r.paymentDate),
    },
    {
      key: 'direction',
      header: 'ประเภท',
      render: (r) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${DIRECTION_LABEL[r.direction].tone}`}
        >
          {DIRECTION_LABEL[r.direction].label}
        </span>
      ),
    },
    {
      key: 'partner',
      header: 'คู่ค้า',
      render: (r) => (
        <div>
          <div className="font-medium">{r.partner.nameTh}</div>
          <div className="font-mono text-[11px] text-text-mute">
            {r.partner.taxId ?? 'ไม่มีเลขผู้เสียภาษี'}
          </div>
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'อ้างอิง',
      render: (r) => (
        <div>
          <div className="text-text">{r.reference ?? '-'}</div>
          <div className="text-[11px] text-text-mute">{METHOD_LABEL[r.method]}</div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'ยอด',
      align: 'right',
      numeric: true,
      render: (r) => formatThaiCurrency(r.amount),
    },
    {
      key: 'wht',
      header: 'หัก ณ ที่จ่าย',
      align: 'right',
      numeric: true,
      render: (r) =>
        Number(r.whtAmount) > 0 ? (
          <span className="text-warn">{formatThaiCurrency(r.whtAmount)}</span>
        ) : (
          <span className="text-text-mute">—</span>
        ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (r) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${STATUS_LABEL[r.status].tone}`}
        >
          {STATUS_LABEL[r.status].label}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canVoid && r.status === 'COMPLETED' ? (
          <button
            onClick={() => setVoiding(r)}
            className="rounded-md border border-bad/40 bg-bad/5 px-2.5 py-1 text-[12px] text-bad hover:bg-bad/10"
          >
            ยกเลิก
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <AppTopbar title="รับเงิน / จ่ายเงิน" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">การชำระเงิน</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              บันทึกการรับเงิน/จ่ายเงิน พร้อมหัก ณ ที่จ่าย และสร้าง Journal Entry อัตโนมัติ
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + บันทึกการชำระเงิน
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <StatCard label="ทั้งหมดในมุมมองนี้" value={String(total)} />
          <StatCard label="ยอดรับเข้า" value={formatThaiCurrency(inTotal)} tone="ok" />
          <StatCard label="ยอดจ่ายออก" value={formatThaiCurrency(outTotal)} tone="warn" />
          <StatCard label="หัก ณ ที่จ่ายรวม" value={formatThaiCurrency(whtTotal)} tone="info" />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as PaymentDirection | '')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
          >
            <option value="">ทั้งรับและจ่าย</option>
            <option value="IN">เฉพาะรับเงิน</option>
            <option value="OUT">เฉพาะจ่ายเงิน</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ผู้ขาย / ลูกค้า / อ้างอิง"
            className="w-96 rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </div>

        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={loading}
            emptyTitle="ยังไม่มีการชำระเงิน"
            emptyDescription={canCreate ? 'กดปุ่ม "บันทึกการชำระเงิน" ด้านบนเพื่อเริ่มต้น' : undefined}
          />
        </div>
      </div>

      <CreatePaymentModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />

      <VoidPaymentModal
        payment={voiding}
        onClose={() => setVoiding(null)}
        onSaved={() => {
          setVoiding(null);
          load();
        }}
      />
    </>
  );
}

function CreatePaymentModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<PaymentDirection>('OUT');
  const [partner, setPartner] = useState<PartnerLite | null>(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [whtAmount, setWhtAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [whtCertNumber, setWhtCertNumber] = useState('');
  const [whtCategory, setWhtCategory] = useState('');
  const [note, setNote] = useState('');
  const [linkedInvoiceId, setLinkedInvoiceId] = useState('');
  const [openInvoices, setOpenInvoices] = useState<
    Array<{ id: string; number: string; grandTotal: string; type: string }>
  >([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDirection('OUT');
      setPartner(null);
      setPaymentDate(localDateString());
      setAmount('');
      setWhtAmount('');
      setMethod('BANK_TRANSFER');
      setReference('');
      setBankAccount('');
      setWhtCertNumber('');
      setWhtCategory('');
      setNote('');
      setLinkedInvoiceId('');
      setOpenInvoices([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || direction !== 'IN' || !partner) {
      setOpenInvoices([]);
      setLinkedInvoiceId('');
      return;
    }
    setLoadingInvoices(true);
    const params = new URLSearchParams();
    params.set('customerId', partner.id);
    params.set('take', '50');
    Promise.all([
      api<{ items: Array<{ id: string; number: string; grandTotal: string }> }>(
        `/sales/invoices?${params.toString()}`,
      ),
      api<{ items: Array<{ id: string; number: string; grandTotal: string }> }>(
        `/sales/tax-invoices?${params.toString()}`,
      ),
    ])
      .then(([inv, tax]) => {
        const merged = [
          ...inv.items.map((d) => ({ ...d, type: 'INVOICE' })),
          ...tax.items.map((d) => ({ ...d, type: 'TAX_INVOICE' })),
        ].filter((d) => !d.number.startsWith('DRAFT-'));
        setOpenInvoices(merged);
      })
      .catch(() => setOpenInvoices([]))
      .finally(() => setLoadingInvoices(false));
  }, [open, direction, partner]);

  const amountNum = Number(amount) || 0;
  const whtNum = Number(whtAmount) || 0;
  const cashOut = Math.max(0, amountNum - whtNum);

  useRegisterPageDescriptor(
    () =>
      !open
        ? null
        : {
            route: '/payments',
            title: 'บันทึกรับ/จ่ายเงิน',
            operation: 'create',
            fields: [
              {
                name: 'direction',
                label: 'ทิศทาง',
                type: 'select',
                required: true,
                options: [
                  { value: 'IN', label: 'รับเงิน' },
                  { value: 'OUT', label: 'จ่ายเงิน' },
                ],
              },
              { name: 'partnerName', label: 'คู่ค้า', type: 'partner', required: true },
              { name: 'paymentDate', label: 'วันที่', type: 'date', required: true },
              { name: 'amount', label: 'จำนวนเงิน', type: 'number', required: true },
              { name: 'whtAmount', label: 'หัก ณ ที่จ่าย', type: 'number' },
              {
                name: 'method',
                label: 'วิธีจ่าย',
                type: 'select',
                options: Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label })),
              },
              { name: 'reference', label: 'อ้างอิง', type: 'text' },
              { name: 'note', label: 'หมายเหตุ', type: 'textarea' },
            ],
            getCurrentValues: () => ({
              direction,
              partnerName: partner?.nameTh ?? null,
              paymentDate,
              amount,
              whtAmount,
              method,
              reference,
              note,
            }),
            applyValues: (p) => {
              if (p.direction === 'IN' || p.direction === 'OUT') setDirection(p.direction);
              if (p.paymentDate !== undefined) setPaymentDate(String(p.paymentDate).slice(0, 10));
              if (p.amount !== undefined) setAmount(String(p.amount));
              if (p.whtAmount !== undefined) setWhtAmount(String(p.whtAmount));
              if (typeof p.method === 'string' && p.method in METHOD_LABEL) setMethod(p.method as PaymentMethod);
              if (p.reference !== undefined) setReference(String(p.reference));
              if (p.note !== undefined) setNote(String(p.note));
              if (typeof p.partnerName === 'string' && p.partnerName.trim() && !partner) {
                const name = p.partnerName.trim();
                api<{ items: PartnerLite[] }>(`/partners?search=${encodeURIComponent(name)}`)
                  .then((res) => {
                    const exact = res.items.filter((x) => x.nameTh === name);
                    if (exact.length === 1) setPartner(exact[0]!);
                  })
                  .catch(() => undefined);
              }
            },
          },
    [open],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!partner) {
      toast.error('กรุณาเลือกคู่ค้า');
      return;
    }
    if (amountNum <= 0) {
      toast.error('ยอดเงินต้องมากกว่า 0');
      return;
    }
    setSaving(true);
    try {
      await api('/payments', {
        method: 'POST',
        body: JSON.stringify({
          direction,
          partnerId: partner.id,
          paymentDate,
          amount,
          whtAmount: whtAmount || undefined,
          method,
          reference: reference.trim() || undefined,
          bankAccount: bankAccount.trim() || undefined,
          whtCertNumber: whtCertNumber.trim() || undefined,
          whtCategory: whtCategory.trim() || undefined,
          note: note.trim() || undefined,
          ...(direction === 'IN' && linkedInvoiceId
            ? { sourceType: 'SALES_DOCUMENT', sourceId: linkedInvoiceId }
            : {}),
        }),
      });
      toast.success('บันทึกการชำระเงินแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="บันทึกการรับ/จ่ายเงิน"
      size="xl"
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
            form="create-payment-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="create-payment-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">ประเภท</span>
          <div className="flex gap-2">
            {(['OUT', 'IN'] as PaymentDirection[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 rounded-md border px-3 py-2 text-[13.5px] ${
                  direction === d
                    ? 'border-brand bg-brand/10 text-brand font-medium'
                    : 'border-border bg-surface-2 text-text-soft'
                }`}
              >
                {DIRECTION_LABEL[d].label}
              </button>
            ))}
          </div>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">
            {direction === 'OUT' ? 'ผู้รับเงิน (Vendor)' : 'ผู้จ่ายเงิน (Customer)'}
          </span>
          <PartnerPicker
            type={direction === 'OUT' ? 'VENDOR' : 'CUSTOMER'}
            value={partner}
            onChange={(p) => {
              setPartner(p);
              setLinkedInvoiceId('');
            }}
            placeholder="ค้นหาและเลือก"
          />
        </label>

        {direction === 'IN' && (
          <label className="md:col-span-2">
            <span className="mb-1 block text-[12.5px] text-text-soft">
              ผูกกับใบแจ้งหนี้ (ถ้ารับชำระลูกหนี้)
            </span>
            <select
              value={linkedInvoiceId}
              onChange={(e) => setLinkedInvoiceId(e.target.value)}
              disabled={!partner || loadingInvoices}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-60"
            >
              <option value="">— ไม่ผูกใบแจ้งหนี้ —</option>
              {openInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} · {formatThaiCurrency(inv.grandTotal)} บาท
                </option>
              ))}
            </select>
            {partner && !loadingInvoices && openInvoices.length === 0 && (
              <p className="mt-1 text-[11.5px] text-text-mute">
                ไม่พบใบแจ้งหนี้ของลูกค้านี้ — บันทึกรับเงินทั่วไปได้โดยไม่ผูก
              </p>
            )}
          </label>
        )}

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">วันที่ชำระ</span>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">วิธีชำระ</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          >
            {Object.entries(METHOD_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">ยอดเงิน (บาท)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-right font-mono text-[14px] outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">
            หัก ณ ที่จ่าย (บาท) — เว้นว่างถ้าไม่มี
          </span>
          <input
            value={whtAmount}
            onChange={(e) => setWhtAmount(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-right font-mono text-[14px] outline-none focus:border-brand"
          />
        </label>

        {amountNum > 0 && (
          <div className="md:col-span-2 rounded-md border border-info/30 bg-info/5 p-3 text-[12.5px] text-text-soft">
            <div className="flex justify-between">
              <span>ยอดรวม</span>
              <span className="font-mono">{formatThaiCurrency(amountNum)}</span>
            </div>
            {whtNum > 0 && (
              <div className="flex justify-between text-warn">
                <span>หัก ณ ที่จ่าย</span>
                <span className="font-mono">- {formatThaiCurrency(whtNum)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-info/20 pt-1 font-medium">
              <span>{direction === 'OUT' ? 'จ่ายจริง' : 'รับจริง'}</span>
              <span className="font-mono">{formatThaiCurrency(cashOut)}</span>
            </div>
          </div>
        )}

        {whtNum > 0 && (
          <>
            <label>
              <span className="mb-1 block text-[12.5px] text-text-soft">
                เลขที่ ภงด./50 ทวิ
              </span>
              <input
                value={whtCertNumber}
                onChange={(e) => setWhtCertNumber(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              />
            </label>
            <label>
              <span className="mb-1 block text-[12.5px] text-text-soft">ประเภทเงินได้</span>
              <input
                value={whtCategory}
                onChange={(e) => setWhtCategory(e.target.value)}
                placeholder="เช่น ม.40(2) ค่าจ้าง"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              />
            </label>
          </>
        )}

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">เลขที่อ้างอิง</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="เช่น PV-001, INV-2569-0001"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">บัญชีธนาคาร</span>
          <input
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            placeholder="ชื่อบัญชี/เลขบัญชี"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">หมายเหตุ</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-16 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
      </form>
    </Modal>
  );
}

function VoidPaymentModal({
  payment,
  onClose,
  onSaved,
}: {
  payment: PaymentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payment) setReason('');
  }, [payment]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!payment) return;
    if (!reason.trim()) {
      toast.error('กรุณาระบุเหตุผลในการยกเลิก');
      return;
    }
    setSaving(true);
    try {
      await api(`/payments/${payment.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast.success('ยกเลิกการชำระเงินแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'ยกเลิกล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!payment}
      onClose={onClose}
      title="ยกเลิกการชำระเงิน"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[13px]"
          >
            กลับ
          </button>
          <button
            type="submit"
            form="void-payment-form"
            disabled={saving || !reason.trim()}
            className="rounded-md bg-bad px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก'}
          </button>
        </>
      }
    >
      {payment && (
        <form id="void-payment-form" onSubmit={submit} className="space-y-3">
          <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-[12.5px] text-text-soft">
            <div className="font-medium text-text">{DIRECTION_LABEL[payment.direction].label} — {payment.partner.nameTh}</div>
            <div className="mt-1 font-mono text-[12px]">
              {formatThaiCurrency(payment.amount)} บาท · {formatThaiDateShort(payment.paymentDate)}
            </div>
            <div className="mt-1 text-[11.5px] text-text-mute">
              Journal entry ที่ผูกอยู่จะถูกยกเลิกอัตโนมัติด้วย
            </div>
          </div>
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">เหตุผลในการยกเลิก *</span>
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
