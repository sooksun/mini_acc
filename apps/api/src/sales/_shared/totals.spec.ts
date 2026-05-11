import { computeTotals, lineTotal } from './totals';

describe('lineTotal', () => {
  it('multiplies quantity × unitPrice', () => {
    expect(lineTotal({ quantity: 3, unitPrice: 100 })).toBe(300);
  });

  it('subtracts discount', () => {
    expect(lineTotal({ quantity: 2, unitPrice: 50, discount: 10 })).toBe(90);
  });

  it('clamps at 0 when discount exceeds gross', () => {
    expect(lineTotal({ quantity: 1, unitPrice: 100, discount: 200 })).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(lineTotal({ quantity: 1, unitPrice: 33.333 })).toBe(33.33);
  });

  it('handles fractional quantity', () => {
    expect(lineTotal({ quantity: 1.5, unitPrice: 100 })).toBe(150);
  });
});

describe('computeTotals', () => {
  it('returns all zeros for empty items', () => {
    const t = computeTotals([], 7, 0);
    expect(t).toEqual({
      subtotal: 0,
      vatRate: 7,
      vatAmount: 0,
      totalAfterVat: 0,
      whtRate: 0,
      whtAmount: 0,
      grandTotal: 0,
      netReceived: 0,
    });
  });

  it('computes single vatable item with 7% VAT', () => {
    const t = computeTotals(
      [{ description: 'a', unit: 'รายการ', quantity: 1, unitPrice: 100, vatable: true }],
      7,
      0,
    );
    expect(t.subtotal).toBe(100);
    expect(t.vatAmount).toBe(7);
    expect(t.totalAfterVat).toBe(107);
    expect(t.grandTotal).toBe(107);
    expect(t.netReceived).toBe(107);
  });

  it('excludes non-vatable items from VAT base', () => {
    const t = computeTotals(
      [
        { description: 'vat', unit: 'x', quantity: 1, unitPrice: 100, vatable: true },
        { description: 'novat', unit: 'x', quantity: 1, unitPrice: 100, vatable: false },
      ],
      7,
      0,
    );
    expect(t.subtotal).toBe(200);
    expect(t.vatAmount).toBe(7);
    expect(t.totalAfterVat).toBe(207);
  });

  it('applies WHT to subtotal not to vatable base', () => {
    const t = computeTotals(
      [
        { description: 'a', unit: 'x', quantity: 1, unitPrice: 100, vatable: true },
        { description: 'b', unit: 'x', quantity: 1, unitPrice: 100, vatable: false },
      ],
      7,
      3,
    );
    expect(t.subtotal).toBe(200);
    expect(t.whtAmount).toBe(6);
    expect(t.netReceived).toBe(207 - 6);
  });

  it('rounds to 2 decimals at every step (no float drift)', () => {
    const t = computeTotals(
      [{ description: 'a', unit: 'x', quantity: 3, unitPrice: 33.33, vatable: true }],
      7,
      0,
    );
    expect(t.subtotal).toBe(99.99);
    expect(t.vatAmount).toBe(7.0);
    expect(t.totalAfterVat).toBe(106.99);
  });

  it('treats undefined vatable as true (default)', () => {
    const t = computeTotals(
      [{ description: 'a', unit: 'x', quantity: 1, unitPrice: 100 }],
      7,
      0,
    );
    expect(t.vatAmount).toBe(7);
  });

  it('zero VAT rate produces zero vatAmount even with vatable items', () => {
    const t = computeTotals(
      [{ description: 'a', unit: 'x', quantity: 1, unitPrice: 100, vatable: true }],
      0,
      0,
    );
    expect(t.vatAmount).toBe(0);
    expect(t.totalAfterVat).toBe(100);
  });

  it('discount on item flows through to subtotal', () => {
    const t = computeTotals(
      [{ description: 'a', unit: 'x', quantity: 2, unitPrice: 100, discount: 50, vatable: true }],
      7,
      0,
    );
    expect(t.subtotal).toBe(150);
    expect(t.vatAmount).toBe(10.5);
  });
});
