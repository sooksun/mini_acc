'use client';

import { useEffect, useState } from 'react';
import type { PartnerType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Empty';
import { PartnerTypeBadge } from '@/components/ui/PartnerTypeBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { PartnerForm } from './PartnerForm';

interface Partner {
  id: string;
  type: PartnerType;
  code: string | null;
  nameTh: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  contacts: { id: string; name: string; isPrimary: boolean }[];
}

interface PartnersListProps {
  mode: 'CUSTOMER' | 'VENDOR';
  title: string;
  description: string;
}

export function PartnersList({ mode, title, description }: PartnersListProps) {
  const toast = useToast();
  const [items, setItems] = useState<Partner[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
      params.set('type', mode);
      if (!showInactive) params.set('isActive', 'true');
      if (search) params.set('search', search);
      params.set('take', '100');
      const res = await api<{ items: Partner[]; total: number }>(`/partners?${params.toString()}`);
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
  }, [search, showInactive, mode]);

  async function handleDeactivate(id: string) {
    try {
      await api(`/partners/${id}/deactivate`, { method: 'POST' });
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
      <AppTopbar title={title} />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-[13px] text-text-mute">{description}</p>
          </div>
          {canEdit && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + เพิ่ม{mode === 'CUSTOMER' ? 'ลูกค้า' : 'ผู้ขาย'}ใหม่
            </button>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส / เลขผู้เสียภาษี"
            className="w-80 rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <label className="inline-flex items-center gap-2 text-[13px] text-text-soft">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            แสดงที่ปิดการใช้งานด้วย
          </label>
          <span className="ml-auto text-[12.5px] text-text-mute">
            {total} รายการ
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-4 py-3 font-medium">รหัส</th>
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">ประเภท</th>
                <th className="px-4 py-3 font-medium">เลขผู้เสียภาษี</th>
                <th className="px-4 py-3 font-medium">โทรศัพท์</th>
                <th className="px-4 py-3 font-medium">ผู้ติดต่อ</th>
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
                items.map((p) => {
                  const primary = p.contacts.find((c) => c.isPrimary) ?? p.contacts[0];
                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-border ${!p.isActive ? 'text-text-mute' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-[12px]">{p.code ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.nameTh}</div>
                        {!p.isActive && (
                          <div className="text-[11px] text-bad">ปิดการใช้งาน</div>
                        )}
                      </td>
                      <td className="px-4 py-3"><PartnerTypeBadge type={p.type} /></td>
                      <td className="px-4 py-3 font-mono text-[12px] text-text-soft">{p.taxId ?? '—'}</td>
                      <td className="px-4 py-3 text-text-soft">{p.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-text-soft">
                        {primary ? primary.name : <span className="text-text-mute">—</span>}
                      </td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PartnerForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
        defaultType={mode}
        partnerId={editingId}
      />

      <ConfirmDialog
        open={!!deactivateId}
        title="ปิดการใช้งานรายการนี้?"
        description="รายการที่ปิดใช้งานจะไม่ปรากฏใน picker ตอนสร้างเอกสาร แต่ข้อมูลและประวัติยังคงอยู่"
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
