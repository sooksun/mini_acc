'use client';

import { useEffect, useState } from 'react';
import type { CompanyDto } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { getUser } from '@/lib/auth';

export default function MarkupSettingsPage() {
  const toast = useToast();
  const isOwner = getUser()?.role === 'OWNER';
  const [current, setCurrent] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<CompanyDto>('/company')
      .then((c) => {
        setCurrent(c.defaultMarkupPercent);
        setValue(String(c.defaultMarkupPercent));
      })
      .catch((e: any) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 999.99) {
      toast.error('กรอกเป็นตัวเลข 0–999.99');
      return;
    }
    setSaving(true);
    try {
      const c = await api<CompanyDto>('/company', {
        method: 'PATCH',
        body: JSON.stringify({ defaultMarkupPercent: n }),
      });
      setCurrent(c.defaultMarkupPercent);
      setValue(String(c.defaultMarkupPercent));
      toast.success('บันทึก Markup แล้ว');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const preview =
    value !== '' && Number.isFinite(Number(value))
      ? (100 * (1 + Number(value) / 100)).toFixed(2)
      : '—';

  return (
    <>
      <AppTopbar title="ตั้งค่า Markup" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Markup เริ่มต้น (ซื้อมา-ขายไป)</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-mute">
          ใช้คำนวณราคาขายเริ่มต้นเมื่อสร้างใบเสนอราคาจากใบเสร็จซื้อ — ราคาขาย = ราคาซื้อ × (1 + Markup%/100)
          ตั้งครั้งเดียวใช้ทั้งบริษัท (ยังปรับเฉพาะครั้งได้ในหน้าสร้างใบเสนอราคา)
        </p>

        <div className="mt-6 max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
          {current !== null && (
            <div className="mb-4 text-[13px] text-text-soft">
              ค่าปัจจุบัน: <span className="font-semibold text-text">{current}%</span>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-[13px] text-text-mute">Markup (%)</span>
            <input
              type="number"
              min={0}
              max={999.99}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!isOwner}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-brand disabled:opacity-60"
            />
          </label>

          {isOwner ? (
            <div className="mt-4 flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-md bg-brand-gradient px-5 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-text-mute">เฉพาะเจ้าของบัญชี (OWNER) แก้ไขได้</p>
          )}
        </div>

        <p className="mt-4 text-[12px] text-text-mute">
          ตัวอย่าง: ราคาซื้อ 100 บาท · Markup {value || '—'}% → ราคาขาย {preview} บาท
        </p>
      </div>
    </>
  );
}
