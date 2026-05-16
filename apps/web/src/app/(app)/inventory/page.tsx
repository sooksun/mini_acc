'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { InventoryMovementType, ProductType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ProductPicker } from '@/components/ui/ProductPicker';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort } from '@/lib/format';

interface ProductLite {
  id: string;
  code: string | null;
  nameTh: string;
  unit: string;
  type: ProductType;
  unitPrice: string;
  // Fields required by ProductPicker — we don't use them here but the picker types demand them.
  vatable: boolean;
  description: string | null;
}

interface StockRow {
  productId: string;
  code: string | null;
  nameTh: string;
  unit: string;
  type: ProductType;
  unitPrice: string;
  onHand: string;
  stockValue: string;
}

interface MovementRow {
  id: string;
  productId: string;
  type: InventoryMovementType;
  quantity: string;
  movementDate: string;
  unitCost: string | null;
  totalCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  product: { id: string; code: string | null; nameTh: string; unit: string };
}

const TYPE_META: Record<InventoryMovementType, { label: string; tone: string }> = {
  IN: { label: 'รับเข้า', tone: 'border-ok/40 bg-ok/10 text-ok' },
  OUT: { label: 'จ่ายออก', tone: 'border-warn/40 bg-warn/10 text-warn' },
  ADJUST: { label: 'ปรับยอด', tone: 'border-info/40 bg-info/10 text-info' },
  RETURN_IN: { label: 'รับคืน', tone: 'border-ok/40 bg-ok/10 text-ok' },
  RETURN_OUT: { label: 'ส่งคืน', tone: 'border-warn/40 bg-warn/10 text-warn' },
  OPENING_BALANCE: { label: 'ยอดยกมา', tone: 'border-text-mute/40 bg-surface-3 text-text-soft' },
};

