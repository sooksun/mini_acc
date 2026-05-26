'use client';

import Link from 'next/link';
import { SalesDocumentsList } from '@/features/sales/SalesDocumentsList';
import { DOC_TYPE_META } from '@/features/sales/doc-type-meta';
import { getUser } from '@/lib/auth';

export default function QuotationsListPage() {
  const isOwner = getUser()?.role === 'OWNER';
  return (
    <SalesDocumentsList
      meta={DOC_TYPE_META.QUOTATION}
      extraActions={
        isOwner ? (
          <Link
            href={'/sales/quotations/from-receipts' as any}
            className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-soft hover:bg-surface-3"
          >
            + จากใบเสร็จซื้อ
          </Link>
        ) : null
      }
    />
  );
}
