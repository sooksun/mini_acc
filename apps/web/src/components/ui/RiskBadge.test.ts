import { describe, expect, it } from 'vitest';
import { RISK_META, getRiskMeta } from './RiskBadge';

describe('RiskBadge meta', () => {
  it('has an entry for every RiskLevel value', () => {
    expect(Object.keys(RISK_META).sort()).toEqual(['CRITICAL', 'HIGH', 'LOW', 'MEDIUM']);
  });

  it('LOW uses info color tokens', () => {
    expect(RISK_META.LOW.cls).toContain('info');
    expect(RISK_META.LOW.label).toBe('ต่ำ');
  });

  it('CRITICAL uses bad color tokens', () => {
    expect(RISK_META.CRITICAL.cls).toContain('bad');
    expect(RISK_META.CRITICAL.label).toBe('วิกฤต');
  });

  it('getRiskMeta returns the same object as direct lookup', () => {
    expect(getRiskMeta('HIGH')).toBe(RISK_META.HIGH);
  });
});
