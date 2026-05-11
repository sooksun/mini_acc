import type { DocumentStatus } from '@hj/shared-types';

const MAP: Record<DocumentStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'ฉบับร่าง', cls: 'border-text-mute/40 bg-surface-3 text-text-soft' },
  AI_EXTRACTED: { label: 'AI อ่านแล้ว', cls: 'border-info/40 bg-info/10 text-info' },
  PENDING_REVIEW: { label: 'รอตรวจ', cls: 'border-warn/40 bg-warn/10 text-warn' },
  USER_CONFIRMED: { label: 'ยืนยันแล้ว', cls: 'border-info/40 bg-info/10 text-info' },
  ACCOUNTED: { label: 'ลงบัญชี', cls: 'border-ok/40 bg-ok/10 text-ok' },
  PENDING_ACCOUNTANT: { label: 'รอนักบัญชีตรวจ', cls: 'border-warn/40 bg-warn/10 text-warn' },
  ACCOUNTANT_APPROVED: { label: 'นักบัญชีอนุมัติ', cls: 'border-ok/40 bg-ok/10 text-ok' },
  LOCKED: { label: 'ล็อก', cls: 'border-text-mute/40 bg-surface-3 text-text-soft' },
  VOIDED: { label: 'ยกเลิก', cls: 'border-bad/40 bg-bad/10 text-bad' },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const v = MAP[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
