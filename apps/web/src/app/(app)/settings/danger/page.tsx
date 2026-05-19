'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppTopbar } from '@/components/AppTopbar';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';

const CONFIRM_PHRASE = 'รีเซ็ตข้อมูล';

const KEPT = [
  'ข้อมูลบริษัท (ชื่อ ที่อยู่ เลขผู้เสียภาษี ประวัติ VAT)',
  'บัญชีผู้ใช้ทั้งหมด',
  'รายชื่อลูกค้า / ผู้ขาย',
  'รายการสินค้าและบริการ',
  'โครงการ',
  'กฎการเลขเอกสาร (prefix และ reset policy)',
];

const CLEARED = [
  'เอกสารขาย ทุกประเภท (ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ฯลฯ)',
  'ใบเสร็จค่าใช้จ่าย และรายการบันทึกค่าใช้จ่าย',
  'การชำระเงิน',
  'รายการบัญชีแยกประเภท (Journal)',
  'ความเคลื่อนไหวสินค้าคงคลัง',
  'ทรัพย์สินถาวร',
  'รายการ VAT / WHT',
  'รายการเสี่ยง (Risk)',
  'ข้อเสนอแนะ AI',
  'รายการธนาคาร (Bank statement)',
  'งวดบัญชี',
  'ตัวนับเลขเอกสาร (รีเซ็ตกลับเป็น 0001)',
  'ประวัติ Audit log',
];

interface ResetResult {
  deletedCounts: {
    salesDocuments: number;
    expenseReceipts: number;
    payments: number;
    journalEntries: number;
    inventoryMovements: number;
  };
}

export default function DangerZonePage() {
  const router = useRouter();
  const toast = useToast();
  const role = getUser()?.role;

  const [phrase, setPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);

  if (role !== 'OWNER') {
    return (
      <>
        <AppTopbar title="โซนอันตราย" />
        <div className="flex-1 px-7 pb-16 pt-6">
          <div className="rounded-lg border border-bad/40 bg-bad/5 px-5 py-4 text-[13.5px] text-bad">
            เฉพาะ OWNER เท่านั้นที่เข้าถึงหน้านี้ได้
          </div>
        </div>
      </>
    );
  }

  async function doReset() {
    setLoading(true);
    try {
      const res = await api<ResetResult>('/system/reset-baseline', {
        method: 'POST',
        body: JSON.stringify({ confirmText: 'RESET' }),
      });
      setResult(res);
      toast.success('รีเซ็ตข้อมูลสำเร็จ');
    } catch (e: any) {
      toast.error(e.message ?? 'รีเซ็ตล้มเหลว');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const c = result.deletedCounts;
    return (
      <>
        <AppTopbar title="โซนอันตราย" />
        <div className="flex-1 px-7 pb-16 pt-6">
          <div className="mx-auto max-w-lg">
            <div className="rounded-xl border border-ok/40 bg-ok/5 p-6 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok/15">
                <svg className="h-6 w-6 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-[16px] font-semibold text-ok">รีเซ็ตข้อมูลสำเร็จ</div>
              <p className="mt-1 text-[12.5px] text-text-soft">ระบบพร้อมสำหรับการใช้งานจริงแล้ว</p>

              <div className="mt-5 space-y-2 rounded-lg border border-border bg-surface p-4 text-left text-[12.5px]">
                <div className="font-medium text-text-soft">สรุปข้อมูลที่ล้าง</div>
                {[
                  ['เอกสารขาย', c.salesDocuments],
                  ['ใบเสร็จค่าใช้จ่าย', c.expenseReceipts],
                  ['การชำระเงิน', c.payments],
                  ['รายการบัญชี (Journal)', c.journalEntries],
                  ['ความเคลื่อนไหวสินค้า', c.inventoryMovements],
                ].map(([label, count]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-text-soft">{label}</span>
                    <span className="font-mono font-medium text-text">{(count as number).toLocaleString('th-TH')} รายการ</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="mt-5 w-full rounded-lg bg-brand-gradient py-2.5 text-[13.5px] font-medium text-white shadow"
              >
                ไปหน้า Dashboard
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const ready = phrase === CONFIRM_PHRASE;

  return (
    <>
      <AppTopbar title="โซนอันตราย" />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bad/15">
              <svg className="h-5 w-5 text-bad" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-bold tracking-tight text-bad">โซนอันตราย</h1>
              <p className="text-[12.5px] text-text-mute">การดำเนินการที่ไม่สามารถย้อนกลับได้</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-bad/30 bg-bad/5 p-5">
            <div className="text-[14px] font-semibold text-bad">รีเซ็ตข้อมูลก่อนเริ่มใช้งานจริง</div>
            <p className="mt-1.5 text-[13px] text-text-soft">
              ล้างข้อมูลทดสอบทั้งหมด เพื่อเริ่มต้นใช้งานระบบด้วยข้อมูลที่สะอาด
              ข้อมูลที่ถูกล้างจะ<span className="font-medium text-bad">ไม่สามารถกู้คืนได้</span>
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-ok/30 bg-ok/5 p-4">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ok">สิ่งที่เก็บไว้</div>
                <ul className="space-y-1.5">
                  {KEPT.map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-[12.5px] text-text-soft">
                      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-bad/30 bg-bad/5 p-4">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-bad">สิ่งที่ถูกล้าง</div>
                <ul className="space-y-1.5">
                  {CLEARED.map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-[12.5px] text-text-soft">
                      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 border-t border-bad/20 pt-5">
              <label className="block text-[12.5px] text-text-soft">
                พิมพ์ <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-medium text-text">{CONFIRM_PHRASE}</span> เพื่อยืนยัน
              </label>
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13.5px] outline-none focus:border-bad"
              />
              <button
                onClick={doReset}
                disabled={!ready || loading}
                className="mt-3 w-full rounded-lg bg-bad py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? 'กำลังรีเซ็ต…' : 'รีเซ็ตข้อมูลทั้งหมด'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
