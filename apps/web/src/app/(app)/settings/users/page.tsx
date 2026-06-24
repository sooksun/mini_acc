'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Role } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiDateTime } from '@/lib/format';
import { useRegisterPageDescriptor } from '@/contexts/AssistantContext';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  initial: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'เจ้าของกิจการ',
  ADMIN: 'ผู้ช่วย/ธุรการ',
  ACCOUNTANT: 'นักบัญชี',
  VIEWER: 'ดูอย่างเดียว',
  AI_AGENT: 'AI Agent',
};

const ROLE_TONE: Record<Role, string> = {
  OWNER: 'border-brand/40 bg-brand/10 text-brand',
  ADMIN: 'border-info/40 bg-info/10 text-info',
  ACCOUNTANT: 'border-ok/40 bg-ok/10 text-ok',
  VIEWER: 'border-text-mute/40 bg-surface-3 text-text-soft',
  AI_AGENT: 'border-warn/40 bg-warn/10 text-warn',
};

const ROLE_OPTIONS: Role[] = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER'];

export default function UsersSettingsPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const currentUser = getUser();
  const role = currentUser?.role;
  const canManage = role === 'OWNER' || role === 'ADMIN';

  async function load() {
    setLoading(true);
    try {
      const data = await api<UserRow[]>('/users');
      setUsers(data);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดผู้ใช้ล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const columns: DataTableColumn<UserRow>[] = [
    {
      key: 'user',
      header: 'ผู้ใช้',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <div
            className={`grid h-8 w-8 place-items-center rounded-md text-[12px] font-semibold ${
              u.isActive ? 'bg-brand-gradient text-white' : 'bg-surface-3 text-text-mute'
            }`}
          >
            {u.initial ?? u.fullName.slice(0, 1)}
          </div>
          <div>
            <div className="font-medium text-text">{u.fullName}</div>
            <div className="font-mono text-[11px] text-text-mute">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'บทบาท',
      render: (u) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${ROLE_TONE[u.role]}`}
        >
          {ROLE_LABEL[u.role]}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (u) =>
        u.isActive ? (
          <span className="inline-flex rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11.5px] text-ok">
            ใช้งาน
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[11.5px] text-bad">
            ปิดใช้งาน
          </span>
        ),
    },
    {
      key: 'createdAt',
      header: 'สร้างเมื่อ',
      render: (u) => <span className="text-text-soft">{formatThaiDateTime(u.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) =>
        canManage && (role === 'OWNER' || u.role !== 'OWNER') && (
          <button
            onClick={() => setEditing(u)}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
          >
            แก้ไข
          </button>
        ),
    },
  ];

  return (
    <>
      <AppTopbar title="ตั้งค่า / ผู้ใช้และสิทธิ์" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ผู้ใช้และสิทธิ์</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              จัดการผู้ใช้ที่เข้าถึงระบบ — รวมถึง role, password reset, การปิด/เปิดบัญชี
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + เพิ่มผู้ใช้
            </button>
          )}
        </div>

        <div className="mt-5">
          <DataTable
            columns={columns}
            rows={users}
            rowKey={(u) => u.id}
            loading={loading}
            emptyTitle="ยังไม่มีผู้ใช้คนอื่น"
            emptyDescription={canManage ? 'กดปุ่ม "เพิ่มผู้ใช้" ด้านบนเพื่อสร้างบัญชีใหม่' : undefined}
          />
        </div>
      </div>

      <CreateUserModal
        open={creating}
        currentUserRole={role}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />

      <EditUserModal
        user={editing}
        currentUserId={currentUser?.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </>
  );
}

function CreateUserModal({
  open,
  currentUserRole,
  onClose,
  onSaved,
}: {
  open: boolean;
  currentUserRole?: Role;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    initial: '',
    role: 'ADMIN' as Role,
  });
  const allowedRoleOptions = currentUserRole === 'OWNER' ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r !== 'OWNER');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ email: '', password: '', fullName: '', initial: '', role: 'ADMIN' });
  }, [open]);

  // Assistant fills only non-sensitive fields — never email or password.
  useRegisterPageDescriptor(
    () =>
      !open
        ? null
        : {
            route: '/settings/users',
            title: 'เพิ่มผู้ใช้',
            operation: 'create',
            fields: [
              { name: 'fullName', label: 'ชื่อ-นามสกุล', type: 'text', required: true },
              { name: 'initial', label: 'ตัวย่อ (1-3 ตัว)', type: 'text' },
              { name: 'role', label: 'บทบาท', type: 'select', options: allowedRoleOptions.map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
            ],
            getCurrentValues: () => ({ fullName: form.fullName, initial: form.initial, role: form.role }),
            applyValues: (p) =>
              setForm((v) => ({
                ...v,
                ...(p.fullName !== undefined ? { fullName: String(p.fullName) } : {}),
                ...(p.initial !== undefined ? { initial: String(p.initial).slice(0, 3) } : {}),
                ...(typeof p.role === 'string' && (allowedRoleOptions as string[]).includes(p.role) ? { role: p.role as Role } : {}),
              })),
          },
    [open, allowedRoleOptions.length],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          fullName: form.fullName.trim(),
          initial: form.initial.trim() || undefined,
          role: form.role,
        }),
      });
      toast.success('เพิ่มผู้ใช้แล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'เพิ่มผู้ใช้ล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มผู้ใช้ใหม่"
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
            form="create-user-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'สร้างผู้ใช้'}
          </button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field
          label="ชื่อ-นามสกุล"
          value={form.fullName}
          onChange={(fullName) => setForm((v) => ({ ...v, fullName }))}
          required
        />
        <Field
          label="ตัวย่อ (1-3 ตัว, optional)"
          value={form.initial}
          onChange={(initial) => setForm((v) => ({ ...v, initial }))}
        />
        <Field
          label="อีเมล"
          type="email"
          value={form.email}
          onChange={(email) => setForm((v) => ({ ...v, email }))}
          required
        />
        <Field
          label="รหัสผ่าน (≥ 8 ตัวอักษร)"
          type="password"
          value={form.password}
          onChange={(password) => setForm((v) => ({ ...v, password }))}
          required
          minLength={8}
        />
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">บทบาท</span>
          <select
            value={form.role}
            onChange={(e) => setForm((v) => ({ ...v, role: e.target.value as Role }))}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          >
            {allowedRoleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]} ({r})
              </option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  currentUserId,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  currentUserId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [initial, setInitial] = useState('');
  const [role, setRole] = useState<Role>('ADMIN');
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setInitial(user.initial ?? '');
      setRole(user.role);
      setIsActive(user.isActive);
      setPassword('');
    }
  }, [user]);

  const isSelf = user?.id === currentUserId;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fullName: fullName.trim(),
        initial: initial.trim() || undefined,
      };
      if (!isSelf) {
        body.role = role;
        body.isActive = isActive;
      }
      if (password) body.password = password;

      await api(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      toast.success('บันทึกผู้ใช้แล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`แก้ไขผู้ใช้ — ${user?.fullName ?? ''}`}
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
            form="edit-user-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      {user && (
        <form id="edit-user-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-md border border-border bg-surface-2 p-3 text-[12.5px] text-text-soft">
            อีเมล: <span className="font-mono text-text">{user.email}</span>
            <span className="ml-3 text-text-mute">(เปลี่ยนอีเมลไม่ได้ ต้องสร้างผู้ใช้ใหม่)</span>
          </div>

          <Field
            label="ชื่อ-นามสกุล"
            value={fullName}
            onChange={setFullName}
            required
          />
          <Field
            label="ตัวย่อ"
            value={initial}
            onChange={setInitial}
          />

          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">บทบาท</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={isSelf}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-60"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]} ({r})
                </option>
              ))}
            </select>
            {isSelf && (
              <span className="mt-1 block text-[11px] text-text-mute">
                ไม่อนุญาตให้เปลี่ยน role ของตัวเอง
              </span>
            )}
          </label>

          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">สถานะ</span>
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
              disabled={isSelf}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-60"
            >
              <option value="active">ใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
            {isSelf && (
              <span className="mt-1 block text-[11px] text-text-mute">
                ไม่อนุญาตให้ปิดบัญชีตัวเอง
              </span>
            )}
          </label>

          <Field
            label="ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)"
            type="password"
            value={password}
            onChange={setPassword}
            minLength={8}
          />
        </form>
      )}
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label>
      <span className="mb-1 block text-[12.5px] text-text-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
      />
    </label>
  );
}
