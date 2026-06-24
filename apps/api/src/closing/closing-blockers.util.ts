export interface CheckBlocker {
  code: string;
  message: string;
  count?: number;
}

export function journalUnbalancedBlocker(count: number): CheckBlocker | null {
  if (count <= 0) return null;
  return {
    code: 'JOURNAL_UNBALANCED',
    message: `Journal ${count} รายการในงวดยังไม่สมดุล`,
    count,
  };
}

export function criticalRiskBlocker(count: number): CheckBlocker | null {
  if (count <= 0) return null;
  return {
    code: 'CRITICAL_RISK_OPEN',
    message: `มีความเสี่ยงระดับ CRITICAL ${count} รายการที่ยังไม่จัดการ`,
    count,
  };
}

export function duplicateDocNumberBlocker(count: number): CheckBlocker | null {
  if (count <= 0) return null;
  return {
    code: 'DUPLICATE_DOC_NUMBER',
    message: `มีเลขเอกสารขายซ้ำในงวด ${count} เลข`,
    count,
  };
}

export function stockNegativeBlocker(count: number): CheckBlocker | null {
  if (count <= 0) return null;
  return {
    code: 'STOCK_NEGATIVE',
    message: `มีสินค้าสต็อกติดลบ ${count} รายการ`,
    count,
  };
}

export function unmatchedBankBlocker(count: number): CheckBlocker | null {
  if (count <= 0) return null;
  return {
    code: 'UNMATCHED_BANK',
    message: `รายการธนาคารในงวดยังไม่จับคู่ ${count} รายการ`,
    count,
  };
}

export function invoiceReceivedNoReceiptBlocker(count: number): CheckBlocker | null {
  if (count <= 0) return null;
  return {
    code: 'INVOICE_RECEIVED_NO_RECEIPT',
    message: `ใบแจ้งหนี้รับเงินแล้วแต่ยังไม่ออกใบเสร็จ ${count} ใบ`,
    count,
  };
}