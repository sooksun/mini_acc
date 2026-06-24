'use client';

import { useEffect, useState } from 'react';
import { Empty } from '@/components/ui/Empty';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatThaiCurrency } from '@/lib/format';
import { periodLabel } from './expense-receipts.form';
import type { PrepaidEntry } from './expense-receipts.types';

export function PrepaidModal({
  open,
  onClose,
  canRun,
}: {
  open: boolean;
  onClose: () => void;
  canRun: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState<PrepaidEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'RECOGNIZED' | ''>('PENDING');
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('take', '300');
      const res = await api<{ items: PrepaidEntry[]; total: number }>(
        `/expense-receipts/prepaid?${params.toString()}`,
      );
      setItems(res.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, statusFilter]);

  async function run() {
    const [y, m] = period.split('-').map(Number);
    if (!y || !m) {
      toast.error('เลือกงวดก่อน');
      return;
    }
    setRunning(true);
    try {
      const res = await api<{ recognized: number; total: string }>(`/expense-receipts/prepaid/run`, {
        method: 'POST',
        body: JSON.stringify({ year: y, month: m }),
      });
      toast.success(
        `ตัดค่าใช้จ่ายล่วงหน้า ${res.recognized} รายการ รวม ${formatThaiCurrency(res.total)} บาท`,
      );
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'ตัด prepaid ไม่สำเร็จ');
    } finally {
      setRunning(false);
    }
  }

  const pendingTotal = items
    .filter((i) => i.status === 'PENDING')
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ตัดค่าใช้จ่ายล่วงหน้า (prepaid) รายเดือน"
      size="xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2 text-[13px]"
        >
          ปิด
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'PENDING' | 'RECOGNIZED' | '')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
          >
            <option value="PENDING">รอตัด</option>
            <option value="RECOGNIZED">ตัดแล้ว</option>
            <option value="">ทั้งหมด</option>
          </select>
          {canRun && (
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
              <button
                onClick={run}
                disabled={running}
                className="rounded-md bg-brand px-3 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {running ? 'กำลังตัด…' : 'ตัดถึงงวดนี้'}
              </button>
            </div>
          )}
        </div>
        {statusFilter !== 'RECOGNIZED' && (
          <div className="text-[12.5px] text-text-soft">
            รวมรอตัด:{' '}
            <span className="font-mono font-semibold text-text">
              {formatThaiCurrency(pendingTotal.toFixed(2))}
            </span>{' '}
            บาท
          </div>
        )}
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-3 py-2 font-medium">ผู้ขาย / หมวด</th>
                <th className="px-3 py-2 font-medium">งวด</th>
                <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                <th className="px-3 py-2 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8">
                    <Empty
                      title="ไม่มีรายการ prepaid"
                      description="ติ๊ก ‘ค่าใช้จ่ายจ่ายล่วงหน้า’ พร้อมช่วงบริการตอนลงรายจ่าย"
                    />
                  </td>
                </tr>
              ) : (
                items.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{e.expenseRecord?.vendor?.nameTh ?? '—'}</div>
                      <div className="text-[11px] text-text-mute">
                        {e.expenseRecord?.category ?? e.expenseRecord?.documentNumber ?? ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-text-soft">
                      {periodLabel(e.periodYear, e.periodMonth)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatThaiCurrency(e.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      {e.status === 'PENDING' ? (
                        <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
                          รอตัด
                        </span>
                      ) : (
                        <span className="rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] text-ok">
                          ตัดแล้ว
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-text-mute">
          ตัด prepaid โพสต์ Dr ค่าใช้จ่าย / Cr ค่าใช้จ่ายจ่ายล่วงหน้า ในแต่ละงวด (ทำซ้ำได้ —
          งวดที่ตัดแล้วจะไม่ถูกตัดซ้ำ)
        </p>
      </div>
    </Modal>
  );
}