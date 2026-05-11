import { SalesDocumentsList } from '@/features/sales/SalesDocumentsList';
import { DOC_TYPE_META } from '@/features/sales/doc-type-meta';

export default function ReceiptTaxInvoicesListPage() {
  return <SalesDocumentsList meta={DOC_TYPE_META.RECEIPT_TAX_INVOICE} />;
}
