import { Prisma } from '@prisma/client';
import { journalBalanceMismatch } from './journal-balance';

/** Pure arithmetic only. Shipped Dr/Cr path: journal-balance.integration.spec.ts */
describe('journalBalanceMismatch (util)', () => {
  it('returns null when Dr equals Cr (debit-only / credit-only lines like journal.service)', () => {
    expect(
      journalBalanceMismatch([
        { debit: '100' },
        { credit: '100' },
      ]),
    ).toBeNull();
  });

  it('returns totals when Dr ≠ Cr with omitted sides', () => {
    const mismatch = journalBalanceMismatch([
      { debit: '100' },
      { credit: '99' },
    ]);
    expect(mismatch).not.toBeNull();
    expect(mismatch!.totalDebit.toString()).toBe('100');
    expect(mismatch!.totalCredit.toString()).toBe('99');
  });

  it('handles Decimal inputs without float drift', () => {
    const mismatch = journalBalanceMismatch([
      { debit: new Prisma.Decimal('1000.01') },
      { credit: new Prisma.Decimal('1000.00') },
    ]);
    expect(mismatch).not.toBeNull();
    expect(mismatch!.totalDebit.toString()).toBe('1000.01');
    expect(mismatch!.totalCredit.toString()).toBe('1000');
  });
});