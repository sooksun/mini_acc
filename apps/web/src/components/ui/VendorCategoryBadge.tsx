import type { VendorCategory } from '@hj/shared-types';

const MAP: Record<VendorCategory, { label: string; cls: string }> = {
  SHOP:       { label: 'ร้านค้า',      cls: 'border-ok/40 bg-ok/10 text-ok' },
  CONTRACTOR: { label: 'ผู้รับจ้าง',   cls: 'border-brand/40 bg-brand/10 text-brand' },
  EMPLOYEE:   { label: 'ลูกจ้าง',      cls: 'border-info/40 bg-info/10 text-info' },
  FREELANCE:  { label: 'ฟรีแลนซ์',    cls: 'border-warn/40 bg-warn/10 text-warn' },
  GOVERNMENT: { label: 'หน่วยงานรัฐ',  cls: 'border-bad/40 bg-bad/10 text-bad' },
  OTHER:      { label: 'อื่น ๆ',       cls: 'border-border bg-surface-3 text-text-soft' },
};

export function VendorCategoryBadge({ category }: { category: VendorCategory }) {
  const v = MAP[category];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

export const VENDOR_CATEGORY_OPTIONS: { value: VendorCategory; label: string }[] = [
  { value: 'SHOP',       label: 'ร้านค้า / ผู้ขาย' },
  { value: 'CONTRACTOR', label: 'ผู้รับจ้าง' },
  { value: 'EMPLOYEE',   label: 'ลูกจ้าง / พนักงาน' },
  { value: 'FREELANCE',  label: 'ฟรีแลนซ์' },
  { value: 'GOVERNMENT', label: 'หน่วยงานรัฐ' },
  { value: 'OTHER',      label: 'อื่น ๆ' },
];
