import type { DocumentType } from '@hj/shared-types';

/** Which sales document types recognise revenue in the ledger (PRD §7.2). */
export function recognisesRevenue(
  type: DocumentType,
  parentDocumentId: string | null,
): boolean {
  switch (type) {
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