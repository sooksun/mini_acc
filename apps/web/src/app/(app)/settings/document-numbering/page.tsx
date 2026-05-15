'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { DocumentType } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface CounterRow {
  beYear: number;
  currentValue: number;
}

interface NumberingRule {
  id: string;
  type: DocumentType;
  prefix: string;
  padding: number;
  resetPolicy: 'YEARLY' | 'NEVER';
  counters: CounterRow[];
}

const TYPE_LABEL: Record<string, string> = {
  QUOTATION: 'ใบเสนอราคา',
  INVOICE: 'ใบแจ้งหนี้',
  DELIVERY_NOTE: 'ใบส่งของ',
  RECEIPT: 'ใบเสร็จรับเงิน',
  TAX_INVOICE: 'ใบกำกับภาษี',
  RECEIPT_TAX_INVOICE: 'ใบเสร็จ/ใบกำกับภาษี',
};

const RESET_LABEL = {
  YEARLY: 'รีเซ็ตทุกปี (พ.ศ.)',
  NEVER: 'ไม่รีเซ็ต',
};

export default function NumberingSettingsPage() {
  const toast = useToast();
  const [rules, setRules] = useState<NumberingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NumberingRule | null>(null);

  const role = getUser()?.role;
  const canEdit = role === 'OWNER' || role === 'ADMIN';

  async function load() {
    setLoading(true);
    try {
      const data = await api<NumberingRule[]>('/numbering/rules');
      setRules(data);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const columns: DataTableColumn<NumberingRule>[] = [
    { key: 'type', header: 'ประเภทเอกสาร', render: (r) => TYPE_LABEL[r.type] ?? r.type },
    {
      key: 'prefix',
      header: 'Prefix',
      render: (r) => <span className="font-mono text-text">{r.prefix}</span>,
    },
    {
      key: 'padding',
      header: 'จำนวนหลัก',
      align: 'right',
      render: (r) => `${r.padding} หลัก`,
    },
    {
      key: 'resetPolicy',
      header: 'รอบรีเซ็ต',
      render: (r) => RESET_LABEL[r.resetPolicy],
    },
    {
      key: 'sample',
      header: 'ตัวอย่าง',
      render: (r) => {
        const sample = String(1).padStart(r.padding, '0');
        const be = r.resetPolicy === 'YEARLY' ? '-2569' : '';
        return <span className="font-mono text-text-soft">{r.prefix}{be}-{sample}</span>;
      },
    },
    {
      key: 'counter',
      header: 'เลขล่าสุด',
      align: 'right',
      render: (r) => {
        if (r.counters.length === 0) {
          return <span className="text-text-mute">ยังไม่ใช้</span>;
        }
        const latest = r.counters[0];
        return (
          <span className="font-mono">
            {r.resetPolicy === 'YEARLY' ? `พ.ศ. ${latest!.beYear}: ` : ''}
            {latest!.currentValue}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canEdit && (
          <button
            onClick={() => setEditing(r)}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
          >
            แก้ไข
          </button>
        ),
    },
  ];

  return (
    <>
      <AppTopbar title="ตั้งค่า / เลขเอกสาร" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">การกำหนดเลขเอกสาร</h1>
          <p className="mt-1 text-[13px] text-text-mute">
            กำหนด prefix, จำนวนหลัก, และรอบรีเซ็ตของเลขเอกสารแต่ละประเภท
            (ตามรูปแบบ <span className="font-mono">PREFIX-BE_YEAR-RUNNING</span>)
          </p>
        </div>
        <DataTable
          columns={columns}
          rows={rules}
          rowKey={(r) => r.id}
          loading={loading}
          emptyTitle="ยังไม่มี rule"
          emptyDescription="seed ของระบบควรสร้าง rule ทั้ง 6 ประเภทไว้แล้ว — ติดต่อ admin หากหาย"
        />
      </div>
      <EditRuleModal
        rule={editing}
        canEdit={canEdit}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </>
  );
}

function EditRuleModal({
  rule,
  canEdit,
  onClose,
  onSaved,
}: {
  rule: NumberingRule | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [prefix, setPrefix] = useState('');
  const [padding, setPadding] = useState(4);
  const [resetPolicy, setResetPolicy] = useState<'YEARLY' | 'NEVER'>('YEARLY');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setPrefix(rule.prefix);
      setPadding(rule.padding);
      setResetPolicy(rule.resetPolicy);
    }
  }, [rule]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!rule) return;
    setSaving(true);
    try {
      await api(`/numbering/rules/${rule.type}`, {
        method: 'PATCH',
        body: JSON.stringify({ prefix, padding, resetPolicy }),
      });
      toast.success('บันทึก rule แล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!rule}
      onClose={onClose}
      title={`แก้ไขเลขเอกสาร — ${rule ? TYPE_LABEL[rule.type] : ''}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[13px]"
          >
            ยกเลิก
          </button>
          {canEdit && (
            <button
              type="submit"
              form="edit-numbering-form"
              disabled={saving}
              className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          )}
        </>
      }
    >
      <form id="edit-numbering-form" onSubmit={submit} className="grid gap-4">
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">Prefix</span>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            maxLength={8}
            pattern="[A-Z0-9]{1,8}"
            disabled={!canEdit}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[14px] uppercase outline-none focus:border-brand disabled:opacity-60"
          />
          <span className="mt-1 block text-[11.5px] text-text-mute">
            อักษรอังกฤษพิมพ์ใหญ่ + ตัวเลข ไม่เกิน 8 ตัวอักษร
          </span>
        </label>
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">จำนวนหลัก</span>
          <input
            type="number"
            min={1}
            max={8}
            value={padding}
            onChange={(e) => setPadding(Number(e.target.value))}
            disabled={!canEdit}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-brand disabled:opacity-60"
          />
          <span className="mt-1 block text-[11.5px] text-text-mute">
            ตัวอย่าง: {prefix}-2569-{String(1).padStart(padding, '0')}
          </span>
        </label>
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">รอบรีเซ็ต</span>
          <select
            value={resetPolicy}
            onChange={(e) => setResetPolicy(e.target.value as 'YEARLY' | 'NEVER')}
            disabled={!canEdit}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-brand disabled:opacity-60"
          >
            <option value="YEARLY">รีเซ็ตทุกปี (พ.ศ.)</option>
            <option value="NEVER">ไม่รีเซ็ต — เลขต่อเนื่องตลอดอายุบริษัท</option>
          </select>
        </label>
        {!canEdit && (
          <div className="rounded-md border border-warn/30 bg-warn/5 p-2 text-[12px] text-warn">
            เฉพาะ OWNER / ADMIN เท่านั้นที่แก้ไขได้
          </div>
        )}
      </form>
    </Modal>
  );
}
