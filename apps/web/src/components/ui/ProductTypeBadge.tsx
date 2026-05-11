import type { ProductType } from '@hj/shared-types';

const MAP: Record<ProductType, { label: string; cls: string }> = {
  GOOD: { label: 'สินค้า', cls: 'border-info/40 bg-info/10 text-info' },
  SERVICE: { label: 'บริการ', cls: 'border-brand/40 bg-brand/10 text-brand' },
  MATERIAL: { label: 'วัสดุ', cls: 'border-warn/40 bg-warn/10 text-warn' },
  ASSET: { label: 'ทรัพย์สิน', cls: 'border-ok/40 bg-ok/10 text-ok' },
};

export function ProductTypeBadge({ type }: { type: ProductType }) {
  const v = MAP[type];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
