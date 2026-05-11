import { SalesDocumentForm } from '@/features/sales/SalesDocumentForm';
import { DOC_TYPE_META } from '@/features/sales/doc-type-meta';

export default function NewQuotationPage() {
  return <SalesDocumentForm meta={DOC_TYPE_META.QUOTATION} />;
}
