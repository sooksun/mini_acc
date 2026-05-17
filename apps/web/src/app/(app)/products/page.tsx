'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ProductType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Empty';
import { Modal } from '@/components/ui/Modal';
import { ProductTypeBadge } from '@/components/ui/ProductTypeBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';
import { api, apiBlob } from '@/lib/api';
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
  const [importOpen, setImportOpen] = useState(false);

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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    const blob = await apiBlob('/products/import/template');
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'products-import-template.xlsx';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 30_000);
                  } catch (e: any) {
                    toast.error('ดาวน์โหลด template ไม่สำเร็จ: ' + e.message);
                  }
                }}
                className="rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] text-text-soft hover:bg-surface-3"
              >
                ดาวน์โหลด Template
              </button>
              <button
                onClick={() => setImportOpen(true)}
                className="rounded-md border border-brand/40 bg-brand/5 px-3.5 py-2 text-[13px] font-medium text-brand hover:bg-brand/10"
              >
                นำเข้า Excel
              </button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setFormOpen(true);
                }}
                className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
              >
                + เพิ่มรายการใหม่
              </button>
            </div>
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

      <ImportProductsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          setImportOpen(false);
          load();
        }}
      />
    </>
  );
}

interface ImportRowResult {
  row: number;
  status: 'created' | 'skipped' | 'error';
  code?: string;
  nameTh?: string;
  message?: string;
}

interface ImportResult {
  totalRows: number;
  created: number;
  skipped: number;
  errors: number;
  details: ImportRowResult[];
}

function ImportProductsModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error('กรุณาเลือกไฟล์ .xlsx');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api<ImportResult>('/products/import', {
        method: 'POST',
        body: fd,
      });
      setResult(res);
      if (res.errors === 0) {
        toast.success(`นำเข้าสำเร็จ ${res.created} รายการ`);
      } else {
        toast.info(`สร้าง ${res.created} / ผิดพลาด ${res.errors} แถว — ตรวจรายการด้านล่าง`);
      }
    } catch (e: any) {
      toast.error('นำเข้าไม่สำเร็จ: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  function close() {
    if (result && result.created > 0) onDone();
    else onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="นำเข้าสินค้า/บริการจาก Excel"
      size="lg"
      footer={
        result ? (
          <button
            type="button"
            onClick={close}
            className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
          >
            เสร็จสิ้น
          </button>
        ) : (
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
              form="import-products-form"
              disabled={uploading || !file}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-60"
            >
              {uploading ? 'กำลังนำเข้า…' : 'นำเข้า'}
            </button>
          </>
        )
      }
    >
      {!result && (
        <form id="import-products-form" onSubmit={submit} className="space-y-4">
          <div className="rounded-md border border-brand/20 bg-brand/5 p-3 text-[12.5px] text-text-soft">
            <div className="mb-1 font-medium text-text">รูปแบบไฟล์</div>
            ใช้ template ที่ดาวน์โหลดจากปุ่ม &quot;ดาวน์โหลด Template&quot; — Sheet ชื่อ &quot;Products&quot;,
            แถวที่ 1 เป็น header, แถวข้อมูลเริ่มที่ 2.
            <div className="mt-1">
              คอลัมน์บังคับ: <code>type</code>, <code>nameTh</code>, <code>unit</code>,{' '}
              <code>unitPrice</code>. type ที่อนุญาต:{' '}
              <code>SERVICE / GOOD / MATERIAL / ASSET</code>.
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-[12.5px] text-text-soft">เลือกไฟล์ Excel (.xlsx)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-text-soft hover:file:bg-surface-2"
            />
            {file && (
              <div className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
                <span className="font-medium">{file.name}</span>
                <span className="ml-2 text-text-mute">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
          </label>
        </form>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="ทั้งหมด" value={result.totalRows} />
            <Stat label="สร้าง" value={result.created} tone="ok" />
            <Stat label="ข้าม" value={result.skipped} tone="mute" />
            <Stat label="ผิดพลาด" value={result.errors} tone={result.errors ? 'bad' : 'mute'} />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-surface-2 text-left text-text-soft">
                <tr>
                  <th className="px-3 py-2 font-medium">แถว</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 font-medium">รหัส</th>
                  <th className="px-3 py-2 font-medium">ชื่อ</th>
                  <th className="px-3 py-2 font-medium">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {result.details.map((d) => (
                  <tr key={d.row} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono">{d.row}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={d.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11.5px]">{d.code ?? '—'}</td>
                    <td className="px-3 py-2">{d.nameTh ?? '—'}</td>
                    <td className="px-3 py-2 text-text-soft">{d.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' | 'mute' }) {
  const toneCls =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'bad'
        ? 'text-bad'
        : tone === 'mute'
          ? 'text-text-mute'
          : 'text-text';
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <div className={`text-xl font-semibold ${toneCls}`}>{value}</div>
      <div className="text-[11.5px] text-text-mute">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: 'created' | 'skipped' | 'error' }) {
  if (status === 'created') {
    return (
      <span className="inline-flex rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] text-ok">
        สร้างแล้ว
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[11px] text-bad">
        ผิดพลาด
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-text-mute/40 bg-surface-3 px-2 py-0.5 text-[11px] text-text-mute">
      ข้าม
    </span>
  );
}
