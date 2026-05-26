'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { PartnerPicker } from '@/components/ui/PartnerPicker';
import { ThaiDatePicker } from '@/components/ui/ThaiDatePicker';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { localDateString } from '@/lib/format';

interface ProposedItem {
  tempId: string;
  sourceFile: string;
  description: string;
  unit: string;
  quantity: number;
  purchaseUnitPrice: number;
  suggestedSellPrice: number;
  match: {
    status: 'EXISTING' | 'NEW';
    productId?: string;
    productName?: string;
    productUnitPrice?: number;
    confidence: number;
  };
}

interface ExtractResult {
  markupPercent: number;
  mocked: boolean;
  files: { name: string; items: number; mocked: boolean }[];
  items: ProposedItem[];
}

interface Row {
  tempId: string;
  sourceFile: string;
  decision: 'EXISTING' | 'NEW';
  productId?: string;
  productName?: string;
  matchConfidence: number;
  nameTh: string;
  unit: string;
  quantity: string;
  purchasePrice: string;
  sellPrice: string;
  productType: ProductType;
  vatable: boolean;
}

const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  GOOD: 'สินค้า',
  SERVICE: 'บริการ',
  MATERIAL: 'วัสดุ',
  ASSET: 'ทรัพย์สิน',
};

let blankSeq = 0;

