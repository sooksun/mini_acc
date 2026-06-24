import {
  criticalRiskBlocker,
  duplicateDocNumberBlocker,
  invoiceReceivedNoReceiptBlocker,
  journalUnbalancedBlocker,
  stockNegativeBlocker,
  unmatchedBankBlocker,
} from './closing-blockers.util';

describe('closing blocker builders', () => {
  it('returns null when count is zero', () => {
    expect(journalUnbalancedBlocker(0)).toBeNull();
    expect(criticalRiskBlocker(0)).toBeNull();
    expect(duplicateDocNumberBlocker(0)).toBeNull();
    expect(stockNegativeBlocker(0)).toBeNull();
    expect(unmatchedBankBlocker(0)).toBeNull();
    expect(invoiceReceivedNoReceiptBlocker(0)).toBeNull();
  });

  it('builds JOURNAL_UNBALANCED blocker', () => {
    expect(journalUnbalancedBlocker(2)).toEqual({
      code: 'JOURNAL_UNBALANCED',
      message: 'Journal 2 รายการในงวดยังไม่สมดุล',
      count: 2,
    });
  });

  it('builds INVOICE_RECEIVED_NO_RECEIPT blocker', () => {
    expect(invoiceReceivedNoReceiptBlocker(1)).toEqual({
      code: 'INVOICE_RECEIVED_NO_RECEIPT',
      message: 'ใบแจ้งหนี้รับเงินแล้วแต่ยังไม่ออกใบเสร็จ 1 ใบ',
      count: 1,
    });
  });
});