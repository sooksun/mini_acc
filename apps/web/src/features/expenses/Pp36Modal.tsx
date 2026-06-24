'use client';

import { useEffect, useState } from 'react';
import { Empty } from '@/components/ui/Empty';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatThaiCurrency } from '@/lib/format';
import { periodLabel } from './expense-receipts.form';
import type { ForeignTaxObligation } from './expense-receipts.types';
import { WHT_BORNE_LABEL } from './expense-receipts.types';

export function Pp36Modal({
  open,
  onClose,
  canFile,
}: {
  open: boolean;
  onClose: () => void;
  canFile: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState<ForeignTaxObligation[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'FILED' | ''>('PENDING');
  const [kindFilter, setKindFilter] = useState<'' | 'PP36_VAT' | 'PND54_WHT'>('');
  const [filing, setFiling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kindFilter) params.set('kind', kindFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('take', '100');
      const res = await api<{ items: ForeignTaxObligation[]; total: number }>(
        `/expense-receipts/pp36?${params.toString()}`,
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
  }, [open, statusFilter, kindFilter]);

  async function file(id: string) {
    setFiling(id);
    try {
      await api(`/expense-receipts/pp36/${id}/file`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast.success('บันทึกการนำส่งภาษีแล้ว');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setFiling(null);
    }
  }

  const pendingTax = items
    .filter((i) => i.status === 'PENDING')
    .reduce((sum, i) => sum + Number(i.taxAmount || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ภาษีนำส่ง — ภ.พ.36 (VAT) / ภ.ง.ด.54 (WHT)"
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
          <div className="flex items-center gap-2">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as '' | 'PP36_VAT' | 'PND54_WHT')}
              className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
            >
              <option value="">ทุกประเภท</option>
              <option value="PP36_VAT">ภ.พ.36 (VAT)</option>
              <option value="PND54_WHT">ภ.ง.ด.54 (WHT)</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'PENDING' | 'FILED' | '')}
              className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
            >
              <option value="PENDING">รอนำส่ง</option>
              <option value="FILED">นำส่งแล้ว</option>
              <option value="">ทั้งหมด</option>
            </select>
          </div>
          {statusFilter !== 'FILED' && (
            <div className="text-[12.5px] text-text-soft">
              รวมที่ต้องนำส่ง:{' '}
              <span className="font-mono font-semibold text-text">
                {formatThaiCurrency(pendingTax.toFixed(2))}
              </span>{' '}
              บาท
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">ผู้ขาย / เอกสาร</th>
                <th className="px-3 py-2 font-medium">งวดรายจ่าย</th>
                <th className="px-3 py-2 font-medium">งวดยื่น</th>
                <th className="px-3 py-2 text-right font-medium">ฐาน (บาท)</th>
                <th className="px-3 py-2 text-right font-medium">ภาษี</th>
                <th className="px-3 py-2 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8">
                    <Empty
                      title="ไม่มีรายการ ภ.พ.36"
                      description="ลงรายจ่ายต่างประเทศ (บริการ ใช้ในไทย) ที่ติ๊ก ภ.พ.36 เพื่อให้ระบบตั้งยอดให้"
                    />
                  </td>
                </tr>
              ) : (
                items.map((o) => (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${
                          o.kind === 'PP36_VAT'
                            ? 'border-info/40 bg-info/10 text-info'
                            : 'border-warn/40 bg-warn/10 text-warn'
                        }`}
                      >
                        {o.kind === 'PP36_VAT' ? 'ภ.พ.36' : 'ภ.ง.ด.54'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{o.expenseRecord?.vendor?.nameTh ?? '—'}</div>
                      <div className="text-[11px] text-text-mute">
                        {o.expenseRecord?.documentNumber ?? o.expenseRecord?.category ?? ''}
                        {o.kind === 'PND54_WHT' && o.expenseRecord?.foreignWhtBorneBy
                          ? ` · ${WHT_BORNE_LABEL[o.expenseRecord.foreignWhtBorneBy]}`
                          : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-text-soft">
                      {periodLabel(o.expensePeriodYear, o.expensePeriodMonth)}
                    </td>
                    <td className="px-3 py-2 text-text-soft">
                      {periodLabel(o.filePeriodYear, o.filePeriodMonth)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatThaiCurrency(o.baseAmount)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatThaiCurrency(o.taxAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      {o.status === 'PENDING' ? (
                        canFile ? (
                          <button
                            onClick={() => file(o.id)}
                            disabled={filing === o.id}
                            className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {filing === o.id ? 'กำลังบันทึก…' : 'นำส่งแล้ว'}
                          </button>
                        ) : (
                          <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
                            รอนำส่ง
                          </span>
                        )
                      ) : (
                        <span className="rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] text-ok">
                          นำส่งแล้ว
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
          ภ.พ.36 / ภ.ง.ด.54 ยื่นภายในวันที่ 7 ของเดือนถัดไป — VAT จาก ภ.พ.36 ตั้งเป็นภาษีซื้อใน ภ.พ.30
          และ ภ.ง.ด.54 บันทึกเป็น WHT (หนังสือรับรอง 50 ทวิ + รายงานออกได้ที่หน้า ภาษี VAT/WHT)
        </p>
      </div>
    </Modal>
  );
}