export default function QuotationFromReceiptsPage() {
  const router = useRouter();
  const toast = useToast();

  const [phase, setPhase] = useState<'upload' | 'review'>('upload');
  const [customer, setCustomer] = useState<{ id: string; nameTh: string } | null>(null);
  const [documentDate, setDocumentDate] = useState(localDateString());
  const [markup, setMarkup] = useState('15');
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mocked, setMocked] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // Prefill markup from the company default config.
  useEffect(() => {
    api<{ defaultMarkupPercent: number }>('/company')
      .then((c) => setMarkup(String(c.defaultMarkupPercent)))
      .catch(() => undefined);
  }, []);

  async function onExtract() {
    if (files.length === 0) {
      toast.error('กรุณาเลือกไฟล์ใบเสร็จอย่างน้อย 1 ไฟล์');
      return;
    }
    setExtracting(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      if (markup !== '') fd.append('markupPercent', markup);
      const res = await api<ExtractResult>('/sales/from-receipts/extract', {
        method: 'POST',
        body: fd,
      });
      setMocked(res.mocked);
      setRows(
        res.items.map((it) => ({
          tempId: it.tempId,
          sourceFile: it.sourceFile,
          decision: it.match.status,
          productId: it.match.productId,
          productName: it.match.productName,
          matchConfidence: it.match.confidence,
          nameTh: it.description,
          unit: it.unit,
          quantity: String(it.quantity),
          purchasePrice: String(it.purchaseUnitPrice),
          sellPrice: String(
            it.match.status === 'EXISTING' && it.match.productUnitPrice != null
              ? it.match.productUnitPrice
              : it.suggestedSellPrice,
          ),
          productType: 'GOOD',
          vatable: true,
        })),
      );
      setPhase('review');
      if (res.items.length === 0) {
        toast.info('AI ไม่พบรายการสินค้า — เพิ่มรายการเองได้ด้านล่าง');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'ประมวลผลไม่สำเร็จ');
    } finally {
      setExtracting(false);
    }
  }

  function updateRow(tempId: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  }

  function removeRow(tempId: string) {
    setRows((rs) => rs.filter((r) => r.tempId !== tempId));
  }

  function addBlankRow() {
    setRows((rs) => [
      ...rs,
      {
        tempId: `blank-${++blankSeq}`,
        sourceFile: '—',
        decision: 'NEW',
        matchConfidence: 0,
        nameTh: '',
        unit: 'ชิ้น',
        quantity: '1',
        purchasePrice: '0',
        sellPrice: '0',
        productType: 'GOOD',
        vatable: true,
      },
    ]);
  }

  async function onCreate() {
    if (!customer) {
      toast.error('กรุณาเลือกลูกค้า');
      return;
    }
    if (rows.length === 0) {
      toast.error('ต้องมีรายการอย่างน้อย 1 รายการ');
      return;
    }
    for (const r of rows) {
      if (!r.nameTh.trim() || !r.unit.trim()) {
        toast.error('ทุกรายการต้องมีชื่อสินค้าและหน่วย');
        return;
      }
      if (r.decision === 'EXISTING' && !r.productId) {
        toast.error(`รายการ "${r.nameTh}" ตั้งเป็น "ซ้ำ" แต่ไม่มีสินค้าอ้างอิง — เปลี่ยนเป็น "ใหม่"`);
        return;
      }
    }

    setCreating(true);
    try {
      const created = await api<{ id: string }>('/sales/from-receipts/quotation', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          documentDate,
          items: rows.map((r) => ({
            decision: r.decision,
            productId: r.decision === 'EXISTING' ? r.productId : undefined,
            nameTh: r.nameTh.trim(),
            unit: r.unit.trim(),
            quantity: Number(r.quantity) || 0,
            unitPrice: Number(r.sellPrice) || 0,
            productType: r.decision === 'NEW' ? r.productType : undefined,
            vatable: r.vatable,
          })),
        }),
      });
      toast.success('สร้างใบเสนอราคา (ฉบับร่าง) แล้ว');
      router.push(`/sales/quotations/${created.id}/edit` as any);
    } catch (e: any) {
      toast.error(e.message ?? 'สร้างใบเสนอราคาไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  }

  const newCount = rows.filter((r) => r.decision === 'NEW').length;
  const existingCount = rows.length - newCount;

  return (
    <>
      <AppTopbar title="ใบเสนอราคาจากใบเสร็จซื้อ" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">สร้างใบเสนอราคาจากใบเสร็จซื้อ</h1>
          <p className="mt-1 text-[13px] text-text-mute">
            อัปโหลดใบเสร็จที่ซื้อสินค้ามา → AI ดึงรายการ → ตรวจ/ยืนยัน → สร้างใบเสนอราคาฉบับร่าง
          </p>
        </div>

        {/* Step 1 — upload */}
        <div className="mt-6 grid max-w-4xl gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[13px] text-text-mute">ลูกค้า *</label>
              <PartnerPicker type="CUSTOMER" value={customer as any} onChange={(p) => setCustomer(p)} placeholder="เลือกลูกค้า" />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-text-mute">วันที่เอกสาร *</label>
              <ThaiDatePicker value={documentDate} onChange={setDocumentDate} />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-text-mute">Markup (%)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                disabled={phase === 'review'}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-60"
              />
            </div>
          </div>

          {phase === 'upload' && (
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-[13px] text-text-mute">ไฟล์ใบเสร็จ (เลือกได้หลายไฟล์ · PDF/รูปภาพ)</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-[13px] text-text-soft file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-4 file:py-2 file:text-[13px] file:text-text"
                />
                {files.length > 0 && (
                  <p className="mt-1 text-[12px] text-text-mute">เลือกแล้ว {files.length} ไฟล์</p>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={onExtract}
                  disabled={extracting || files.length === 0}
                  className="rounded-md bg-brand-gradient px-5 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
                >
                  {extracting ? 'กำลังประมวลผล…' : 'ประมวลผลด้วย AI'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Step 2 — review */}
        {phase === 'review' && (
          <div className="mt-6 max-w-6xl">
            {mocked && (
              <div className="mb-3 rounded-md border border-warn/40 bg-warn/5 px-4 py-2.5 text-[13px] text-warn">
                AI ทำงานในโหมด mock (ไม่ได้ตั้งค่า OPENROUTER_API_KEY) — รายการอาจไม่ครบ กรุณาตรวจและกรอกเอง
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13px] text-text-soft">
                {rows.length} รายการ · <span className="text-ok">ใหม่ {newCount}</span> ·{' '}
                <span className="text-text-mute">ซ้ำของเดิม {existingCount}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase('upload')}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text-soft hover:bg-surface-3"
                >
                  ← กลับไปอัปโหลด
                </button>
                <button
                  onClick={addBlankRow}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text-soft hover:bg-surface-3"
                >
                  + เพิ่มรายการ
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[920px] text-[13px]">
                <thead className="bg-surface-2 text-left text-text-soft">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">ชื่อสินค้า</th>
                    <th className="px-3 py-2.5 font-medium">หน่วย</th>
                    <th className="px-3 py-2.5 text-right font-medium">จำนวน</th>
                    <th className="px-3 py-2.5 text-right font-medium">ราคาซื้อ/หน่วย</th>
                    <th className="px-3 py-2.5 text-right font-medium">ราคาขาย/หน่วย</th>
                    <th className="px-3 py-2.5 font-medium">บันทึกเป็น</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-text-mute">
                        ไม่มีรายการ — กด “+ เพิ่มรายการ”
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.tempId} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <input
                            value={r.nameTh}
                            onChange={(e) => updateRow(r.tempId, { nameTh: e.target.value })}
                            className="w-full min-w-[180px] rounded-md border border-border bg-surface-2 px-2 py-1.5 outline-none focus:border-brand"
                          />
                          {r.sourceFile !== '—' && (
                            <div className="mt-0.5 truncate text-[11px] text-text-mute">{r.sourceFile}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={r.unit}
                            onChange={(e) => updateRow(r.tempId, { unit: e.target.value })}
                            className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1.5 outline-none focus:border-brand"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            value={r.quantity}
                            onChange={(e) => updateRow(r.tempId, { quantity: e.target.value })}
                            className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right outline-none focus:border-brand"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={r.purchasePrice}
                            onChange={(e) => updateRow(r.tempId, { purchasePrice: e.target.value })}
                            className="w-28 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right text-text-mute outline-none focus:border-brand"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={r.sellPrice}
                            onChange={(e) => updateRow(r.tempId, { sellPrice: e.target.value })}
                            className="w-28 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right font-medium outline-none focus:border-brand"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={r.decision}
                            onChange={(e) =>
                              updateRow(r.tempId, { decision: e.target.value as Row['decision'] })
                            }
                            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 outline-none focus:border-brand"
                          >
                            <option value="NEW">สินค้าใหม่</option>
                            <option value="EXISTING" disabled={!r.productId}>
                              ซ้ำของเดิม
                            </option>
                          </select>
                          {r.decision === 'EXISTING' && r.productName ? (
                            <div className="mt-1 text-[11px] text-text-mute">
                              → {r.productName}
                              <span className="ml-1 text-brand">
                                ({Math.round(r.matchConfidence * 100)}%)
                              </span>
                            </div>
                          ) : (
                            <select
                              value={r.productType}
                              onChange={(e) =>
                                updateRow(r.tempId, { productType: e.target.value as ProductType })
                              }
                              className="mt-1 block rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] outline-none focus:border-brand"
                            >
                              {(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map((t) => (
                                <option key={t} value={t}>
                                  {PRODUCT_TYPE_LABEL[t]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeRow(r.tempId)}
                            className="rounded-md px-2 py-1 text-[12px] text-bad hover:bg-bad/10"
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={onCreate}
                disabled={creating || rows.length === 0 || !customer}
                className="rounded-md bg-brand-gradient px-5 py-2.5 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
              >
                {creating ? 'กำลังสร้าง…' : 'สร้างใบเสนอราคา (ฉบับร่าง)'}
              </button>
            </div>
          </div>
        )}

        {extracting && (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-text-mute">
            <Spinner /> กำลังให้ AI อ่านใบเสร็จ…
          </div>
        )}
      </div>
    </>
  );
}
