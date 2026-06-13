import type { ProductType } from '@hj/shared-types';

/**
 * Pure helpers for the "quotation from purchase receipts" flow. Kept free of
 * Nest/Prisma so they're trivially unit-testable.
 */

/** Normalize a product name for matching: trim, collapse whitespace, lowercase
 *  (Latin), fold a few separators. Thai characters are left intact. */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sørensen–Dice similarity on character bigrams (0..1). Works without Thai word
 * segmentation, so it's a reasonable fuzzy match for catalog names where the
 * receipt spelling differs slightly from the stored name.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;

  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };

  const ma = bigrams(na);
  const mb = bigrams(nb);
  let overlap = 0;
  for (const [bg, count] of ma) {
    const other = mb.get(bg);
    if (other) overlap += Math.min(count, other);
  }
  const totalA = [...ma.values()].reduce((s, c) => s + c, 0);
  const totalB = [...mb.values()].reduce((s, c) => s + c, 0);
  if (totalA + totalB === 0) return 0;
  return (2 * overlap) / (totalA + totalB);
}

/** At/above this score we propose an existing product as a match (owner confirms). */
export const MATCH_THRESHOLD = 0.6;

export interface ProductLike {
  id: string;
  nameTh: string;
  unitPrice: number;
}

export interface MatchResult {
  status: 'EXISTING' | 'NEW';
  productId?: string;
  productName?: string;
  productUnitPrice?: number;
  /** Best similarity score found (0..1), for display + so the owner can judge. */
  confidence: number;
}

/**
 * Propose the best catalog match for an extracted name. Advisory only — the
 * owner confirms or overrides on the review screen before anything is written.
 */
export function proposeMatch(name: string, products: ProductLike[]): MatchResult {
  let best: ProductLike | undefined;
  let bestScore = 0;
  for (const p of products) {
    const score = nameSimilarity(name, p.nameTh);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best && bestScore >= MATCH_THRESHOLD) {
    return {
      status: 'EXISTING',
      productId: best.id,
      productName: best.nameTh,
      productUnitPrice: best.unitPrice,
      confidence: Number(bestScore.toFixed(4)),
    };
  }
  return { status: 'NEW', confidence: Number(bestScore.toFixed(4)) };
}

/** sell = purchase × (1 + markup%/100), rounded to 2 decimals. */
export function applyMarkup(purchase: number, markupPercent: number): number {
  if (!Number.isFinite(purchase) || purchase < 0) return 0;
  const sell = purchase * (1 + markupPercent / 100);
  return Math.round((sell + Number.EPSILON) * 100) / 100;
}

/**
 * Document-level WHT suggestion, mirroring the sales form rule
 * (SalesDocumentForm): any SERVICE → 3%, else any GOOD/MATERIAL → 1%, else 0%.
 * SERVICE wins when types are mixed (one rate per document). A buy-and-resell
 * quotation (goods) therefore comes out at 1%.
 */
export function suggestWhtRate(types: ProductType[]): number {
  if (types.some((t) => t === 'SERVICE')) return 3;
  if (types.some((t) => t === 'GOOD' || t === 'MATERIAL')) return 1;
  return 0;
}
