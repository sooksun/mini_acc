import { Prisma } from '@prisma/client';

const ZERO = new Prisma.Decimal(0);

export interface JournalLineAmounts {
  debit?: string | number | Prisma.Decimal;
  credit?: string | number | Prisma.Decimal;
}

function toDecimal(v: string | number | Prisma.Decimal | undefined): Prisma.Decimal {
  if (v === undefined || v === null) return ZERO;
  if (v instanceof Prisma.Decimal) return v;
  return new Prisma.Decimal(v);
}

/** Sum debits and credits; returns null when balanced, otherwise the mismatch totals. */
export function journalBalanceMismatch(
  lines: JournalLineAmounts[],
): { totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal } | null {
  const totalDebit = lines.reduce((sum, line) => sum.plus(toDecimal(line.debit)), ZERO);
  const totalCredit = lines.reduce((sum, line) => sum.plus(toDecimal(line.credit)), ZERO);
  return totalDebit.equals(totalCredit) ? null : { totalDebit, totalCredit };
}