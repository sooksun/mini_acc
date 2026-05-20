'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppTopbar } from '@/components/AppTopbar';
import { ThaiDatePicker } from '@/components/ui/ThaiDatePicker';
import { PartnerPicker } from '@/components/ui/PartnerPicker';
import { ProductPicker } from '@/components/ui/ProductPicker';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { computeTotals, lineTotal } from '@/lib/quotation-totals';
import { formatThaiDate, localDateString, numberToThaiBahtText } from '@/lib/format';
import type { ProductType } from '@hj/shared-types';
import type { DocTypeMeta } from './doc-type-meta';

interface ItemRow {
  productId?: string;
  productCode?: string;
  productType?: ProductType;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatable: boolean;
}

const emptyRow = (): ItemRow => ({
  description: '',
  unit: 'รายการ',
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  vatable: true,
});

interface CompanySnapshot {
  vatEffectiveDate: string | null;
}

export interface SalesDocumentInitial {
  id: string;
  customer: {
    id: string;
    nameTh: string;
    address: string | null;
    taxId: string | null;
    branch: string | null;
  };
  documentDate: string;
  dueDate: string | null;
  reference: string | null;
  note: string | null;
  vatRate: string;
  whtRate: string;
  items: Array<{
    productId: string | null;
    productCode: string | null;
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    vatable: boolean;
  }>;
}

