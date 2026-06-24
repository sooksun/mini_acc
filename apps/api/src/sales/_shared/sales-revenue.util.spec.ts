import { recognisesRevenue } from './sales-revenue.util';

describe('recognisesRevenue', () => {
  it('always recognises INVOICE and TAX_INVOICE', () => {
    expect(recognisesRevenue('INVOICE', null)).toBe(true);
    expect(recognisesRevenue('INVOICE', 'parent-1')).toBe(true);
    expect(recognisesRevenue('TAX_INVOICE', null)).toBe(true);
  });

  it('recognises standalone RECEIPT / RECEIPT_TAX_INVOICE only', () => {
    expect(recognisesRevenue('RECEIPT', null)).toBe(true);
    expect(recognisesRevenue('RECEIPT_TAX_INVOICE', null)).toBe(true);
    expect(recognisesRevenue('RECEIPT', 'inv-1')).toBe(false);
    expect(recognisesRevenue('RECEIPT_TAX_INVOICE', 'inv-1')).toBe(false);
  });

  it('does not recognise QT / DN', () => {
    expect(recognisesRevenue('QUOTATION', null)).toBe(false);
    expect(recognisesRevenue('DELIVERY_NOTE', null)).toBe(false);
  });
});