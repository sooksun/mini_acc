'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DocumentStatus, DocumentType, PaymentMethod } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Money } from '@/components/ui/Money';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { ThaiDatePicker } from '@/components/ui/ThaiDatePicker';
import { useToast } from '@/components/ui/Toast';
import { api, apiBlob } from '@/lib/api';
import {
  formatThaiCurrency,
  formatThaiDate,
  formatThaiDateTime,
  localDateString,
  numberToThaiBahtText,
} from '@/lib/format';
import { getUser } from '@/lib/auth';
import { DOC_TYPE_META, type DocTypeMeta } from './doc-type-meta';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนธนาคาร',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
  PROMPT_PAY: 'พร้อมเพย์',
  OTHER: 'อื่น ๆ',
};

interface Item {
  id: string;
  lineNumber: number;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  lineTotal: string;
  vatable: boolean;
}

interface ChainRef {
  id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
}

interface SettlementPayment {
  id: string;
  paymentDate: string;
  amount: string;
  whtAmount: string;
  method: PaymentMethod;
  reference: string | null;
}

interface Settlement {
  paid: boolean;
  paidAmount: string;
  outstanding: string;
  payments: SettlementPayment[];
}

interface SalesDoc {
  id: string;
  customerId: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  documentDate: string;
  dueDate: string | null;
  reference: string | null;
  note: string | null;
  customer: {
    nameTh: string;
    address: string | null;
    taxId: string | null;
    branch: string | null;
  };
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  totalAfterVat: string;
  whtRate: string;
  whtAmount: string;
  grandTotal: string;
  netReceived: string;
  items: Item[];
  confirmedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  pdfPath: string | null;
  parentDocument: ChainRef | null;
  childDocuments: ChainRef[];
  settlement?: Settlement;
  createdAt: string;
  updatedAt: string;
}

