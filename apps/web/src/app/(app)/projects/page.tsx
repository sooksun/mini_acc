'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { ProjectStatus } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Empty';
import { Modal } from '@/components/ui/Modal';
import { ThaiDatePicker } from '@/components/ui/ThaiDatePicker';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface Project {
  id: string;
  code: string | null;
  name: string;
  customerId: string | null;
  customerName: string | null;
  status: ProjectStatus;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  note: string | null;
}

interface ProjectProfit {
  projectId: string;
  revenue: number;
  revenueGross: number;
  cost: number;
  costGross: number;
  profit: number;
  marginPercent: number;
  budget: number | null;
  budgetUsedPercent: number | null;
  salesCount: number;
  expenseCount: number;
}

const STATUS_TH: Record<ProjectStatus, string> = {
  PLANNED: 'วางแผน',
  ACTIVE: 'ดำเนินการ',
  ON_HOLD: 'พักไว้',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
};

const STATUS_TONE: Record<ProjectStatus, string> = {
  PLANNED: 'border-text-mute/40 bg-surface-3 text-text-soft',
  ACTIVE: 'border-brand/40 bg-brand/10 text-brand',
  ON_HOLD: 'border-warn/40 bg-warn/10 text-warn',
  COMPLETED: 'border-ok/40 bg-ok/10 text-ok',
  CANCELLED: 'border-bad/40 bg-bad/10 text-bad',
};

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProjectsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [profitFor, setProfitFor] = useState<Project | null>(null);

  const role = getUser()?.role;
  const canEdit = role === 'OWNER' || role === 'ADMIN';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      params.set('take', '200');
      const res = await api<{ items: Project[]; total: number }>(`/projects?${params.toString()}`);
      setItems(res.items);
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
  }, [search, status]);

  return (
    <>
      <AppTopbar title="โครงการ" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">โครงการ</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              ติดตามต้นทุนและกำไรต่อโครงการ — ผูกใบแจ้งหนี้และรายจ่ายเข้าโครงการเพื่อดูกำไรจริง
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + เพิ่มโครงการ
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
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus | '')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          >
            <option value="">ทุกสถานะ</option>
            {(Object.keys(STATUS_TH) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_TH[s]}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[12.5px] text-text-mute">{items.length} โครงการ</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-4 py-3 font-medium">รหัส</th>
                <th className="px-4 py-3 font-medium">ชื่อโครงการ</th>
                <th className="px-4 py-3 font-medium">ลูกค้า</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium">งบประมาณ</th>
                <th className="px-4 py-3 text-right font-medium">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <Empty
                      title={search ? 'ไม่พบโครงการที่ค้นหา' : 'ยังไม่มีโครงการ'}
                      description={search ? 'ลองค้นหาด้วยคำอื่น' : 'เริ่มจากการเพิ่มโครงการแรก'}
                    />
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-[12px]">{p.code ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-text-soft">{p.customerName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[p.status]}`}
                      >
                        {STATUS_TH[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.budget ? baht(Number(p.budget)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setProfitFor(p)}
                          className="rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 text-[12px] text-brand hover:bg-brand/10"
                        >
                          กำไร
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
                          >
                            แก้ไข
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

      <ProjectFormModal
        open={formOpen}
        project={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <ProfitModal project={profitFor} onClose={() => setProfitFor(null)} />
    </>
  );
}

function ProjectFormModal({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [customers, setCustomers] = useState<{ id: string; nameTh: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    customerId: '',
    status: 'ACTIVE' as ProjectStatus,
    budget: '',
    startDate: '',
    endDate: '',
    note: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      code: project?.code ?? '',
      name: project?.name ?? '',
      customerId: project?.customerId ?? '',
      status: project?.status ?? 'ACTIVE',
      budget: project?.budget ?? '',
      startDate: project?.startDate ? project.startDate.slice(0, 10) : '',
      endDate: project?.endDate ? project.endDate.slice(0, 10) : '',
      note: project?.note ?? '',
    });
    api<{ items: { id: string; nameTh: string; type: string }[] }>('/partners?take=200')
      .then((res) =>
        setCustomers(
          res.items.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'),
        ),
      )
      .catch(() => setCustomers([]));
  }, [open, project]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('กรุณากรอกชื่อโครงการ');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        customerId: form.customerId || undefined,
        status: form.status,
        budget: form.budget ? Number(form.budget) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        note: form.note.trim() || undefined,
      };
      if (project) {
        await api(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success('บันทึกโครงการแล้ว');
      } else {
        await api('/projects', { method: 'POST', body: JSON.stringify(body) });
        toast.success('เพิ่มโครงการแล้ว');
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'แก้ไขโครงการ' : 'เพิ่มโครงการ'}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="project-form"
            disabled={saving}
            className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <label className="col-span-2 block">
          <span className="mb-1 block text-[12.5px] text-text-soft">ชื่อโครงการ *</span>
          <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-soft">รหัสโครงการ</span>
          <input className={field} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-soft">สถานะ</span>
          <select
            className={field}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
          >
            {(Object.keys(STATUS_TH) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_TH[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-soft">ลูกค้า</span>
          <select
            className={field}
            value={form.customerId}
            onChange={(e) => setForm({ ...form, customerId: e.target.value })}
          >
            <option value="">— ไม่ระบุ —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameTh}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-soft">งบประมาณ (บาท)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={field}
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-soft">วันเริ่ม</span>
          <ThaiDatePicker value={form.startDate} onChange={(iso) => setForm({ ...form, startDate: iso })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-soft">วันสิ้นสุด</span>
          <ThaiDatePicker value={form.endDate} onChange={(iso) => setForm({ ...form, endDate: iso })} />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-[12.5px] text-text-soft">หมายเหตุ</span>
          <textarea
            className={field}
            rows={2}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
      </form>
    </Modal>
  );
}

function ProfitModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const toast = useToast();
  const [profit, setProfit] = useState<ProjectProfit | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) {
      setProfit(null);
      return;
    }
    setLoading(true);
    api<ProjectProfit>(`/projects/${project.id}/profit`)
      .then(setProfit)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  return (
    <Modal open={!!project} onClose={onClose} title={`กำไรโครงการ — ${project?.name ?? ''}`} size="md">
      {loading || !profit ? (
        <div className="py-8 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <ProfitStat label="รายได้" value={profit.revenue} tone="ok" />
            <ProfitStat label="ต้นทุน" value={profit.cost} tone="bad" />
            <ProfitStat label="กำไร" value={profit.profit} tone={profit.profit >= 0 ? 'ok' : 'bad'} />
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-[13px]">
            <Row label="อัตรากำไร" value={`${profit.marginPercent.toFixed(2)}%`} />
            <Row label="รายได้รวม VAT" value={`${baht(profit.revenueGross)} บาท`} />
            <Row label="ต้นทุนรวม VAT" value={`${baht(profit.costGross)} บาท`} />
            {profit.budget !== null && (
              <Row
                label="งบประมาณ"
                value={`${baht(profit.budget)} บาท${
                  profit.budgetUsedPercent !== null ? ` (ใช้ไป ${profit.budgetUsedPercent.toFixed(1)}%)` : ''
                }`}
              />
            )}
            <Row label="เอกสารขาย / รายจ่าย" value={`${profit.salesCount} / ${profit.expenseCount} รายการ`} />
          </div>
          <p className="text-[11.5px] text-text-mute">
            รายได้นับจากใบแจ้งหนี้/ใบกำกับภาษีและใบเสร็จที่ผูกกับโครงการนี้ ต้นทุนนับจากรายจ่ายที่ผูกกับโครงการ
          </p>
        </div>
      )}
    </Modal>
  );
}

function ProfitStat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'bad' }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
      <div className={`text-lg font-semibold ${tone === 'ok' ? 'text-ok' : 'text-bad'}`}>{baht(value)}</div>
      <div className="text-[11.5px] text-text-mute">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-text-soft">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