export default function InventoryPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const role = getUser()?.role;
  const canCreate = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        api<StockRow[]>('/inventory/stock-summary'),
        api<{ items: MovementRow[]; total: number }>('/inventory/movements?take=200'),
      ]);
      setStock(s);
      setMovements(m.items);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูลสินค้าล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalProducts = stock.length;
  const totalValue = stock.reduce((s, r) => s + Number(r.stockValue), 0);
  const negativeStock = stock.filter((r) => Number(r.onHand) < 0).length;

  const stockColumns: DataTableColumn<StockRow>[] = [
    {
      key: 'product',
      header: 'สินค้า',
      render: (r) => (
        <div>
          <div className="font-medium text-text">{r.nameTh}</div>
          <div className="font-mono text-[11px] text-text-mute">{r.code ?? '—'}</div>
        </div>
      ),
    },
    { key: 'type', header: 'ประเภท', render: (r) => r.type === 'GOOD' ? 'สินค้า' : 'วัสดุ' },
    { key: 'unit', header: 'หน่วย', render: (r) => r.unit },
    {
      key: 'onHand',
      header: 'คงเหลือ',
      align: 'right',
      numeric: true,
      render: (r) => {
        const n = Number(r.onHand);
        return (
          <span className={n < 0 ? 'text-bad font-medium' : n === 0 ? 'text-text-mute' : ''}>
            {n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
          </span>
        );
      },
    },
    {
      key: 'unitPrice',
      header: 'ราคา/หน่วย',
      align: 'right',
      numeric: true,
      render: (r) => formatThaiCurrency(r.unitPrice),
    },
    {
      key: 'stockValue',
      header: 'มูลค่าสต็อก',
      align: 'right',
      numeric: true,
      render: (r) => formatThaiCurrency(r.stockValue),
    },
  ];

  const movementColumns: DataTableColumn<MovementRow>[] = [
    {
      key: 'date',
      header: 'วันที่',
      render: (m) => formatThaiDateShort(m.movementDate),
    },
    {
      key: 'product',
      header: 'สินค้า',
      render: (m) => (
        <div>
          <div className="text-text">{m.product.nameTh}</div>
          <div className="font-mono text-[11px] text-text-mute">{m.product.code ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'ประเภท',
      render: (m) => (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${TYPE_META[m.type].tone}`}>
          {TYPE_META[m.type].label}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'จำนวน',
      align: 'right',
      numeric: true,
      render: (m) => `${Number(m.quantity).toLocaleString('th-TH', { maximumFractionDigits: 4 })} ${m.product.unit}`,
    },
    {
      key: 'unitCost',
      header: 'ต้นทุน/หน่วย',
      align: 'right',
      numeric: true,
      render: (m) => (m.unitCost ? formatThaiCurrency(m.unitCost) : '—'),
    },
    {
      key: 'note',
      header: 'หมายเหตุ',
      render: (m) => m.note ?? '—',
    },
  ];

  return (
    <>
      <AppTopbar title="คลังสินค้า" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">คลังสินค้า</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              จัดการสต็อกและบันทึกการเคลื่อนไหวสินค้า — ระบบบล็อกการจ่ายออกหากสต็อกไม่พอ
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + บันทึกการเคลื่อนไหว
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatCard label="จำนวนสินค้า" value={String(totalProducts)} />
          <StatCard label="มูลค่าสต็อกรวม" value={formatThaiCurrency(totalValue)} tone="info" />
          <StatCard
            label="สต็อกติดลบ"
            value={String(negativeStock)}
            tone={negativeStock > 0 ? 'bad' : 'ok'}
          />
        </div>

        <div className="mt-5 flex gap-2 border-b border-border">
          {(['stock', 'movements'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium ${
                tab === t ? 'border-brand text-brand' : 'border-transparent text-text-soft hover:text-text'
              }`}
            >
              {t === 'stock' ? 'สรุปสต็อก' : 'การเคลื่อนไหว'}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'stock' ? (
            <DataTable
              columns={stockColumns}
              rows={stock}
              rowKey={(r) => r.productId}
              loading={loading}
              emptyTitle="ยังไม่มีสินค้าประเภท GOOD/MATERIAL"
              emptyDescription="เพิ่มสินค้าที่หน้า /products แล้วบันทึก OPENING_BALANCE ที่นี่"
            />
          ) : (
            <DataTable
              columns={movementColumns}
              rows={movements}
              rowKey={(m) => m.id}
              loading={loading}
              emptyTitle="ยังไม่มีการเคลื่อนไหว"
            />
          )}
        </div>
      </div>

      <CreateMovementModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />
    </>
  );
}

function CreateMovementModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [product, setProduct] = useState<ProductLite | null>(null);
  const [type, setType] = useState<InventoryMovementType>('IN');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [movementDate, setMovementDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProduct(null);
      setType('IN');
      setQuantity('');
      setUnitCost('');
      setMovementDate(new Date().toISOString().slice(0, 10));
      setNote('');
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) {
      toast.error('กรุณาเลือกสินค้า');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast.error('quantity ต้อง > 0');
      return;
    }
    setSaving(true);
    try {
      await api('/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          type,
          quantity,
          movementDate,
          unitCost: unitCost || undefined,
          note: note.trim() || undefined,
        }),
      });
      toast.success('บันทึกการเคลื่อนไหวแล้ว');
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
      title="บันทึกการเคลื่อนไหวสินค้า"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="create-movement-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="create-movement-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">สินค้า</span>
          <ProductPicker value={product} onChange={setProduct} placeholder="ค้นหาและเลือกสินค้า" />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">ประเภทการเคลื่อนไหว</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as InventoryMovementType)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          >
            {Object.entries(TYPE_META).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">วันที่</span>
          <input
            type="date"
            value={movementDate}
            onChange={(e) => setMovementDate(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">
            จำนวน{product ? ` (${product.unit})` : ''}
          </span>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-right font-mono text-[14px] outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">ต้นทุน/หน่วย (บาท) — optional</span>
          <input
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-right font-mono text-[14px] outline-none focus:border-brand"
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

        {type === 'OUT' || type === 'RETURN_OUT' ? (
          <div className="md:col-span-2 rounded-md border border-warn/30 bg-warn/5 p-2 text-[12px] text-warn">
            ระบบจะตรวจสอบสต็อก — ปฏิเสธหากจะทำให้สต็อกติดลบ
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