export function SalesDocumentDetail({
  meta,
  id,
}: {
  meta: DocTypeMeta;
  id: string;
}) {
  const toast = useToast();
  const [doc, setDoc] = useState<SalesDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

  const role = getUser()?.role;
  const canEdit = doc?.status === 'DRAFT' && (role === 'OWNER' || role === 'ADMIN');
  const canConfirm = doc?.status === 'DRAFT' && (role === 'OWNER' || role === 'ADMIN');
  const canVoid =
    doc &&
    ['DRAFT', 'USER_CONFIRMED', 'ACCOUNTED', 'LOCKED'].includes(doc.status) &&
    (role === 'OWNER' || role === 'ACCOUNTANT' || (role === 'ADMIN' && doc.status === 'DRAFT'));
  const canGeneratePdf =
    doc &&
    doc.status !== 'DRAFT' &&
    doc.status !== 'VOIDED' &&
    (role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT');
  // "ลงบัญชี": receipts that are confirmed can be marked ACCOUNTED once the
  // money has cleared the bank.
  const canAccount =
    !!doc &&
    !!meta.canAccount &&
    doc.status === 'USER_CONFIRMED' &&
    (role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT');
  // On a confirmed QUOTATION the chain has already materialised an INVOICE
  // draft (createDownstreamDrafts) — surface a shortcut to it.
  const childInvoice = doc?.childDocuments.find(
    (c) => c.type === 'INVOICE' && c.status !== 'VOIDED',
  );
  // "รับชำระเงิน": invoices/tax-invoices post Dr ลูกหนี้(AR) at confirm — once
  // confirmed (and not yet settled) the customer's payment can be recorded,
  // which clears the AR. Single full payment model: the button hides once a
  // non-voided payment is linked back to this document.
  const isArDoc = doc?.type === 'INVOICE' || doc?.type === 'TAX_INVOICE';
  const canSettle =
    !!doc &&
    isArDoc &&
    ['USER_CONFIRMED', 'ACCOUNTED', 'LOCKED'].includes(doc.status) &&
    !doc.settlement?.paid &&
    (role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT');

  async function load() {
    setLoading(true);
    try {
      const d = await api<SalesDoc>(`${meta.apiBase}/${id}`);
      setDoc(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, meta.apiBase]);

  async function handleConfirm() {
    try {
      await api(`${meta.apiBase}/${id}/confirm`, { method: 'POST' });
      toast.success('ยืนยันแล้ว ได้เลขจริงแล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirmOpen(false);
    }
  }

  async function handleAccount() {
    try {
      await api(`${meta.apiBase}/${id}/account`, { method: 'POST' });
      toast.success('บันทึกลงบัญชีแล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleVoid(reason?: string) {
    if (!reason) return;
    try {
      await api(`${meta.apiBase}/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      toast.success('ยกเลิกเอกสารแล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVoidOpen(false);
    }
  }

  async function handlePreviewPdf() {
    // Open popup synchronously inside the click handler so the popup blocker
    // treats it as user-initiated; navigate to the blob URL after fetch.
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      toast.error('เบราว์เซอร์บล็อกการเปิดไฟล์ — กรุณาอนุญาต popup');
      return;
    }
    try {
      const blob = await apiBlob(`${meta.pdfBase}/${id}/preview`);
      const url = URL.createObjectURL(blob);
      popup.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      popup.close();
      toast.error('ดู PDF ไม่สำเร็จ: ' + e.message);
    }
  }

  async function handleGeneratePdf() {
    try {
      toast.info('กำลังสร้าง PDF…');
      const { jobId } = await api<{ jobId: string }>(`${meta.pdfBase}/${id}/generate`, {
        method: 'POST',
      });

      const start = Date.now();
      while (Date.now() - start < 60_000) {
        await new Promise((r) => setTimeout(r, 1200));
        const status = await api<{ state: string; error?: string }>(
          `${meta.pdfBase}/${id}/status?jobId=${jobId}`,
        );
        if (status.state === 'completed') {
          toast.success('สร้าง PDF จริงแล้ว');
          await load();
          await handleDownloadPdf();
          return;
        }
        if (status.state === 'failed') {
          toast.error('สร้าง PDF ไม่สำเร็จ: ' + (status.error ?? 'unknown'));
          return;
        }
      }
      toast.error('สร้าง PDF ใช้เวลานานเกิน 60 วินาที — ลองรีเฟรชหน้านี้');
    } catch (e: any) {
      toast.error('สร้าง PDF ไม่สำเร็จ: ' + e.message);
    }
  }

  async function handleDownloadPdf() {
    try {
      const blob = await apiBlob(`${meta.pdfBase}/${id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc?.number || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) {
      toast.error('ดาวน์โหลด PDF ไม่สำเร็จ: ' + e.message);
    }
  }

  if (loading) {
    return (
      <>
        <AppTopbar title={meta.title} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={24} />
        </div>
      </>
    );
  }

  if (error || !doc) {
    return (
      <>
        <AppTopbar title={meta.title} />
        <div className="flex-1 px-7 pb-16 pt-6">
          <div className="rounded-md border border-bad/40 bg-bad/5 px-4 py-3 text-bad">
            {error ?? 'ไม่พบเอกสาร'}
          </div>
          <Link
            href={meta.listHref as any}
            className="mt-4 inline-block text-[13px] text-brand hover:underline"
          >
            ← กลับรายการ
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AppTopbar title={meta.title} />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href={meta.listHref as any}
              className="text-[12.5px] text-text-mute hover:text-text"
            >
              ← กลับรายการ
            </Link>
            <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-tight">
              <span className="font-mono">{doc.number}</span>
              <StatusBadge status={doc.status} />
            </h1>
            <p className="mt-1 text-[13px] text-text-mute">
              {meta.title} · สร้างเมื่อ {formatThaiDateTime(doc.createdAt)}
              {doc.confirmedAt && ` · ยืนยันเมื่อ ${formatThaiDateTime(doc.confirmedAt)}`}
              {doc.voidedAt && ` · ยกเลิกเมื่อ ${formatThaiDateTime(doc.voidedAt)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePreviewPdf}
              className="rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] text-text-soft hover:bg-surface-3"
            >
              ดูตัวอย่าง PDF
            </button>
            {canGeneratePdf && (
              <button
                onClick={handleGeneratePdf}
                className="rounded-md border border-brand/40 bg-brand/5 px-3.5 py-2 text-[13px] font-medium text-brand hover:bg-brand/10"
              >
                สร้าง PDF จริง
              </button>
            )}
            {doc.pdfPath && (
              <button
                onClick={handleDownloadPdf}
                className="rounded-md border border-ok/40 bg-ok/5 px-3.5 py-2 text-[13px] font-medium text-ok hover:bg-ok/10"
              >
                ดาวน์โหลด PDF จริง
              </button>
            )}
            {canEdit && (
              <Link
                href={`${meta.listHref}/${id}/edit` as any}
                className="rounded-md border border-brand/40 bg-brand/5 px-3.5 py-2 text-[13px] font-medium text-brand hover:bg-brand/10"
              >
                แก้ไข
              </Link>
            )}
            {canConfirm && (
              <button
                onClick={() => setConfirmOpen(true)}
                className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
              >
                ยืนยัน → ออกเลขจริง
              </button>
            )}
            {doc.type === 'QUOTATION' && childInvoice && (
              <Link
                href={`${DOC_TYPE_META.INVOICE.listHref}/${childInvoice.id}` as any}
                className="rounded-md border border-brand/40 bg-brand/5 px-4 py-2 text-[13px] font-medium text-brand hover:bg-brand/10"
              >
                แปลงเป็นใบแจ้งหนี้ →
              </Link>
            )}
            {canAccount && (
              <button
                onClick={handleAccount}
                className="rounded-md border border-ok/40 bg-ok/5 px-4 py-2 text-[13px] font-medium text-ok hover:bg-ok/10"
              >
                ลงบัญชี
              </button>
            )}
            {canSettle && (
              <button
                onClick={() => setSettleOpen(true)}
                className="rounded-md border border-ok/50 bg-ok/10 px-4 py-2 text-[13px] font-semibold text-ok hover:bg-ok/20"
              >
                รับชำระเงิน
              </button>
            )}
            {canVoid && (
              <button
                onClick={() => setVoidOpen(true)}
                className="rounded-md border border-bad/40 bg-bad/5 px-4 py-2 text-[13px] font-medium text-bad hover:bg-bad/10"
              >
                ยกเลิกเอกสาร
              </button>
            )}
          </div>
        </div>

        {doc.voidReason && (
          <div className="mt-4 rounded-md border border-bad/40 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            <b>เหตุผลยกเลิก:</b> {doc.voidReason}
          </div>
        )}

        {(doc.parentDocument || doc.childDocuments.length > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-text-mute">สายเอกสาร:</span>
            {doc.parentDocument && <ChainLink doc={doc.parentDocument} direction="prev" />}
            {doc.childDocuments.map((c) => (
              <ChainLink key={c.id} doc={c} direction="next" />
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <h3 className="mb-3 text-[13px] font-semibold text-text-soft">ลูกค้า</h3>
              <div className="text-[15px] font-semibold">{doc.customer.nameTh}</div>
              {doc.customer.address && (
                <div className="mt-1 text-[12.5px] text-text-soft">{doc.customer.address}</div>
              )}
              {doc.customer.taxId && (
                <div className="mt-1 font-mono text-[11.5px] text-text-mute">
                  เลขผู้เสียภาษี: {doc.customer.taxId}
                  {doc.customer.branch && ` · สาขา ${doc.customer.branch}`}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="grid grid-cols-3 gap-4 text-[13px]">
                <Info label="วันที่เอกสาร" value={formatThaiDate(doc.documentDate)} />
                <Info
                  label="กำหนดยืนราคาถึง"
                  value={doc.dueDate ? formatThaiDate(doc.dueDate) : '—'}
                />
                <Info label="อ้างอิง" value={doc.reference ?? '—'} />
              </div>
              {doc.note && (
                <div className="mt-3 border-t border-border pt-3 text-[13px]">
                  <div className="text-[12px] text-text-mute">หมายเหตุ</div>
                  <div className="mt-1 whitespace-pre-wrap">{doc.note}</div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              <table className="w-full text-[13.5px]">
                <thead className="bg-surface-2 text-left text-text-soft">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">รายการ</th>
                    <th className="px-3 py-2 font-medium">หน่วย</th>
                    <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                    <th className="px-3 py-2 text-right font-medium">ราคา</th>
                    <th className="px-3 py-2 text-right font-medium">ส่วนลด</th>
                    <th className="px-3 py-2 font-medium">VAT</th>
                    <th className="px-3 py-2 text-right font-medium">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((it) => (
                    <tr key={it.id} className="border-t border-border align-top">
                      <td className="px-3 py-2.5 text-text-mute">{it.lineNumber}</td>
                      <td className="px-3 py-2.5">
                        <div className="whitespace-pre-wrap">{it.description}</div>
                      </td>
                      <td className="px-3 py-2.5 text-text-soft">{it.unit}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{it.quantity}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Money value={it.unitPrice} symbol={false} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money value={it.discount} symbol={false} />
                      </td>
                      <td className="px-3 py-2.5 text-text-soft">{it.vatable ? '7%' : '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Money value={it.lineTotal} symbol={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside>
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-20">
              <h3 className="mb-3 text-[13px] font-semibold text-text-soft">สรุปยอด</h3>
              <SummaryRow label="รวมเงิน" value={doc.subtotal} />
              <SummaryRow label={`VAT ${doc.vatRate}%`} value={doc.vatAmount} />
              <SummaryRow label="รวมหลัง VAT" value={doc.totalAfterVat} bold />
              <SummaryRow label={`หัก ณ ที่จ่าย ${doc.whtRate}%`} value={doc.whtAmount} muted />
              <div className="my-2 border-t border-border" />
              <SummaryRow label="ยอดเงินสุทธิ" value={doc.netReceived} bold large />
              <div className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-[11.5px] text-text-mute">
                ({numberToThaiBahtText(doc.netReceived)})
              </div>

              {isArDoc && (
                <div className="mt-4 border-t border-border pt-4">
                  <h3 className="mb-2 text-[13px] font-semibold text-text-soft">การรับชำระ</h3>
                  {doc.settlement?.paid ? (
                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-ok/40 bg-ok/10 px-2 py-1 text-[12px] font-medium text-ok">
                        ✓ รับชำระแล้ว
                      </span>
                      {doc.settlement.payments.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-md bg-surface-2 px-3 py-2 text-[12px]"
                        >
                          <div className="flex justify-between">
                            <span className="text-text-mute">
                              {formatThaiDate(p.paymentDate)}
                            </span>
                            <span className="font-mono">
                              {formatThaiCurrency(Number(p.amount))}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-text-mute">
                            {METHOD_LABEL[p.method]}
                            {p.reference ? ` · ${p.reference}` : ''}
                            {Number(p.whtAmount) > 0
                              ? ` · หัก ณ ที่จ่าย ${formatThaiCurrency(Number(p.whtAmount))}`
                              : ''}
                          </div>
                        </div>
                      ))}
                      <Link
                        href="/payments"
                        className="inline-block text-[12px] text-brand hover:underline"
                      >
                        ดูในรับ/จ่ายเงิน →
                      </Link>
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-text-mute">
                      ยังไม่ได้รับชำระ
                      {doc.status === 'DRAFT' ? ' — ยืนยันเอกสารก่อนจึงจะรับชำระได้' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`ยืนยัน${meta.title}?`}
        description="ระบบจะออกเลขจริงทันทีและล็อกเลขนั้น คุณยังสามารถยกเลิกเอกสารได้ภายหลัง แต่เลขจะคงเดิม"
        confirmLabel="ยืนยัน"
        onConfirm={handleConfirm}
        onClose={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={voidOpen}
        title="ยกเลิกเอกสารนี้?"
        description="เอกสารที่ยกเลิกจะคงเลขเดิมไว้แต่ไม่นำไปคำนวณในรายงาน"
        confirmLabel="ยกเลิกเอกสาร"
        destructive
        requireReason
        onConfirm={handleVoid}
        onClose={() => setVoidOpen(false)}
      />

      {doc && (
        <RecordPaymentModal
          open={settleOpen}
          onClose={() => setSettleOpen(false)}
          doc={doc}
          onSaved={() => {
            setSettleOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function RecordPaymentModal({
  open,
  onClose,
  onSaved,
  doc,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  doc: SalesDoc;
}) {
  const toast = useToast();
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [whtAmount, setWhtAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [whtCertNumber, setWhtCertNumber] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPaymentDate(localDateString());
      // Single full-payment model: prefill the full receivable + the invoice's
      // WHT so the journal clears AR exactly (Dr Cash + Dr WHT Receivable = Cr AR).
      setAmount(doc.grandTotal);
      setWhtAmount(Number(doc.whtAmount) > 0 ? doc.whtAmount : '');
      setMethod('BANK_TRANSFER');
      setReference(doc.number);
      setWhtCertNumber('');
      setNote('');
    }
  }, [open, doc]);

  const amountNum = Number(amount) || 0;
  const whtNum = Number(whtAmount) || 0;
  const cashIn = Math.max(0, amountNum - whtNum);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amountNum <= 0) {
      toast.error('ยอดเงินต้องมากกว่า 0');
      return;
    }
    setSaving(true);
    try {
      await api('/payments', {
        method: 'POST',
        body: JSON.stringify({
          direction: 'IN',
          partnerId: doc.customerId,
          paymentDate,
          amount,
          whtAmount: whtAmount || undefined,
          method,
          reference: reference.trim() || undefined,
          whtCertNumber: whtCertNumber.trim() || undefined,
          sourceType: 'SALES_DOCUMENT',
          sourceId: doc.id,
          note: note.trim() || undefined,
        }),
      });
      toast.success('รับชำระเงินแล้ว');
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
      title={`รับชำระเงิน — ${doc.number}`}
      size="lg"
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
            form="record-payment-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกรับชำระ'}
          </button>
        </>
      }
    >
      <form id="record-payment-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] md:col-span-2">
          <span className="text-text-mute">ลูกค้า:</span>{' '}
          <span className="font-medium">{doc.customer.nameTh}</span>
        </div>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">วันที่รับชำระ</span>
          <ThaiDatePicker value={paymentDate} onChange={setPaymentDate} />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">วิธีรับชำระ</span>
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
          <span className="mb-1 block text-[12.5px] text-text-soft">ยอดรับชำระ (บาท)</span>
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

        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-[12.5px] text-text-soft md:col-span-2">
          <div className="flex justify-between">
            <span>ยอดเต็มใบ</span>
            <span className="font-mono">{formatThaiCurrency(amountNum)}</span>
          </div>
          {whtNum > 0 && (
            <div className="flex justify-between text-warn">
              <span>หัก ณ ที่จ่าย</span>
              <span className="font-mono">- {formatThaiCurrency(whtNum)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-info/20 pt-1 font-medium">
            <span>รับเงินจริง</span>
            <span className="font-mono">{formatThaiCurrency(cashIn)}</span>
          </div>
        </div>

        {whtNum > 0 && (
          <label className="md:col-span-2">
            <span className="mb-1 block text-[12.5px] text-text-soft">
              เลขที่หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — ถ้ามี
            </span>
            <input
              value={whtCertNumber}
              onChange={(e) => setWhtCertNumber(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            />
          </label>
        )}

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

function ChainLink({ doc, direction }: { doc: ChainRef; direction: 'prev' | 'next' }) {
  const m = DOC_TYPE_META[doc.type as keyof typeof DOC_TYPE_META];
  if (!m) return null;
  return (
    <Link
      href={`${m.listHref}/${doc.id}` as any}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-text-soft hover:border-brand hover:text-text"
    >
      {direction === 'prev' && <span>←</span>}
      <span>{m.shortTitle}</span>
      <span className="font-mono text-text-mute">{doc.number}</span>
      <StatusBadge status={doc.status} />
      {direction === 'next' && <span>→</span>}
    </Link>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] text-text-mute">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  large,
  muted,
}: {
  label: string;
  value: string | number;
  bold?: boolean;
  large?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${
        large ? 'text-[15px]' : 'text-[13px]'
      } ${bold ? 'font-semibold' : ''} ${muted ? 'text-text-mute' : ''}`}
    >
      <span>{label}</span>
      <Money value={value} symbol={false} />
    </div>
  );
}
