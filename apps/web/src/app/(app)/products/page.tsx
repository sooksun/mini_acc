'use client';

import { useEffect, useState } from 'react';
import type { ProductType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Empty';
import { ProductTypeBadge } from '@/components/ui/ProductTypeBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { ProductForm } from '@/features/products/ProductForm';

interface Product {
  id: string;
  code: string | null;
  nameTh: string;
  type: ProductType;
  unit: string;
  unitPrice: string;
  vatable: boolean;
  isActive: boolean;
}

export default function ProductsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ProductType | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const role = getUser()?.role;
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const canDeactivate = role === 'OWNER';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (!showInactive) params.set('isActive', 'true');
      if (search) params.set('search', search);
      params.set('take', '100');
      const res = await api<{ items: Product[]; total: number }>(`/products?${params.toString()}`);
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type, showInactive]);

  async function handleDeactivate(id: string) {
    try {
      await api(`/products/${id}/deactivate`, { method: 'POST' });
      toast.success('ปิดการใช้งานแล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeactivateId(null);
    }
  }

  return (
    <>
      <AppTopbar title="สินค้า / บริการ" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">สินค้า / บริการ</h1>
            <p className="mt-1 text-[13px] text-text-mute">รายการที่ใช้กรอกในเอกสารขายและรายจ่าย</p>
          </div>
          {canEdit && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + เพิ่มรายการใหม่
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส"
            className="w-72 rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ProductType | '')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          >
            <option value="">ทุกประเภท</option>
            <option value="SERVICE">บริการ</option>
            <option value="GOOD">สินค้า</option>
            <option value="MATERIAL">วัสดุ</option>
            <option value="ASSET">ทรัพย์สิน</option>
          </select>
          <label className="inline-flex items-center gap-2 text-[13px] text-text-soft">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            แสดงที่ปิดการใช้งานด้วย
          </label>
          <span className="ml-auto text-[12.5px] text-text-mute">{total} รายการ</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-4 py-3 font-medium">รหัส</th>
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">ประเภท</th>
                <th className="px-4 py-3 font-medium">หน่วย</th>
                <th className="px-4 py-3 text-right font-medium">ราคา/หน่วย</th>
                <th className="px-4 py-3 font-medium">VAT</th>
                <th className="px-4 py-3 text-right font-medium">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10">
                    <Empty
                      title={search ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีข้อมูล'}
                      description={search ? 'ลองค้นหาด้วยคำอื่น' : 'เริ่มจากการเพิ่มรายการแรก'}
                    />
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id} className={`border-t border-border ${!p.isActive ? 'text-text-mute' : ''}`}>
                    <td className="px-4 py-3 font-mono text-[12px]">{p.code ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.nameTh}</div>
                      {!p.isActive && <div className="text-[11px] text-bad">ปิดการใช้งาน</div>}
                    </td>
                    <td className="px-4 py-3"><ProductTypeBadge type={p.type} /></td>
                    <td className="px-4 py-3 text-text-soft">{p.unit}</td>
                    <td className="px-4 py-3 text-right"><Money value={p.unitPrice} symbol={false} /></td>
                    <td className="px-4 py-3 text-text-soft">{p.vatable ? '7%' : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <button
                            onClick={() => {
                              setEditingId(p.id);
                              setFormOpen(true);
                            }}
                            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
                          >
                            แก้ไข
                          </button>
                        )}
                        {canDeactivate && p.isActive && (
                          <button
                            onClick={() => setDeactivateId(p.id)}
                            className="rounded-md border border-bad/30 bg-bad/5 px-2.5 py-1 text-[12px] text-bad hover:bg-bad/10"
                          >
                            ปิดใช้
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
        productId={editingId}
      />

      <ConfirmDialog
        open={!!deactivateId}
        title="ปิดการใช้งานรายการนี้?"
        description="รายการที่ปิดใช้งานจะไม่ปรากฏใน picker ตอนสร้างเอกสาร"
        confirmLabel="ปิดการใช้งาน"
        destructive
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (deactivateId) return handleDeactivate(deactivateId);
        }}
      />
    </>
  );
}
