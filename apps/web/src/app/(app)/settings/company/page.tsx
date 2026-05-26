'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CompanyDto } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { api } from '@/lib/api';
import { formatThaiDate } from '@/lib/format';
import { getUser } from '@/lib/auth';

type FormState = {
  nameTh: string;
  nameEn: string;
  address: string;
  phone: string;
  email: string;
  brandShort: string;
  tagline: string;
};

const empty: FormState = {
  nameTh: '', nameEn: '', address: '', phone: '', email: '', brandShort: '', tagline: '',
};

export default function CompanySettingsPage() {
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isOwner = getUser()?.role === 'OWNER';

  async function load() {
    try {
      const c = await api<CompanyDto>('/company');
      setCompany(c);
      setForm({
        nameTh: c.nameTh, nameEn: c.nameEn ?? '', address: c.address,
        phone: c.phone ?? '', email: c.email ?? '',
        brandShort: c.brandShort ?? '', tagline: c.tagline ?? '',
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const next = await api<CompanyDto>('/company', {
        method: 'PATCH',
        body: JSON.stringify({
          nameTh: form.nameTh,
          nameEn: form.nameEn || undefined,
          address: form.address,
          phone: form.phone || undefined,
          email: form.email || undefined,
          brandShort: form.brandShort || undefined,
          tagline: form.tagline || undefined,
        }),
      });
      setCompany(next);
      setEditing(false);
      setToast('บันทึกแล้ว');
      setTimeout(() => setToast(null), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (!company) return;
    setForm({
      nameTh: company.nameTh, nameEn: company.nameEn ?? '', address: company.address,
      phone: company.phone ?? '', email: company.email ?? '',
      brandShort: company.brandShort ?? '', tagline: company.tagline ?? '',
    });
    setEditing(false);
    setError(null);
  }

  return (
    <>
      <AppTopbar title="ตั้งค่าบริษัท" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ตั้งค่าบริษัท</h1>
            <p className="mt-1 text-[13px] text-text-mute">ข้อมูลที่จะปรากฏใน PDF เอกสารทุกประเภท</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={'/settings/company/vat' as any}
              className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text-soft hover:bg-surface-3"
            >
              ประวัติสถานะ VAT
            </Link>
            {!editing && isOwner && (
              <button
                onClick={() => setEditing(true)}
                className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
              >
                แก้ไข
              </button>
            )}
          </div>
        </div>

        {toast && (
          <div className="mt-4 rounded-md border border-ok/40 bg-ok/5 px-4 py-2.5 text-sm text-ok">
            {toast}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-md border border-bad/40 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            {error}
          </div>
        )}

        {company && (
          <form
            onSubmit={(e) => { e.preventDefault(); save(); }}
            className="mt-6 grid max-w-3xl gap-2 rounded-lg border border-border bg-surface p-6 shadow-sm"
          >
            <Field label="ชื่อภาษาไทย" required editing={editing}
              value={form.nameTh} onChange={(v) => setForm({ ...form, nameTh: v })}
              display={company.nameTh} />
            <Field label="ชื่อภาษาอังกฤษ" editing={editing}
              value={form.nameEn} onChange={(v) => setForm({ ...form, nameEn: v })}
              display={company.nameEn ?? '—'} />
            <Field label="เลขประจำตัวผู้เสียภาษี" editing={false} mono
              value={company.taxId} onChange={() => {}} display={company.taxId} />
            <Field label="ที่อยู่" required editing={editing} multiline
              value={form.address} onChange={(v) => setForm({ ...form, address: v })}
              display={company.address} />
            <Field label="โทรศัพท์" editing={editing}
              value={form.phone} onChange={(v) => setForm({ ...form, phone: v })}
              display={company.phone ?? '—'} />
            <Field label="อีเมล" editing={editing} type="email"
              value={form.email} onChange={(v) => setForm({ ...form, email: v })}
              display={company.email ?? '—'} />
            <Field label="โลโก้ย่อ (สูงสุด 8)" editing={editing}
              value={form.brandShort} onChange={(v) => setForm({ ...form, brandShort: v })}
              display={company.brandShort ?? '—'} />
            <Field label="คำขวัญ" editing={editing}
              value={form.tagline} onChange={(v) => setForm({ ...form, tagline: v })}
              display={company.tagline ?? '—'} />
            <Field label="วันที่จดทะเบียน" editing={false}
              value="" onChange={() => {}}
              display={formatThaiDate(company.registeredAt)} />
            <Field label="VAT มีผลตั้งแต่" editing={false}
              value="" onChange={() => {}}
              display={company.vatEffectiveDate ? formatThaiDate(company.vatEffectiveDate) : 'ยังไม่จดทะเบียน VAT'} />
            {editing && (
              <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={cancel}
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
            )}
          </form>
        )}
      </div>
    </>
  );
}

function Field(props: {
  label: string;
  value: string;
  display: string;
  editing: boolean;
  required?: boolean;
  mono?: boolean;
  multiline?: boolean;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-3 border-b border-border py-2 last:border-0">
      <div className="pt-1.5 text-[13px] text-text-mute">{props.label}</div>
      <div className={`text-[14px] ${props.mono ? 'font-mono' : ''}`}>
        {props.editing ? (
          props.multiline ? (
            <textarea
              required={props.required}
              value={props.value}
              onChange={(e) => props.onChange(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[13.5px] outline-none focus:border-brand"
            />
          ) : (
            <input
              required={props.required}
              type={props.type ?? 'text'}
              value={props.value}
              onChange={(e) => props.onChange(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[13.5px] outline-none focus:border-brand"
            />
          )
        ) : (
          <span>{props.display}</span>
        )}
      </div>
    </div>
  );
}
