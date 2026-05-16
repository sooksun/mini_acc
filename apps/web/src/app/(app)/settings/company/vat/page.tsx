'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { VatStatus } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { ThaiDatePicker } from '@/components/ui/ThaiDatePicker';
import { api } from '@/lib/api';
import { formatThaiDate } from '@/lib/format';
import { getUser } from '@/lib/auth';

interface VatRow {
  id: string;
  status: VatStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<VatStatus, string> = {
  REGISTERED: 'จดทะเบียน',
  CANCELLED: 'ยกเลิกการจดทะเบียน',
  NOT_REGISTERED: 'ยังไม่จดทะเบียน',
};

const STATUS_COLOR: Record<VatStatus, string> = {
  REGISTERED: 'text-ok border-ok/40 bg-ok/5',
  CANCELLED: 'text-bad border-bad/40 bg-bad/5',
  NOT_REGISTERED: 'text-text-mute border-border bg-surface-3',
};

export default function VatHistoryPage() {
  const [rows, setRows] = useState<VatRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isOwner = getUser()?.role === 'OWNER';

  async function load() {
    try {
      const data = await api<VatRow[]>('/company/vat-history');
      setRows(data);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <AppTopbar title="ประวัติสถานะ VAT" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ประวัติสถานะ VAT</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              เอกสาร TAX_INVOICE ออกได้เฉพาะช่วงที่สถานะ VAT = REGISTERED เท่านั้น
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={'/settings/company' as any}
              className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text-soft hover:bg-surface-3"
            >
              กลับ
            </Link>
            {isOwner && !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
              >
                เปลี่ยนสถานะ VAT
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-bad/40 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            {error}
          </div>
        )}

        {showForm && (
          <NewStatusForm
            onCancel={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); load(); }}
          />
        )}

        <div className="mt-6 max-w-4xl overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">มีผลตั้งแต่</th>
                <th className="px-4 py-3 font-medium">ถึง</th>
                <th className="px-4 py-3 font-medium">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-mute">
                    ยังไม่มีประวัติสถานะ
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[12px] ${STATUS_COLOR[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatThaiDate(r.effectiveFrom)}</td>
                    <td className="px-4 py-3 text-text-mute">
                      {r.effectiveTo ? formatThaiDate(r.effectiveTo) : 'ปัจจุบัน'}
                    </td>
                    <td className="px-4 py-3 text-text-soft">{r.reason ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function NewStatusForm(props: { onCancel: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<VatStatus>('REGISTERED');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api('/company/vat-status', {
        method: 'POST',
        body: JSON.stringify({
          status,
          effectiveFrom: new Date(effectiveFrom + 'T00:00:00+07:00').toISOString(),
          reason: reason || undefined,
        }),
      });
      props.onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 max-w-2xl rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <div className="mb-3 text-[14px] font-medium">เปลี่ยนสถานะ VAT</div>

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] text-text-soft">สถานะ</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as VatStatus)}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
        >
          <option value="REGISTERED">REGISTERED — จดทะเบียน VAT</option>
          <option value="CANCELLED">CANCELLED — ยกเลิกการจดทะเบียน</option>
          <option value="NOT_REGISTERED">NOT_REGISTERED — ยังไม่จดทะเบียน</option>
        </select>
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] text-text-soft">มีผลตั้งแต่ (พ.ศ.)</span>
        <ThaiDatePicker value={effectiveFrom} onChange={setEffectiveFrom} required />
        <span className="mt-1 block text-[11px] text-text-mute">
          แสดงเป็น พ.ศ. ระบบเก็บเป็น UTC
        </span>
      </label>

      <label className="mb-4 block">
        <span className="mb-1 block text-[12px] text-text-soft">เหตุผล (ไม่บังคับ)</span>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
        />
      </label>

      {error && (
        <div className="mb-3 rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-[12.5px] text-bad">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-text-soft hover:bg-surface-3"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </form>
  );
}
