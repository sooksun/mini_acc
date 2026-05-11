import type { SalesDocumentItemInput } from './sales-document.types';

export interface SalesTotals {
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAfterVat: number;
  whtRate: number;
  whtAmount: number;
  grandTotal: number;
  netReceived: number;
}

export function lineTotal(item: {
  quantity: number;
  unitPrice: number;
  discount?: number;
}): number {
  const gross = item.quantity * item.unitPrice;
  const net = gross - (item.discount ?? 0);
  return Math.max(0, round2(net));
}

export function computeTotals(
  items: SalesDocumentItemInput[],
  vatRatePct: number,
  whtRatePct: number,
): SalesTotals {
  let subtotal = 0;
  let vatableBase = 0;

  for (const item of items) {
    const line = lineTotal(item);
    subtotal += line;
    if (item.vatable !== false) vatableBase += line;
  }

  subtotal = round2(subtotal);
  vatableBase = round2(vatableBase);

  const vatAmount = round2((vatableBase * vatRatePct) / 100);
  const totalAfterVat = round2(subtotal + vatAmount);
  const whtAmount = round2((subtotal * whtRatePct) / 100);
  const grandTotal = totalAfterVat;
  const netReceived = round2(grandTotal - whtAmount);

  return {
    subtotal,
    vatRate: vatRatePct,
    vatAmount,
    totalAfterVat,
    whtRate: whtRatePct,
    whtAmount,
    grandTotal,
    netReceived,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
