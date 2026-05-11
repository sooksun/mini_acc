import type { PartnerType } from '@hj/shared-types';

const MAP: Record<PartnerType, { label: string; cls: string }> = {
  CUSTOMER: { label: 'ลูกค้า', cls: 'border-info/40 bg-info/10 text-info' },
  VENDOR: { label: 'ผู้ขาย', cls: 'border-warn/40 bg-warn/10 text-warn' },
  BOTH: { label: 'ทั้งคู่', cls: 'border-brand/40 bg-brand/10 text-brand' },
};

export function PartnerTypeBadge({ type }: { type: PartnerType }) {
  const v = MAP[type];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
