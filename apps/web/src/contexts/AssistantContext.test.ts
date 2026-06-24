import { describe, expect, it } from 'vitest';
import { resolveUnregister, toggleOn, type PageDescriptor } from './AssistantContext';
import { routeTitle } from './route-descriptions';

const desc = (route: string): PageDescriptor => ({
  route,
  title: route,
  fields: [],
  getCurrentValues: () => ({}),
  applyValues: () => undefined,
});

describe('toggleOn', () => {
  it('defaults ON for null/missing and any non-"0" value', () => {
    expect(toggleOn(null)).toBe(true);
    expect(toggleOn('1')).toBe(true);
    expect(toggleOn('')).toBe(true);
  });
  it('is OFF only for "0"', () => {
    expect(toggleOn('0')).toBe(false);
  });
});

describe('resolveUnregister', () => {
  it('clears the descriptor when the route matches', () => {
    expect(resolveUnregister(desc('/products'), '/products')).toBeNull();
  });
  it('does NOT clobber a newer descriptor (late unregister of an old route)', () => {
    const current = desc('/customers'); // a newer page already registered
    expect(resolveUnregister(current, '/products')).toBe(current);
  });
  it('is a no-op when nothing is registered', () => {
    expect(resolveUnregister(null, '/products')).toBeNull();
  });
});

describe('routeTitle (longest-prefix)', () => {
  it('matches the most specific prefix', () => {
    expect(routeTitle('/sales/invoices/new')).toBe('ใบแจ้งหนี้');
    expect(routeTitle('/sales/quotations/abc/edit')).toBe('ใบเสนอราคา');
    expect(routeTitle('/sales')).toBe('เอกสารขาย');
  });
  it('falls back to a generic title for unknown routes', () => {
    expect(routeTitle('/totally-unknown')).toBe('หน้านี้');
  });
  it('does not confuse /closing with /year-end-closing', () => {
    expect(routeTitle('/closing')).toBe('ปิดงวดบัญชี');
    expect(routeTitle('/year-end-closing')).toBe('ปิดบัญชีสิ้นปี');
  });
});
