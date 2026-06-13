'use client';

import { useEffect, useState } from 'react';
import { AppTopbar } from '@/components/AppTopbar';
import { api } from '@/lib/api';
import { formatThaiDateTime } from '@/lib/format';

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string; role: string } | null;
}

const ACTIONS = [
  '', 'LOGIN', 'LOGOUT', 'UPDATE_COMPANY', 'UPDATE_VAT_STATUS',
  'CREATE_DOCUMENT', 'UPDATE_DOCUMENT', 'CONFIRM_DOCUMENT', 'VOID_DOCUMENT',
  'GENERATE_PDF', 'CLOSE_PERIOD', 'REOPEN_PERIOD', 'EXPORT_ACCOUNTANT_PACK',
  'RESET_BASELINE',
];

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      params.set('take', String(PAGE_SIZE));
      params.set('skip', String(page * PAGE_SIZE));
      const data = await api<{ items: AuditRow[]; total: number }>(`/audit-logs?${params.toString()}`);
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Reset to the first page whenever the action filter changes.
  useEffect(() => { setPage(0); }, [action]);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [action, page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AppTopbar title="บันทึกการตรวจสอบ" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">บันทึกการตรวจสอบ</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              บันทึกการกระทำที่สำคัญทั้งหมด — ทุกตัวเลขในรายงานย้อนกลับมาที่นี่ได้
            </p>
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a || 'ทุก action'}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-bad/40 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-4 py-3 font-medium">เวลา</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">ผู้ใช้</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">เหตุผล / รายละเอียด</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-text-mute">กำลังโหลด…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-text-mute">ไม่มีรายการ</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-text-mute">{formatThaiDateTime(r.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] font-medium">{r.action}</td>
                    <td className="px-4 py-3">
                      {r.user ? (
                        <div>
                          <div>{r.user.fullName}</div>
                          <div className="text-[11px] text-text-mute">{r.user.role}</div>
                        </div>
                      ) : (
                        <span className="text-text-mute">system</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-soft">
                      {r.entityType ? (
                        <div>
                          <div>{r.entityType}</div>
                          {r.entityId && <div className="font-mono text-[11px] text-text-mute">{r.entityId}</div>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-soft">
                      {r.reason ?? (r.metadata ? <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-mute">{JSON.stringify(r.metadata, null, 0)}</pre> : '—')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-text-mute">{r.ipAddress ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-[12.5px] text-text-soft">
          <span>
            {total > 0
              ? `แสดง ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} จาก ${total} รายการ`
              : 'ไม่มีรายการ'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={loading || page === 0}
              className="rounded-md border border-border bg-surface px-3 py-1.5 disabled:opacity-40"
            >
              ก่อนหน้า
            </button>
            <span className="tabular-nums">หน้า {page + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
              disabled={loading || page + 1 >= pageCount}
              className="rounded-md border border-border bg-surface px-3 py-1.5 disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
