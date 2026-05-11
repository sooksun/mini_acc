export interface ItemLike {
  quantity: number;
  unitPrice: number;
  discount?: number;
  vatable?: boolean;
}

export interface Totals {
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAfterVat: number;
  whtRate: number;
  whtAmount: number;
  grandTotal: number;
  netReceived: number;
}

export function lineTotal(item: ItemLike): number {
  const gross = item.quantity * item.unitPrice;
  const net = gross - (item.discount ?? 0);
  return Math.max(0, round2(net));
}

export function computeTotals(items: ItemLike[], vatRate: number, whtRate: number): Totals {
  let subtotal = 0;
  let vatableBase = 0;

  for (const item of items) {
    const line = lineTotal(item);
    subtotal += line;
    if (item.vatable !== false) vatableBase += line;
  }

  subtotal = round2(subtotal);
  vatableBase = round2(vatableBase);

  const vatAmount = round2((vatableBase * vatRate) / 100);
  const totalAfterVat = round2(subtotal + vatAmount);
  const whtAmount = round2((subtotal * whtRate) / 100);
  const grandTotal = totalAfterVat;
  const netReceived = round2(grandTotal - whtAmount);

  return {
    subtotal,
    vatRate,
    vatAmount,
    totalAfterVat,
    whtRate,
    whtAmount,
    grandTotal,
    netReceived,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
