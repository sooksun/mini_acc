'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppTopbar } from '@/components/AppTopbar';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  SalesDocumentForm,
  type SalesDocumentInitial,
} from '@/features/sales/SalesDocumentForm';
import { DOC_TYPE_META } from '@/features/sales/doc-type-meta';

interface ApiResponse {
  id: string;
  status: string;
  customerId: string;
  projectId: string | null;
  documentDate: string;
  dueDate: string | null;
  reference: string | null;
  note: string | null;
  vatRate: string;
  whtRate: string;
  customer: {
    nameTh: string;
    address: string | null;
    taxId: string | null;
    branch: string | null;
  };
  items: Array<{
    productId: string | null;
    productCode: string | null;
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    vatable: boolean;
  }>;
}

export default function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const meta = DOC_TYPE_META.QUOTATION;
  const [initial, setInitial] = useState<SalesDocumentInitial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = getUser()?.role;
  const canEdit = role === 'OWNER' || role === 'ADMIN';

  useEffect(() => {
    if (!canEdit) {
      setError('คุณไม่มีสิทธิ์แก้ไขเอกสารนี้');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const d = await api<ApiResponse>(`${meta.apiBase}/${id}`);
        if (d.status !== 'DRAFT') {
          toast.error('แก้ไขได้เฉพาะเอกสารฉบับร่าง (DRAFT)');
          router.replace(`${meta.listHref}/${id}` as any);
          return;
        }
        setInitial({
          id: d.id,
          customer: { id: d.customerId, ...d.customer },
          projectId: d.projectId,
          documentDate: d.documentDate,
          dueDate: d.dueDate,
          reference: d.reference,
          note: d.note,
          vatRate: d.vatRate,
          whtRate: d.whtRate,
          items: d.items,
        });
      } catch (e: any) {
        setError(e.message ?? 'โหลดเอกสารไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <>
        <AppTopbar title={'แก้ไข' + meta.shortTitle} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={24} />
        </div>
      </>
    );
  }

  if (error || !initial) {
    return (
      <>
        <AppTopbar title={'แก้ไข' + meta.shortTitle} />
        <div className="flex-1 px-7 pb-16 pt-6">
          <div className="rounded-md border border-bad/40 bg-bad/5 px-4 py-3 text-bad">
            {error ?? 'ไม่พบเอกสาร'}
          </div>
        </div>
      </>
    );
  }

  return <SalesDocumentForm meta={meta} initial={initial} />;
}
