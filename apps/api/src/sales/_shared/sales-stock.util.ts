import type { DocumentType } from '@hj/shared-types';

/** When confirm() should post inventory OUT for GOOD/MATERIAL line items (PRD §22.3 #7). */
export function shouldPostStockOutOnConfirm(
  type: DocumentType,
  parentDocumentId: string | null,
): boolean {
  switch (type) {
    case 'DELIVERY_NOTE':
    case 'INVOICE':
    case 'TAX_INVOICE':
      return true;
    case 'RECEIPT':
    case 'RECEIPT_TAX_INVOICE':
      return parentDocumentId === null;
    default:
      return false;
  }
}