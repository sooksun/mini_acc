'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { RiskItemStatus, RiskItemType, RiskLevel } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiDateTime } from '@/lib/format';

interface RiskRow {
  id: string;
  type: RiskItemType;
  level: RiskLevel;
  status: RiskItemStatus;
  entityType: string | null;
  entityId: string | null;
  title: string;
  description: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

const STATUS_META: Record<RiskItemStatus, { label: string; cls: string }> = {
  OPEN: { label: 'เปิดอยู่', cls: 'border-warn/40 bg-warn/10 text-warn' },
  IN_REVIEW: { label: 'กำลังตรวจ', cls: 'border-info/40 bg-info/10 text-info' },
  RESOLVED: { label: 'แก้ไขแล้ว', cls: 'border-ok/40 bg-ok/10 text-ok' },
  ACCEPTED_RISK: { label: 'รับความเสี่ยง', cls: 'border-text-mute/40 bg-surface-3 text-text-soft' },
  DISMISSED: { label: 'ปิด', cls: 'border-text-mute/40 bg-surface-3 text-text-faint' },
};

type ActionKind = 'resolve' | 'accept' | 'dismiss';

export default function RisksPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RiskItemStatus | ''>('');
  const [scanning, setScanning] = useState(false);
  const [actioning, setActioning] = useState<{ row: RiskRow; kind: ActionKind } | null>(null);

  const role = getUser()?.role;
  const canAct = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';
  const canAccept = role === 'OWNER' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('take', '200');
      const data = await api<{ items: RiskRow[]; total: number }>(
        `/risks?${params.toString()}`,
      );
      setRows(data.items);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลด Risk ล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function runScan() {
    setScanning(true);
    try {
      const result = await api<{ created: number; detected: unknown[] }>('/risks/scan', {
        method: 'POST',
      });
      toast.success(`สแกนเสร็จ — พบใหม่ ${result.created} รายการ`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'สแกนล้มเหลว');
    } finally {
      setScanning(false);
    }
  }

  const openCount = rows.filter((r) => r.status === 'OPEN' || r.status === 'IN_REVIEW').length;
  const criticalCount = rows.filter(
    (r) =>
      r.level === 'CRITICAL' && (r.status === 'OPEN' || r.status === 'IN_REVIEW'),
  ).length;

  const columns: DataTableColumn<RiskRow>[] = [
    { key: 'level', header: 'ระดับ', render: (r) => <RiskBadge level={r.level} showDot /> },
    {
      key: 'title',
      header: 'รายการ',
      render: (r) => (
        <div>
          <div className="font-medium text-text">{r.title}</div>
          {r.description && (
            <div className="mt-0.5 text-[11.5px] text-text-mute">{r.description}</div>
          )}
          <div className="mt-0.5 font-mono text-[11px] text-text-faint">
            {r.type}{r.entityType ? ` · ${r.entityType}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'detectedAt',
      header: 'พบเมื่อ',
      render: (r) => <span className="text-text-soft">{formatThaiDateTime(r.detectedAt)}</span>,
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (r) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${STATUS_META[r.status].cls}`}
        >
          {STATUS_META[r.status].label}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => {
        if (!canAct) return null;
        const open = r.status === 'OPEN' || r.status === 'IN_REVIEW';
        if (!open) return null;
        return (
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setActioning({ row: r, kind: 'resolve' })}
              className="rounded-md border border-ok/40 bg-ok/5 px-2 py-0.5 text-[12px] text-ok hover:bg-ok/10"
            >
              แก้ไขแล้ว
            </button>
            {canAccept && (
              <button
                onClick={() => setActioning({ row: r, kind: 'accept' })}
                className="rounded-md border border-warn/40 bg-warn/5 px-2 py-0.5 text-[12px] text-warn hover:bg-warn/10"
              >
                รับความเสี่ยง
              </button>
            )}
            <button
              onClick={() => setActioning({ row: r, kind: 'dismiss' })}
              className="rounded-md border border-border bg-surface px-2 py-0.5 text-[12px] text-text-soft hover:bg-surface-3"
            >
              ปิด
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <AppTopbar title="ศูนย์ความเสี่ยง" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ศูนย์ความเสี่ยง</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              ความเสี่ยงที่ระบบตรวจพบ — ปิดงวดไม่ได้ถ้ายังมี CRITICAL ค้าง
            </p>
          </div>
          {canAct && (
            <button
              onClick={runScan}
              disabled={scanning}
              className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-60"
            >
              {scanning ? 'กำลังสแกน…' : 'สแกนความเสี่ยงใหม่'}
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatCard label="รายการที่กรอง" value={String(rows.length)} />
          <StatCard label="เปิดอยู่" value={String(openCount)} tone={openCount > 0 ? 'warn' : 'default'} />
          <StatCard
            label="CRITICAL ค้าง"
            value={String(criticalCount)}
            tone={criticalCount > 0 ? 'bad' : 'ok'}
          />
        </div>

        <div className="mt-5">
          <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
            สถานะ
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RiskItemStatus | '')}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-brand"
            >
              <option value="">ทั้งหมด (ยกเว้น DISMISSED)</option>
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
            emptyTitle="ไม่มีรายการเสี่ยง"
            emptyDescription={canAct ? 'กดปุ่ม "สแกนความเสี่ยงใหม่" เพื่อตรวจสอบล่าสุด' : undefined}
          />
        </div>
      </div>

      <ActionModal
        action={actioning}
        onClose={() => setActioning(null)}
        onSaved={() => {
          setActioning(null);
          load();
        }}
      />
    </>
  );
}

function ActionModal({
  action,
  onClose,
  onSaved,
}: {
  action: { row: RiskRow; kind: ActionKind } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (action) setResolution('');
  }, [action]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!action || !resolution.trim()) return;
    setSaving(true);
    try {
      await api(`/risks/${action.row.id}/${action.kind}`, {
        method: 'POST',
        body: JSON.stringify({ resolution: resolution.trim() }),
      });
      toast.success('บันทึกแล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  const KIND_LABEL: Record<ActionKind, string> = {
    resolve: 'แก้ไขแล้ว',
    accept: 'รับความเสี่ยง',
    dismiss: 'ปิดรายการ',
  };

  return (
    <Modal
      open={!!action}
      onClose={onClose}
      title={action ? `${KIND_LABEL[action.kind]} — ${action.row.title}` : ''}
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
            form="risk-action-form"
            disabled={saving || !resolution.trim()}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'ยืนยัน'}
          </button>
        </>
      }
    >
      {action && (
        <form id="risk-action-form" onSubmit={submit} className="space-y-3">
          <div className="rounded-md border border-border bg-surface-2 p-3 text-[12.5px] text-text-soft">
            <div className="text-[11px] text-text-mute">{action.row.type}</div>
            <div className="mt-0.5 font-medium text-text">{action.row.title}</div>
          </div>
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">บันทึกเหตุผล *</span>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              required
              placeholder={
                action.kind === 'resolve'
                  ? 'อธิบายว่าแก้ไขอย่างไร'
                  : action.kind === 'accept'
                    ? 'อธิบายว่ายอมรับเพราะเหตุใด'
                    : 'อธิบายว่าทำไมจึงปิด'
              }
              className="min-h-20 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            />
          </label>
        </form>
      )}
    </Modal>
  );
}
