import { SalesDocumentsList } from '@/features/sales/SalesDocumentsList';
import { DOC_TYPE_META } from '@/features/sales/doc-type-meta';

export default function InvoicesListPage() {
  return <SalesDocumentsList meta={DOC_TYPE_META.INVOICE} />;
}
