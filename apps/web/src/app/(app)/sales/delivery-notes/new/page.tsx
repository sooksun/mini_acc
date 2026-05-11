import { SalesDocumentForm } from '@/features/sales/SalesDocumentForm';
import { DOC_TYPE_META } from '@/features/sales/doc-type-meta';

export default function NewDeliveryNotePage() {
  return <SalesDocumentForm meta={DOC_TYPE_META.DELIVERY_NOTE} />;
}
