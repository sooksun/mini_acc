import {
  applyMarkup,
  MATCH_THRESHOLD,
  nameSimilarity,
  normalizeName,
  proposeMatch,
  type ProductLike,
} from './from-receipts.util';

describe('applyMarkup', () => {
  it('adds the markup percent and rounds to 2 decimals', () => {
    expect(applyMarkup(100, 30)).toBe(130);
    expect(applyMarkup(99.99, 30)).toBe(129.99); // 129.987 → 129.99
    expect(applyMarkup(1000, 15)).toBe(1150);
  });

  it('returns the cost unchanged at 0% markup', () => {
    expect(applyMarkup(250.5, 0)).toBe(250.5);
  });

  it('guards 0 / negative / non-finite cost', () => {
    expect(applyMarkup(0, 30)).toBe(0);
    expect(applyMarkup(-5, 30)).toBe(0);
    expect(applyMarkup(Number.NaN, 30)).toBe(0);
  });
});

describe('normalizeName', () => {
  it('trims, collapses whitespace, lowercases, folds separators', () => {
    expect(normalizeName('  Computer   Desktop ')).toBe('computer desktop');
    expect(normalizeName('USB-C__Hub')).toBe('usb c hub');
  });
});

describe('nameSimilarity', () => {
  it('is 1 for names that normalize equal', () => {
    expect(nameSimilarity('คอมพิวเตอร์', 'คอมพิวเตอร์')).toBe(1);
    expect(nameSimilarity('USB Hub', 'usb  hub')).toBe(1);
  });

  it('is low for unrelated names', () => {
    expect(nameSimilarity('เมาส์ไร้สาย', 'กระดาษ A4')).toBeLessThan(0.4);
  });

  it('is 0 when either side is empty', () => {
    expect(nameSimilarity('', 'อะไรก็ได้')).toBe(0);
  });
});

describe('proposeMatch', () => {
  const catalog: ProductLike[] = [
    { id: 'p1', nameTh: 'คอมพิวเตอร์ตั้งโต๊ะ', unitPrice: 25000 },
    { id: 'p2', nameTh: 'เมาส์ไร้สาย', unitPrice: 350 },
  ];

  it('proposes EXISTING (with productId + price) for an exact catalog name', () => {
    const m = proposeMatch('คอมพิวเตอร์ตั้งโต๊ะ', catalog);
    expect(m.status).toBe('EXISTING');
    expect(m.productId).toBe('p1');
    expect(m.productUnitPrice).toBe(25000);
    expect(m.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('proposes NEW when nothing is close enough', () => {
    expect(proposeMatch('ตู้เย็น 2 ประตู', catalog).status).toBe('NEW');
  });

  it('proposes NEW against an empty catalog', () => {
    const m = proposeMatch('อะไรก็ได้', []);
    expect(m.status).toBe('NEW');
    expect(m.productId).toBeUndefined();
  });
});
