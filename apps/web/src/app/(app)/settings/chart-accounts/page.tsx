'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { AccountType, NormalBalance } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { useRegisterPageDescriptor } from '@/contexts/AssistantContext';

interface ChartAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  isSystem: boolean;
  isActive: boolean;
  note: string | null;
}

const TYPE_LABEL: Record<AccountType, string> = {
  ASSET: 'สินทรัพย์',
  LIABILITY: 'หนี้สิน',
  EQUITY: 'ส่วนของผู้ถือหุ้น',
  REVENUE: 'รายได้',
  EXPENSE: 'ค่าใช้จ่าย',
};

const TYPE_OPTIONS: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export default function ChartAccountsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [deleting, setDeleting] = useState<ChartAccount | null>(null);

  const role = getUser()?.role;
  const canManage = role === 'OWNER' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      setAccounts(await api<ChartAccount[]>('/chart-accounts'));
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดผังบัญชีล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api(`/chart-accounts/${deleting.id}`, { method: 'DELETE' });
      toast.success('ลบบัญชีแล้ว');
      setDeleting(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'ลบไม่สำเร็จ');
    }
  }

  const columns: DataTableColumn<ChartAccount>[] = [
    {
      key: 'code',
      header: 'รหัส',
      render: (a) => <span className="font-mono text-[13px] text-text">{a.code}</span>,
    },
    {
      key: 'name',
      header: 'ชื่อบัญชี',
      render: (a) => (
        <div className="flex items-center gap-2">
          <span className="text-text">{a.name}</span>
          {a.isSystem && (
            <span className="rounded-full border border-border bg-surface-3 px-1.5 py-px text-[10px] text-text-mute">
              ระบบ
            </span>
          )}
        </div>
      ),
    },
    { key: 'type', header: 'ประเภท', render: (a) => <span className="text-text-soft">{TYPE_LABEL[a.type]}</span> },
    {
      key: 'normalBalance',
      header: 'ยอดปกติ',
      render: (a) => <span className="text-text-mute">{a.normalBalance === 'DEBIT' ? 'เดบิต' : 'เครดิต'}</span>,
    },
    {
      key: 'isActive',
      header: 'สถานะ',
      render: (a) =>
        a.isActive ? (
          <span className="inline-flex rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11.5px] text-ok">ใช้งาน</span>
        ) : (
          <span className="inline-flex rounded-full border border-text-mute/40 bg-surface-3 px-2 py-0.5 text-[11.5px] text-text-mute">ปิดใช้งาน</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        canManage && (
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setEditing(a)}
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
            >
              แก้ไข
            </button>
            {!a.isSystem && (
              <button
                onClick={() => setDeleting(a)}
                className="rounded-md border border-bad/40 bg-bad/5 px-2.5 py-1 text-[12px] text-bad hover:bg-bad/10"
              >
                ลบ
              </button>
            )}
          </div>
        ),
    },
  ];

  return (
    <>
      <AppTopbar title="ตั้งค่า / ผังบัญชี" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ผังบัญชี</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              บัญชีระบบใช้กับการลงบัญชีอัตโนมัติ (แก้ได้เฉพาะชื่อ) — เพิ่มบัญชีของคุณเองเพื่อใช้ในรายการสมุดรายวัน
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + เพิ่มบัญชี
            </button>
          )}
        </div>

        <div className="mt-5">
          <DataTable
            columns={columns}
            rows={accounts}
            rowKey={(a) => a.id}
            loading={loading}
            emptyTitle="ยังไม่มีบัญชี"
          />
        </div>
      </div>

      <AccountModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />
      <AccountModal
        account={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="ลบบัญชี"
        description={`ลบบัญชี ${deleting?.code} ${deleting?.name}? (ลบได้เฉพาะบัญชีที่ยังไม่ถูกใช้ในสมุดรายวัน)`}
        confirmLabel="ลบ"
        destructive
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function AccountModal({
  open,
  account,
  onClose,
  onSaved,
}: {
  open?: boolean;
  account?: ChartAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!account;
  const isSystem = account?.isSystem ?? false;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('EXPENSE');
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account) {
      setCode(account.code);
      setName(account.name);
      setType(account.type);
      setIsActive(account.isActive);
      setNote(account.note ?? '');
    } else if (open) {
      setCode('');
      setName('');
      setType('EXPENSE');
      setIsActive(true);
      setNote('');
    }
  }, [account, open]);

  useRegisterPageDescriptor(
    () =>
      !(isEdit ? !!account : !!open)
        ? null
        : {
            route: '/settings/chart-accounts',
            title: isEdit ? `แก้ไขบัญชี ${account?.code ?? ''}` : 'เพิ่มบัญชีใหม่',
            operation: isEdit ? 'edit' : 'create',
            fields: [
              ...(!isEdit ? [{ name: 'code', label: 'รหัสบัญชี (3-20 หลัก)', type: 'text' as const, required: true }] : []),
              { name: 'name', label: 'ชื่อบัญชี', type: 'text', required: true },
              ...(!isSystem
                ? [{ name: 'type', label: 'ประเภท', type: 'select' as const, options: TYPE_OPTIONS.map((t) => ({ value: t, label: TYPE_LABEL[t] })) }]
                : []),
              { name: 'note', label: 'หมายเหตุ', type: 'text' },
            ],
            getCurrentValues: () => ({ code, name, type, note }),
            applyValues: (p) => {
              if (!isEdit && p.code !== undefined) setCode(String(p.code).replace(/\D/g, '').slice(0, 20));
              if (p.name !== undefined) setName(String(p.name));
              if (!isSystem && typeof p.type === 'string' && (TYPE_OPTIONS as string[]).includes(p.type)) setType(p.type as AccountType);
              if (p.note !== undefined) setNote(String(p.note));
            },
          },
    [open, account, isEdit, isSystem],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        // Always send note (even ''), so clearing it reaches the server's '' → null path.
        const body: Record<string, unknown> = { name: name.trim(), note: note.trim() };
        if (!isSystem) {
          body.type = type;
          body.isActive = isActive;
        }
        await api(`/chart-accounts/${account!.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success('บันทึกบัญชีแล้ว');
      } else {
        await api('/chart-accounts', {
          method: 'POST',
          body: JSON.stringify({ code: code.trim(), name: name.trim(), type, note: note.trim() || undefined }),
        });
        toast.success('เพิ่มบัญชีแล้ว');
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={isEdit ? !!account : !!open}
      onClose={onClose}
      title={isEdit ? `แก้ไขบัญชี — ${account?.code}` : 'เพิ่มบัญชีใหม่'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="chart-account-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="chart-account-form" onSubmit={submit} className="grid gap-4">
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">รหัสบัญชี (ตัวเลข 3-20 หลัก)</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={isEdit}
            required
            pattern="\d{3,20}"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[13.5px] outline-none focus:border-brand disabled:opacity-60"
            placeholder="เช่น 6000"
          />
          {isEdit && <span className="mt-1 block text-[11px] text-text-mute">เปลี่ยนรหัสบัญชีไม่ได้</span>}
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">ชื่อบัญชี</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">ประเภท</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            disabled={isSystem}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-60"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]} ({t})
              </option>
            ))}
          </select>
          {isSystem && <span className="mt-1 block text-[11px] text-text-mute">บัญชีระบบเปลี่ยนประเภทไม่ได้</span>}
        </label>

        {isEdit && !isSystem && (
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">สถานะ</span>
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            >
              <option value="active">ใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </label>
        )}

        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">หมายเหตุ (ถ้ามี)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
      </form>
    </Modal>
  );
}
