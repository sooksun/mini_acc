import { shouldPostStockOutOnConfirm } from './sales-stock.util';

describe('shouldPostStockOutOnConfirm', () => {
  it('posts stock on DN, INVOICE, TAX_INVOICE', () => {
    expect(shouldPostStockOutOnConfirm('DELIVERY_NOTE', null)).toBe(true);
    expect(shouldPostStockOutOnConfirm('INVOICE', 'qt-1')).toBe(true);
    expect(shouldPostStockOutOnConfirm('TAX_INVOICE', null)).toBe(true);
  });

  it('posts stock on standalone cash receipts only', () => {
    expect(shouldPostStockOutOnConfirm('RECEIPT', null)).toBe(true);
    expect(shouldPostStockOutOnConfirm('RECEIPT_TAX_INVOICE', null)).toBe(true);
    expect(shouldPostStockOutOnConfirm('RECEIPT', 'inv-1')).toBe(false);
  });

  it('skips QT', () => {
    expect(shouldPostStockOutOnConfirm('QUOTATION', null)).toBe(false);
  });
});