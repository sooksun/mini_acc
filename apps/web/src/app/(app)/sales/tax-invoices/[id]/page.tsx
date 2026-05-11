'use client';

import { use } from 'react';
import { SalesDocumentDetail } from '@/features/sales/SalesDocumentDetail';
import { DOC_TYPE_META } from '@/features/sales/doc-type-meta';

export default function TaxInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SalesDocumentDetail meta={DOC_TYPE_META.TAX_INVOICE} id={id} />;
}
