'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppTopbar } from '@/components/AppTopbar';
import { AiConfidenceBadge } from '@/components/ui/AiConfidenceBadge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatThaiCurrency, formatThaiDateShort } from '@/lib/format';

interface BankLine {
  id: string;
  bankAccount: string;
  postedAt: string;
  side: 'DEBIT' | 'CREDIT';
  amount: string;
  balance: string | null;
  description: string;
  reference: string | null;
  matchedPaymentId: string | null;
  matchedAt: string | null;
  matchConfidence: string | null;
  matchedPayment: {
    id: string;
    direction: 'IN' | 'OUT';
    paymentDate: string;
    amount: string;
    reference: string | null;
    partner: { id: string; nameTh: string; taxId: string | null };
  } | null;
}

interface Candidate {
  id: string;
  direction: 'IN' | 'OUT';
  partner: { id: string; nameTh: string; taxId: string | null };
  amount: string;
  whtAmount: string;
  paymentDate: string;
  reference: string | null;
  amountMatch: boolean;
  daysOff: number;
}

export default function BankPage() {
  const toast = useToast();
  const [rows, setRows] = useState<BankLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'matched'>('unmatched');
  const [importOpen, setImportOpen] = useState(false);
  const [matching, setMatching] = useState<BankLine | null>(null);

  const role = getUser()?.role;
  const canImport = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('matchStatus', filter);
      params.set('take', '500');
      const result = await api<{ items: BankLine[]; total: number }>(
        `/bank/lines?${params.toString()}`,
      );
      setRows(result.items);
      setTotal(result.total);
    } catch (e: any) {
      toast.error(e.message ?? 'โหลดข้อมูลธนาคารล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function unmatch(line: BankLine) {
    if (!confirm('ยกเลิกการจับคู่กับ Payment นี้?')) return;
    try {
      await api(`/bank/lines/${line.id}/unmatch`, { method: 'POST' });
      toast.success('ยกเลิกการจับคู่แล้ว');
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'ยกเลิกล้มเหลว');
    }
  }

  const matchedCount = rows.filter((r) => r.matchedPaymentId).length;
  const unmatchedCount = rows.length - matchedCount;

  const columns: DataTableColumn<BankLine>[] = [
    { key: 'date', header: 'วันที่', render: (l) => formatThaiDateShort(l.postedAt) },
    { key: 'bank', header: 'บัญชี', render: (l) => <span className="font-mono">{l.bankAccount}</span> },
    {
      key: 'side',
      header: 'ฝั่ง',
      render: (l) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${
            l.side === 'CREDIT'
              ? 'border-ok/40 bg-ok/10 text-ok'
              : 'border-warn/40 bg-warn/10 text-warn'
          }`}
        >
          {l.side === 'CREDIT' ? 'เข้า' : 'ออก'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'จำนวน',
      align: 'right',
      numeric: true,
      render: (l) => formatThaiCurrency(l.amount),
    },
    {
      key: 'desc',
      header: 'รายละเอียด',
      render: (l) => (
        <div>
          <div className="text-text">{l.description}</div>
          {l.reference && <div className="font-mono text-[11px] text-text-mute">{l.reference}</div>}
        </div>
      ),
    },
    {
      key: 'match',
      header: 'การจับคู่',
      render: (l) =>
        l.matchedPayment ? (
          <div>
            <div className="font-medium text-text">{l.matchedPayment.partner.nameTh}</div>
            <div className="flex items-center gap-2 text-[11.5px] text-text-mute">
              <span>{formatThaiCurrency(l.matchedPayment.amount)}</span>
              {l.matchConfidence && (
                <AiConfidenceBadge score={Number(l.matchConfidence)} />
              )}
            </div>
          </div>
        ) : (
          <span className="text-warn">ยังไม่จับคู่</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (l) =>
        canImport ? (
          l.matchedPaymentId ? (
            <button
              onClick={() => unmatch(l)}
              className="rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1 text-[12px] text-warn hover:bg-warn/10"
            >
              ยกเลิกการจับคู่
            </button>
          ) : (
            <button
              onClick={() => setMatching(l)}
              className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90"
            >
              จับคู่
            </button>
          )
        ) : null,
    },
  ];

  return (
    <>
      <AppTopbar title="กระทบยอดบัญชีธนาคาร" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">กระทบยอดบัญชีธนาคาร</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              นำเข้ารายการธนาคาร — ระบบจับคู่กับ Payment อัตโนมัติ (เทียบยอด + วันที่ ±5 วัน)
            </p>
          </div>
          {canImport && (
            <button
              onClick={() => setImportOpen(true)}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + นำเข้า Statement
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatCard label="รายการในมุมมองนี้" value={String(total)} />
          <StatCard
            label="จับคู่แล้ว"
            value={String(matchedCount)}
            tone={matchedCount > 0 ? 'ok' : 'default'}
          />
          <StatCard
            label="ยังไม่จับคู่"
            value={String(unmatchedCount)}
            tone={unmatchedCount > 0 ? 'warn' : 'ok'}
          />
        </div>

        <div className="mt-5">
          <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
            แสดง
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'unmatched' | 'matched')}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-brand"
            >
              <option value="unmatched">ยังไม่จับคู่</option>
              <option value="matched">จับคู่แล้ว</option>
              <option value="all">ทั้งหมด</option>
            </select>
          </label>
        </div>

        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(l) => l.id}
            loading={loading}
            emptyTitle="ไม่มีรายการ"
            emptyDescription={canImport ? 'กดปุ่ม "นำเข้า Statement" เพื่อเริ่มต้น' : undefined}
          />
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={() => {
          setImportOpen(false);
          load();
        }}
      />

      <MatchModal
        line={matching}
        onClose={() => setMatching(null)}
        onSaved={() => {
          setMatching(null);
          load();
        }}
      />
    </>
  );
}

function ImportModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [bankAccount, setBankAccount] = useState('SCB-001');
  const [csv, setCsv] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setBankAccount('SCB-001');
      setFile(null);
      setCsv(
        // Helpful starter — operator pastes real statement rows here.
        'postedAt,side,amount,description,reference\n2026-08-10,DEBIT,1500.00,Vendor payment,REF001\n',
      );
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!bankAccount.trim()) {
      toast.error('กรุณากรอกบัญชีธนาคาร');
      return;
    }
    setSaving(true);
    try {
      type ImportResult = { imported: number; autoMatched: number; unmatched: number };
      let result: ImportResult;
      if (file) {
        // Upload the raw .csv — the server parser handles debit/credit columns,
        // Thai headers, and Buddhist-era dates.
        const fd = new FormData();
        fd.append('bankAccount', bankAccount.trim());
        fd.append('file', file);
        result = await api<ImportResult>('/bank/import-csv', { method: 'POST', body: fd });
      } else {
        const lines = parseCsv(csv);
        if (lines.length === 0) {
          toast.error('CSV ว่าง — ต้องมีอย่างน้อย 1 บรรทัดข้อมูล หรือเลือกไฟล์ .csv');
          return;
        }
        result = await api<ImportResult>('/bank/import', {
          method: 'POST',
          body: JSON.stringify({ bankAccount: bankAccount.trim(), lines }),
        });
      }
      toast.success(
        `นำเข้า ${result.imported} รายการ · จับคู่อัตโนมัติ ${result.autoMatched} · ค้าง ${result.unmatched}`,
      );
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'นำเข้าล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="นำเข้ารายการธนาคาร (CSV)"
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="import-bank-form"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {saving ? 'กำลังนำเข้า…' : 'นำเข้า + จับคู่อัตโนมัติ'}
          </button>
        </>
      }
    >
      <form id="import-bank-form" onSubmit={submit} className="space-y-4">
        <label>
          <span className="mb-1 block text-[12.5px] text-text-soft">บัญชีธนาคาร</span>
          <input
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-soft">อัปโหลดไฟล์ .csv (แนะนำ)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-text-soft hover:file:bg-surface-2"
          />
          <div className="mt-1 text-[11.5px] text-text-mute">
            รองรับคอลัมน์ <code className="font-mono">date/วันที่</code>,{' '}
            <code className="font-mono">debit/credit (ถอน/ฝาก)</code> หรือ{' '}
            <code className="font-mono">side+amount</code>,{' '}
            <code className="font-mono">description/รายละเอียด</code> — วันที่รับทั้ง ค.ศ. และ พ.ศ.
          </div>
          {file && (
            <div className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12.5px]">
              <span className="font-medium">{file.name}</span>
              <span className="ml-2 text-text-mute">({(file.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="ml-3 text-[11.5px] text-bad hover:underline"
              >
                ลบไฟล์
              </button>
            </div>
          )}
        </label>

        <div className="relative">
          <div className="absolute inset-x-0 top-1/2 border-t border-border" />
          <div className="relative mx-auto w-fit bg-surface px-3 text-[11px] text-text-mute">
            หรือวาง CSV เอง
          </div>
        </div>

        <label className={file ? 'pointer-events-none block opacity-40' : 'block'}>
          <span className="mb-1 block text-[12.5px] text-text-soft">
            วาง CSV — header แถวแรก:
            <code className="ml-1 font-mono text-[11px]">postedAt,side,amount,description,reference</code>
          </span>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            disabled={!!file}
            spellCheck={false}
            className="min-h-40 w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[12px] outline-none focus:border-brand"
          />
          <div className="mt-1 text-[11.5px] text-text-mute">
            postedAt = YYYY-MM-DD · side = DEBIT (ออก) หรือ CREDIT (เข้า) · reference (optional)
          </div>
        </label>
      </form>
    </Modal>
  );
}

function parseCsv(text: string): {
  postedAt: string;
  side: 'DEBIT' | 'CREDIT';
  amount: string;
  description: string;
  reference?: string;
}[] {
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (rows.length === 0) return [];
  const header = rows[0]!.split(',').map((c) => c.trim().toLowerCase());
  const idx = {
    postedAt: header.indexOf('postedat'),
    side: header.indexOf('side'),
    amount: header.indexOf('amount'),
    description: header.indexOf('description'),
    reference: header.indexOf('reference'),
  };
  const result: ReturnType<typeof parseCsv> = [];
  for (const row of rows.slice(1)) {
    const cols = row.split(',').map((c) => c.trim());
    const side = cols[idx.side]?.toUpperCase();
    if (side !== 'DEBIT' && side !== 'CREDIT') continue;
    const postedAt = cols[idx.postedAt];
    const amount = cols[idx.amount];
    const description = cols[idx.description];
    if (!postedAt || !amount || !description) continue;
    result.push({
      postedAt,
      side: side as 'DEBIT' | 'CREDIT',
      amount,
      description,
      reference: idx.reference >= 0 ? cols[idx.reference] || undefined : undefined,
    });
  }
  return result;
}

function MatchModal({
  line,
  onClose,
  onSaved,
}: {
  line: BankLine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState<string | null>(null);

  useEffect(() => {
    if (!line) return;
    setLoading(true);
    api<Candidate[]>(`/bank/lines/${line.id}/candidates`)
      .then(setCandidates)
      .catch((e) => toast.error(e.message ?? 'โหลด candidate ล้มเหลว'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  async function match(paymentId: string) {
    if (!line) return;
    setMatching(paymentId);
    try {
      await api(`/bank/lines/${line.id}/match`, {
        method: 'POST',
        body: JSON.stringify({ paymentId }),
      });
      toast.success('จับคู่กับ Payment แล้ว');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'จับคู่ล้มเหลว');
    } finally {
      setMatching(null);
    }
  }

  return (
    <Modal
      open={!!line}
      onClose={onClose}
      title="จับคู่ Bank Line กับ Payment"
      size="xl"
      footer={
        <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px]">
          ปิด
        </button>
      }
    >
      {line && (
        <div className="space-y-4">
          <div className="rounded-md border border-info/30 bg-info/5 p-3 text-[13px]">
            <div className="font-medium text-text">{line.description}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11.5px] text-text-mute">
              <span>{formatThaiDateShort(line.postedAt)}</span>
              <span className="font-mono">{line.bankAccount}</span>
              <span className="font-mono font-medium text-text">
                {line.side === 'CREDIT' ? '+' : '-'}
                {formatThaiCurrency(line.amount)}
              </span>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[12.5px] font-medium text-text-soft">
              Payment ที่อาจตรงกัน (ภายใน ±5 วัน)
            </div>
            {loading ? (
              <div className="rounded-md border border-border p-6 text-center text-text-mute">กำลังโหลด…</div>
            ) : candidates.length === 0 ? (
              <div className="rounded-md border border-border bg-surface-2 p-6 text-center text-[13px] text-text-mute">
                ไม่พบ Payment ที่เข้าเกณฑ์ — ลองตรวจสอบใน /payments
              </div>
            ) : (
              <div className="space-y-2">
                {candidates.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between gap-3 rounded-md border p-3 text-[13px] ${
                      c.amountMatch ? 'border-ok/40 bg-ok/5' : 'border-border bg-surface'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-text">
                        {c.partner.nameTh}
                        <span className="ml-2 font-mono text-[11px] text-text-mute">
                          {c.direction === 'IN' ? 'รับ' : 'จ่าย'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-text-mute">
                        {formatThaiDateShort(c.paymentDate)} · {c.reference ?? 'ไม่มีอ้างอิง'} ·{' '}
                        {c.daysOff === 0 ? 'วันเดียวกัน' : `ห่าง ${c.daysOff} วัน`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium">{formatThaiCurrency(c.amount)}</div>
                      {Number(c.whtAmount) > 0 && (
                        <div className="text-[11px] text-warn">
                          WHT {formatThaiCurrency(c.whtAmount)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => match(c.id)}
                      disabled={matching === c.id}
                      className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
                    >
                      {matching === c.id ? 'กำลังจับคู่…' : 'จับคู่'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
