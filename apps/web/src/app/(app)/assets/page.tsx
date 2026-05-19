'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { FixedAssetStatus } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort, localDateString } from '@/lib/format';

interface AssetRow {
  id: string;
  code: string | null;
  name: string;
  category: string;
  status: FixedAssetStatus;
  acquiredAt: string;
  cost: string;
  salvageValue: string;
  usefulLifeMonths: number;
  accumulatedDepr: string;
  bookValue: string;
  monthlyDepreciation: string;
  monthsElapsed: number;
  disposedAt: string | null;
  disposalReason: string | null;
}

const STATUS_META: Record<FixedAssetStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'ใช้งาน', tone: 'border-ok/40 bg-ok/10 text-ok' },
  DISPOSED: { label: 'จำหน่ายแล้ว', tone: 'border-text-mute/40 bg-surface-3 text-text-soft' },
  WRITTEN_OFF: { label: 'ตัดทิ้ง', tone: 'border-bad/40 bg-bad/10 text-bad' },
};

export default function AssetsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FixedAssetStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [disposing, setDisposing] = useState<AssetRow | null>(null);
  const [depreciating, setDepreciating] = useState(false);

  const role = getUser()?.role;
  const canCreate = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';
  const canDispose = role === 'OWNER' || role === 'ACCOUNTANT';
  const canDepreciate = role === 'OWNER' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('take', '500');
      const data = await api<{ items: AssetRow[]; total: number }>(
        `/fixed-assets?${params.toString()}`,
      );
      setRows(data.items);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดทรัพย์สินล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function runDepreciation() {
    if (!canDepreciate) return;
    setDepreciating(true);
    try {
      const result = await api<{ assetsUpdated: number; totalDepreciation: string }>(
        '/fixed-assets/depreciate-all',
        { method: 'POST' },
      );
      toast.success(
        `คำนวณค่าเสื่อมราคา — ปรับ ${result.assetsUpdated} รายการ`,
      );
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'คำนวณค่าเสื่อมล้มเหลว');
    } finally {
      setDepreciating(false);
    }
  }

  const activeAssets = rows.filter((r) => r.status === 'ACTIVE');
  const totalCost = activeAssets.reduce((s, r) => s + Number(r.cost), 0);
  const totalBook = activeAssets.reduce((s, r) => s + Number(r.bookValue), 0);
  const totalDepr = activeAssets.reduce((s, r) => s + Number(r.accumulatedDepr), 0);

  const columns: DataTableColumn<AssetRow>[] = [
    {
      key: 'asset',
      header: 'ทรัพย์สิน',
      render: (r) => (
        <div>
          <div className="font-medium text-text">{r.name}</div>
          <div className="text-[11.5px] text-text-mute">{r.category}</div>
          {r.code && <div className="font-mono text-[11px] text-text-faint">{r.code}</div>}
        </div>
      ),
    },
    {
      key: 'acquiredAt',
      header: 'วันที่ได้มา',
      render: (r) => (
        <div>
          <div>{formatThaiDateShort(r.acquiredAt)}</div>
          <div className="text-[11px] text-text-mute">{r.monthsElapsed} เดือนผ่านมา</div>
        </div>
      ),
    },
    { key: 'cost', header: 'ต้นทุน', align: 'right', numeric: true, render: (r) => formatThaiCurrency(r.cost) },
    {
      key: 'lifeMonths',
      header: 'อายุการใช้งาน',
      align: 'right',
      render: (r) => `${r.usefulLifeMonths} เดือน`,
    },
    {
      key: 'monthly',
      header: 'ค่าเสื่อม/เดือน',
      align: 'right',
      numeric: true,
      render: (r) => formatThaiCurrency(r.monthlyDepreciation),
    },
    {
      key: 'accum',
      header: 'สะสม',
      align: 'right',
      numeric: true,
      render: (r) => <span className="text-warn">{formatThaiCurrency(r.accumulatedDepr)}</span>,
    },
    {
      key: 'bookValue',
      header: 'มูลค่าตามบัญชี',
      align: 'right',
      numeric: true,
      render: (r) => <span className="font-medium">{formatThaiCurrency(r.bookValue)}</span>,
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (r) => (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${STATUS_META[r.status].tone}`}>
          {STATUS_META[r.status].label}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canDispose && r.status === 'ACTIVE' ? (
          <button
            onClick={() => setDisposing(r)}
            className="rounded-md border border-bad/40 bg-bad/5 px-2.5 py-1 text-[12px] text-bad hover:bg-bad/10"
          >
            จำหน่าย
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <AppTopbar title="ทรัพย์สินถาวร" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ทรัพย์สินถาวร</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              จัดการทรัพย์สินและคำนวณค่าเสื่อมราคาแบบเส้นตรง (straight-line)
            </p>
          </div>
          <div className="flex gap-2">
            {canDepreciate && (
              <button
                onClick={runDepreciation}
                disabled={depreciating}
                className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-text-soft hover:bg-surface-3 disabled:opacity-60"
              >
                {depreciating ? 'กำลังคำนวณ…' : 'คำนวณค่าเสื่อม'}
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => setCreating(true)}
                className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
              >
                + เพิ่มทรัพย์สิน
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatCard
            label="ต้นทุนรวม (active)"
            value={formatThaiCurrency(totalCost)}
            hint={`${activeAssets.length} รายการ`}
          />
          <StatCard
            label="ค่าเสื่อมราคาสะสม"
            value={formatThaiCurrency(totalDepr)}
            tone="warn"
          />
          <StatCard
            label="มูลค่าตามบัญชีรวม"
            value={formatThaiCurrency(totalBook)}
            tone="info"
          />
        </div>

        <div className="mt-5">
          <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
            สถานะ
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FixedAssetStatus | '')}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-brand"
            >
              <option value="">ทั้งหมด</option>
              {Object.entries(STATUS_META).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={loading}
            emptyTitle="ยังไม่มีทรัพย์สิน"
            emptyDescription={canCreate ? 'กด "เพิ่มทรัพย์สิน" เพื่อเริ่มต้น' : undefined}
          />
        </div>
      </div>

      <CreateAssetModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />

      <DisposeAssetModal
        asset={disposing}
        onClose={() => setDisposing(null)}
        onSaved={() => {
          setDisposing(null);
          load();
        }}
      />
    </>
  );
}

function CreateAssetModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    code: '',
    name: '',
    category: '',
    acquiredAt: '',
    cost: '',
    salvageValue: '0',
    usefulLifeMonths: '60',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        code: '',
        name: '',
        category: '',
        acquiredAt: localDateString(),
        cost: '',
        salvageValue: '0',
        usefulLifeMonths: '60',
      });
    }
  }, [open]);

  const costNum = Number(form.cost) || 0;
  const salvageNum = Number(form.salvageValue) || 0;
  const life = Number(form.usefulLifeMonths) || 1;
  const monthly = costNum > 0 ? (costNum - salvageNum) / life : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/fixed-assets', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim() || undefined,
          name: form.name.trim(),
          category: form.category.trim(),
          acquiredAt: form.acquiredAt,
          cost: form.cost,
          salvageValue: form.salvageValue || '0',
          usefulLifeMonths: Number(form.usefulLifeMonths),
        }),
      });
      toast.success('บันทึกทรัพย์สินแล้ว');
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
      title="เพิ่มทรัพย์สินถาวร"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="create-asset-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="create-asset-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">รหัสทรัพย์สิน (optional)</span>
          <input
            value={form.code}
            onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[14px] outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">หมวด</span>
          <input
            value={form.category}
            onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))}
            required
            placeholder="อุปกรณ์สำนักงาน / ยานพาหนะ / คอมพิวเตอร์"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">ชื่อทรัพย์สิน</span>
          <input
            value={form.name}
            onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">วันที่ได้มา</span>
          <input
            type="date"
            value={form.acquiredAt}
            onChange={(e) => setForm((v) => ({ ...v, acquiredAt: e.target.value }))}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">อายุการใช้งาน (เดือน)</span>
          <input
            type="number"
            min={1}
            max={1200}
            value={form.usefulLifeMonths}
            onChange={(e) => setForm((v) => ({ ...v, usefulLifeMonths: e.target.value }))}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">ต้นทุน (บาท)</span>
          <input
            value={form.cost}
            onChange={(e) => setForm((v) => ({ ...v, cost: e.target.value }))}
            required
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-right font-mono text-[14px] outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">มูลค่าซาก (บาท)</span>
          <input
            value={form.salvageValue}
            onChange={(e) => setForm((v) => ({ ...v, salvageValue: e.target.value }))}
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-right font-mono text-[14px] outline-none focus:border-brand"
          />
        </label>
        {costNum > 0 && (
          <div className="md:col-span-2 rounded-md border border-info/30 bg-info/5 p-3 text-[12.5px] text-text-soft">
            <div className="flex justify-between">
              <span>ค่าเสื่อมราคา/เดือน (straight-line)</span>
              <span className="font-mono">{formatThaiCurrency(monthly)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>ค่าเสื่อมรวมตลอดอายุ</span>
              <span className="font-mono">{formatThaiCurrency(costNum - salvageNum)}</span>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function DisposeAssetModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: AssetRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [disposedAt, setDisposedAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (asset) {
      setReason('');
      setDisposedAt(localDateString());
    }
  }, [asset]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!asset || !reason.trim()) return;
    setSaving(true);
    try {
      await api(`/fixed-assets/${asset.id}/dispose`, {
        method: 'POST',
        body: JSON.stringify({ disposedAt, reason: reason.trim() }),
      });
      toast.success('จำหน่ายทรัพย์สินแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'จำหน่ายล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!asset}
      onClose={onClose}
      title="จำหน่ายทรัพย์สิน"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="dispose-form"
            disabled={saving || !reason.trim()}
            className="rounded-md bg-bad px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังจำหน่าย…' : 'ยืนยันจำหน่าย'}
          </button>
        </>
      }
    >
      {asset && (
        <form id="dispose-form" onSubmit={submit} className="space-y-3">
          <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-[12.5px] text-text-soft">
            <div className="font-medium text-text">{asset.name}</div>
            <div className="mt-0.5 text-[11.5px] text-text-mute">
              {asset.category} · มูลค่าตามบัญชี {formatThaiCurrency(asset.bookValue)}
            </div>
          </div>
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">วันที่จำหน่าย</span>
            <input
              type="date"
              value={disposedAt}
              onChange={(e) => setDisposedAt(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            />
          </label>
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">เหตุผล *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="ขาย / ทิ้ง / ส่งคืน"
              className="min-h-20 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            />
          </label>
        </form>
      )}
    </Modal>
  );
}