export function SalesDocumentForm({
  meta,
  initial,
}: {
  meta: DocTypeMeta;
  initial?: SalesDocumentInitial;
}) {
  const router = useRouter();
  const toast = useToast();
  const mode: 'create' | 'edit' = initial ? 'edit' : 'create';

  const [customer, setCustomer] = useState<any>(
    initial
      ? {
          id: initial.customer.id,
          nameTh: initial.customer.nameTh,
          address: initial.customer.address,
          taxId: initial.customer.taxId,
          branch: initial.customer.branch,
        }
      : null,
  );
  const [documentDate, setDocumentDate] = useState(
    initial
      ? initial.documentDate.slice(0, 10)
      : localDateString(),
  );
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? '');
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [vatRate, setVatRate] = useState(initial ? Number(initial.vatRate) : 7);
  const [whtRate, setWhtRate] = useState(initial ? Number(initial.whtRate) : 0);
  const [items, setItems] = useState<ItemRow[]>(
    initial
      ? initial.items.map((it) => ({
          productId: it.productId ?? undefined,
          productCode: it.productCode ?? undefined,
          description: it.description,
          unit: it.unit,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          discount: Number(it.discount),
          vatable: it.vatable,
        }))
      : [emptyRow()],
  );
  const [previewNumber, setPreviewNumber] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanySnapshot | null>(null);
  const isFirstItemsRender = useRef(true);

  useEffect(() => {
    if (!meta.requireCustomerTaxId) return;
    api<CompanySnapshot>('/company')
      .then((c) => setCompany({ vatEffectiveDate: c.vatEffectiveDate }))
      .catch(() => setCompany(null));
  }, [meta.requireCustomerTaxId]);

  useEffect(() => {
    if (!documentDate) return;
    // In edit mode the document already has a placeholder DRAFT- number; the
    // preview is only meaningful before first confirm. Skip the peek call.
    if (mode === 'edit') return;
    api<{ number: string }>('/numbering/peek', {
      method: 'POST',
      body: JSON.stringify({
        type: meta.type,
        documentDate: new Date(documentDate + 'T00:00:00+07:00').toISOString(),
      }),
    })
      .then((r) => setPreviewNumber(r.number))
      .catch(() => setPreviewNumber(null));
  }, [documentDate, meta.type, mode]);

  // Auto-suggest WHT based on item types.
  // Rules: SERVICE items → 3%, goods only → 0%.
  // Only applies when the current rate is the "standard" 0% or 3% — custom rates are left alone.
  // Skips the first render so existing documents keep their saved whtRate.
  // The customer's configured defaultWhtRate takes priority: when the selected
  // customer has one set, the SERVICE-based suggestion never overrides it
  // (the rate is applied in applyCustomer instead).
  useEffect(() => {
    if (isFirstItemsRender.current) {
      isFirstItemsRender.current = false;
      return;
    }
    if (customer?.defaultWhtRate != null && customer.defaultWhtRate !== '') return;
    const hasService = items.some((it) => it.productType === 'SERVICE');
    const suggested = hasService ? 3 : 0;
    setWhtRate((prev) => (prev === 0 || prev === 3 ? suggested : prev));
  }, [items, customer]);

  const totals = useMemo(() => computeTotals(items, vatRate, whtRate), [items, vatRate, whtRate]);

  const customerTaxIdMissing = !!customer && meta.requireCustomerTaxId && !customer.taxId?.trim();
  const docDateBeforeVat =
    meta.requireCustomerTaxId &&
    company?.vatEffectiveDate &&
    new Date(documentDate + 'T00:00:00+07:00') < new Date(company.vatEffectiveDate);

  function addRow() {
    setItems((prev) => [...prev, emptyRow()]);
  }
  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function applyProduct(idx: number, p: any) {
    updateRow(idx, {
      productId: p.id,
      productCode: p.code ?? undefined,
      productType: p.type,
      description: p.nameTh,
      unit: p.unit,
      unitPrice: Number(p.unitPrice),
      vatable: p.vatable,
    });
  }
  function applyCustomer(c: any) {
    setCustomer(c);
    // The customer's configured default WHT takes priority over the
    // SERVICE-based auto-suggestion. Apply it immediately on selection.
    if (c?.defaultWhtRate != null && c.defaultWhtRate !== '') {
      setWhtRate(Number(c.defaultWhtRate));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customer) {
      setError('กรุณาเลือกลูกค้า');
      return;
    }
    if (customerTaxIdMissing) {
      setError(
        'ลูกค้านี้ยังไม่มีเลขประจำตัวผู้เสียภาษี — แก้ไขข้อมูลลูกค้าก่อนออก' + meta.shortTitle,
      );
      return;
    }
    if (docDateBeforeVat) {
      setError(
        `วันที่เอกสารต้องไม่ก่อนวันที่ VAT มีผล (${formatThaiDate(company!.vatEffectiveDate!)})`,
      );
      return;
    }
    if (items.length === 0 || items.every((it) => !it.description.trim())) {
      setError('กรุณากรอกรายการอย่างน้อย 1 รายการ');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        customerId: customer.id,
        documentDate: new Date(documentDate + 'T00:00:00+07:00').toISOString(),
        dueDate: dueDate ? new Date(dueDate + 'T00:00:00+07:00').toISOString() : undefined,
        reference: reference || undefined,
        note: note || undefined,
        vatRate,
        whtRate,
        items: items
          .filter((it) => it.description.trim() && it.quantity > 0)
          .map((it) => ({
            productId: it.productId || undefined,
            productCode: it.productCode || undefined,
            description: it.description,
            unit: it.unit,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount || undefined,
            vatable: it.vatable,
          })),
      };
      if (mode === 'edit' && initial) {
        await api(`${meta.apiBase}/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success(`บันทึกการแก้ไข${meta.shortTitle}แล้ว`);
        router.push(`${meta.listHref}/${initial.id}` as any);
      } else {
        const created = await api<{ id: string }>(meta.apiBase, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`สร้าง${meta.shortTitle}แล้ว (DRAFT)`);
        router.push(`${meta.listHref}/${created.id}` as any);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const titlePrefix = mode === 'edit' ? 'แก้ไข' : 'สร้าง';
  const cancelHref =
    mode === 'edit' && initial ? `${meta.listHref}/${initial.id}` : meta.listHref;
  const submitLabel = mode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกเป็น DRAFT';

  return (
    <>
      <AppTopbar title={titlePrefix + meta.shortTitle} />
      <form onSubmit={onSubmit} className="flex-1 px-7 pb-16 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {titlePrefix}
              {meta.title}
            </h1>
            <p className="mt-1 text-[13px] text-text-mute">
              {mode === 'edit'
                ? 'แก้ได้เฉพาะเอกสารฉบับร่าง — เมื่อยืนยันออกเลขจริงแล้วจะแก้ไม่ได้'
                : 'เลขที่ตัวอย่างเมื่อยืนยัน: '}
              {mode === 'create' && (
                <span className="font-mono font-medium text-text">{previewNumber ?? '—'}</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={cancelHref as any}
              className="rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] text-text-soft hover:bg-surface-3"
            >
              ยกเลิก
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
            >
              {submitting ? 'กำลังบันทึก…' : submitLabel}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-bad/40 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <h3 className="mb-3 text-[13px] font-semibold text-text-soft">ข้อมูลเอกสาร</h3>
              <div className="grid gap-3">
                <div>
                  <label className="mb-1 block text-[12px] text-text-soft">
                    ลูกค้า <span className="text-bad">*</span>
                  </label>
                  <PartnerPicker
                    type="CUSTOMER"
                    value={customer}
                    onChange={applyCustomer}
                    requireTaxId={meta.requireCustomerTaxId}
                  />
                  {customer?.taxId && (
                    <div className="mt-1 font-mono text-[11.5px] text-text-mute">
                      เลขผู้เสียภาษี: {customer.taxId}
                    </div>
                  )}
                  {customerTaxIdMissing && (
                    <div className="mt-1 text-[11.5px] text-bad">
                      ลูกค้านี้ยังไม่มีเลขประจำตัวผู้เสียภาษี — แก้ไขในหน้าลูกค้าก่อนออก{meta.shortTitle}
                    </div>
                  )}
                  {customer?.address && (
                    <div className="mt-0.5 text-[11.5px] text-text-mute">{customer.address}</div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[12px] text-text-soft">
                      วันที่เอกสาร <span className="text-bad">*</span>
                    </label>
                    <ThaiDatePicker
                      value={documentDate}
                      onChange={setDocumentDate}
                      required
                    />
                    {meta.requireCustomerTaxId && company?.vatEffectiveDate && (
                      <span className="mt-1 block text-[11px] text-warn">
                        ออกได้ตั้งแต่ {formatThaiDate(company.vatEffectiveDate)}
                      </span>
                    )}
                  </div>
                  <Field label="กำหนดยืนราคาถึง">
                    <ThaiDatePicker value={dueDate} onChange={setDueDate} placeholder="เลือกวันหมดอายุ" />
                  </Field>
                  <Field label="อ้างอิง">
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className={inputCls}
                      maxLength={100}
                    />
                  </Field>
                </div>
                <Field label="หมายเหตุ">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className={inputCls}
                    maxLength={2000}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-text-soft">รายการ</h3>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-[12.5px] text-brand hover:underline"
                >
                  + เพิ่มแถว
                </button>
              </div>
              <div className="overflow-x-auto lg:overflow-x-visible">
                <table className="w-full min-w-[800px] text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-left text-text-soft">
                      <th className="px-2 py-2 font-medium">#</th>
                      <th className="px-2 py-2 font-medium">รายการ</th>
                      <th className="px-2 py-2 font-medium">หน่วย</th>
                      <th className="px-2 py-2 text-right font-medium">จำนวน</th>
                      <th className="px-2 py-2 text-right font-medium">ราคา</th>
                      <th className="px-2 py-2 text-right font-medium">ส่วนลด</th>
                      <th className="px-2 py-2 font-medium">VAT</th>
                      <th className="px-2 py-2 text-right font-medium">รวม</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-b border-border align-top">
                        <td className="px-2 py-2 text-text-mute">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <ProductPicker
                            value={
                              it.productId
                                ? ({
                                    id: it.productId,
                                    code: it.productCode ?? null,
                                    nameTh: it.description,
                                    type: it.productType ?? 'SERVICE',
                                    unit: it.unit,
                                    unitPrice: String(it.unitPrice),
                                    vatable: it.vatable,
                                    description: null,
                                  } as any)
                                : null
                            }
                            onChange={(p) => p && applyProduct(idx, p)}
                          />
                          <textarea
                            placeholder="หรือกรอกคำอธิบายเอง"
                            value={it.description}
                            onChange={(e) => updateRow(idx, { description: e.target.value })}
                            rows={2}
                            className={`${inputCls} mt-1.5`}
                            maxLength={2000}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={it.unit}
                            onChange={(e) => updateRow(idx, { unit: e.target.value })}
                            className={`${inputCls} w-20`}
                            maxLength={32}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={it.quantity}
                            onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })}
                            className={`${inputCls} w-24 text-right font-mono`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.unitPrice}
                            onChange={(e) => updateRow(idx, { unitPrice: Number(e.target.value) })}
                            className={`${inputCls} w-28 text-right font-mono`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.discount}
                            onChange={(e) => updateRow(idx, { discount: Number(e.target.value) })}
                            className={`${inputCls} w-24 text-right font-mono`}
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={it.vatable}
                            onChange={(e) => updateRow(idx, { vatable: e.target.checked })}
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {lineTotal(it).toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            disabled={items.length === 1}
                            className="text-[11.5px] text-bad hover:underline disabled:opacity-30"
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-20">
              <h3 className="mb-3 text-[13px] font-semibold text-text-soft">สรุปยอด</h3>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Field label="VAT %">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={vatRate}
                    onChange={(e) => setVatRate(Number(e.target.value))}
                    className={`${inputCls} font-mono`}
                  />
                </Field>
                <Field label={<span>WHT % <span className="text-[10px] font-normal text-text-mute">(อัตโนมัติ)</span></span>}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={whtRate}
                    onChange={(e) => setWhtRate(Number(e.target.value))}
                    className={`${inputCls} font-mono`}
                  />
                </Field>
              </div>
              <SummaryRow label="รวมเงิน" value={totals.subtotal} />
              <SummaryRow label={`VAT ${vatRate}%`} value={totals.vatAmount} />
              <SummaryRow label="รวมหลัง VAT" value={totals.totalAfterVat} bold />
              <SummaryRow label={`หัก ณ ที่จ่าย ${whtRate}%`} value={totals.whtAmount} muted />
              <div className="my-2 border-t border-border" />
              <SummaryRow label="ยอดเงินสุทธิ" value={totals.netReceived} bold large />
              <div className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-[11.5px] text-text-mute">
                ({numberToThaiBahtText(totals.netReceived)})
              </div>
            </div>
          </aside>
        </div>
      </form>
    </>
  );
}

const inputCls =
  'w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-brand';

function Field({
  label,
  required,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-text-soft">
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </span>
      {children}
    </label>
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
  value: number;
  bold?: boolean;
  large?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${large ? 'text-[15px]' : 'text-[13px]'} ${
        bold ? 'font-semibold' : ''
      } ${muted ? 'text-text-mute' : ''}`}
    >
      <span>{label}</span>
      <Money value={value} symbol={false} />
    </div>
  );
}
