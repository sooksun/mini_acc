'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { PartnerType } from '@hj/shared-types';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface ContactInput {
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

interface FormState {
  type: PartnerType;
  code: string;
  nameTh: string;
  nameEn: string;
  taxId: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  note: string;
  contacts: ContactInput[];
  isActive: boolean;
}

const empty = (defaultType: PartnerType): FormState => ({
  type: defaultType,
  code: '', nameTh: '', nameEn: '', taxId: '', branch: '',
  address: '', phone: '', email: '', website: '', note: '',
  contacts: [],
  isActive: true,
});

interface PartnerFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultType: PartnerType;
  partnerId?: string | null;
}

export function PartnerForm({ open, onClose, onSaved, defaultType, partnerId }: PartnerFormProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(empty(defaultType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!partnerId) {
      setForm(empty(defaultType));
      return;
    }
    setLoading(true);
    api<any>(`/partners/${partnerId}`)
      .then((p) => {
        setForm({
          type: p.type,
          code: p.code ?? '',
          nameTh: p.nameTh,
          nameEn: p.nameEn ?? '',
          taxId: p.taxId ?? '',
          branch: p.branch ?? '',
          address: p.address ?? '',
          phone: p.phone ?? '',
          email: p.email ?? '',
          website: p.website ?? '',
          note: p.note ?? '',
          contacts: (p.contacts ?? []).map((c: any) => ({
            name: c.name,
            position: c.position ?? '',
            phone: c.phone ?? '',
            email: c.email ?? '',
            isPrimary: c.isPrimary,
          })),
          isActive: p.isActive,
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, partnerId, defaultType]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      type: form.type,
      code: form.code || undefined,
      nameTh: form.nameTh,
      nameEn: form.nameEn || undefined,
      taxId: form.taxId || undefined,
      branch: form.branch || undefined,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      note: form.note || undefined,
      contacts: form.contacts.map((c) => ({
        name: c.name,
        position: c.position || undefined,
        phone: c.phone || undefined,
        email: c.email || undefined,
        isPrimary: c.isPrimary ?? false,
      })),
      ...(partnerId ? { isActive: form.isActive } : {}),
    };
    try {
      if (partnerId) {
        await api(`/partners/${partnerId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/partners', { method: 'POST', body: JSON.stringify(payload) });
      }
      toast.success(partnerId ? 'อัปเดตแล้ว' : 'เพิ่มแล้ว');
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function addContact() {
    setForm((f) => ({ ...f, contacts: [...f.contacts, { name: '' }] }));
  }
  function removeContact(idx: number) {
    setForm((f) => ({ ...f, contacts: f.contacts.filter((_, i) => i !== idx) }));
  }
  function updateContact(idx: number, patch: Partial<ContactInput>) {
    setForm((f) => ({
      ...f,
      contacts: f.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={partnerId ? 'แก้ไขข้อมูล' : 'เพิ่ม' + (defaultType === 'CUSTOMER' ? 'ลูกค้า' : defaultType === 'VENDOR' ? 'ผู้ขาย' : 'คู่ค้า')}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] text-text-soft hover:bg-surface-3 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            form="partner-form"
            disabled={saving || loading || !form.nameTh}
            className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-text-mute">กำลังโหลด…</div>
      ) : (
        <form id="partner-form" onSubmit={onSubmit} className="grid gap-3">
          {error && (
            <div className="rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-[12.5px] text-bad">
              {error}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="ประเภท">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as PartnerType })}
                className={inputCls}
              >
                <option value="CUSTOMER">ลูกค้า</option>
                <option value="VENDOR">ผู้ขาย</option>
                <option value="BOTH">ทั้งคู่</option>
              </select>
            </Field>
            <Field label="รหัส">
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} maxLength={32} />
            </Field>
            <Field label="เลขประจำตัวผู้เสียภาษี">
              <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={`${inputCls} font-mono`} maxLength={20} />
            </Field>
          </div>
          <Field label="ชื่อภาษาไทย" required>
            <input
              required
              value={form.nameTh}
              onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
              className={inputCls}
              maxLength={200}
            />
          </Field>
          <Field label="ชื่อภาษาอังกฤษ">
            <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className={inputCls} maxLength={200} />
          </Field>
          <Field label="ที่อยู่">
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className={inputCls} maxLength={2000} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="สาขา">
              <input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={inputCls} maxLength={50} />
            </Field>
            <Field label="โทรศัพท์">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} maxLength={50} />
            </Field>
            <Field label="อีเมล">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} maxLength={120} />
            </Field>
          </div>

          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12px] text-text-soft">ผู้ติดต่อ</span>
              <button
                type="button"
                onClick={addContact}
                className="text-[12px] text-brand hover:underline"
              >
                + เพิ่มผู้ติดต่อ
              </button>
            </div>
            {form.contacts.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-surface-2 px-3 py-2 text-center text-[12px] text-text-mute">
                ยังไม่มีผู้ติดต่อ
              </div>
            ) : (
              <div className="grid gap-2">
                {form.contacts.map((c, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5"
                  >
                    <input
                      placeholder="ชื่อ"
                      value={c.name}
                      onChange={(e) => updateContact(idx, { name: e.target.value })}
                      className={`${inputCls} h-8`}
                    />
                    <input
                      placeholder="ตำแหน่ง"
                      value={c.position ?? ''}
                      onChange={(e) => updateContact(idx, { position: e.target.value })}
                      className={`${inputCls} h-8`}
                    />
                    <input
                      placeholder="โทรศัพท์"
                      value={c.phone ?? ''}
                      onChange={(e) => updateContact(idx, { phone: e.target.value })}
                      className={`${inputCls} h-8`}
                    />
                    <label className="flex items-center gap-1.5 text-[12px] text-text-soft">
                      <input
                        type="checkbox"
                        checked={c.isPrimary ?? false}
                        onChange={(e) => updateContact(idx, { isPrimary: e.target.checked })}
                      />
                      หลัก
                    </label>
                    <button
                      type="button"
                      onClick={() => removeContact(idx)}
                      className="text-[12px] text-bad hover:underline"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {partnerId && (
            <label className="mt-2 inline-flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              ใช้งานอยู่
            </label>
          )}
        </form>
      )}
    </Modal>
  );
}

const inputCls =
  'w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13.5px] outline-none focus:border-brand';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-text-soft">
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </span>
      {children}
    </label>
  );
}
