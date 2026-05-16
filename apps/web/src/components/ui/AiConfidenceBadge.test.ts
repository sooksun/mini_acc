import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_THRESHOLDS,
  formatConfidencePercent,
  getConfidenceTier,
} from './AiConfidenceBadge';

describe('getConfidenceTier', () => {
  it('high at and above 0.85', () => {
    expect(getConfidenceTier(CONFIDENCE_THRESHOLDS.high)).toBe('high');
    expect(getConfidenceTier(0.99)).toBe('high');
    expect(getConfidenceTier(1)).toBe('high');
  });

  it('medium between 0.6 (inclusive) and 0.85 (exclusive)', () => {
    expect(getConfidenceTier(CONFIDENCE_THRESHOLDS.medium)).toBe('medium');
    expect(getConfidenceTier(0.7)).toBe('medium');
    expect(getConfidenceTier(0.8499)).toBe('medium');
  });

  it('low below 0.6', () => {
    expect(getConfidenceTier(0.5999)).toBe('low');
    expect(getConfidenceTier(0)).toBe('low');
    expect(getConfidenceTier(-1)).toBe('low');
  });

  it('NaN / Infinity falls to low so reviewers double-check', () => {
    expect(getConfidenceTier(NaN)).toBe('low');
    expect(getConfidenceTier(Infinity)).toBe('low');
  });
});

describe('formatConfidencePercent', () => {
  it('rounds to nearest integer percent', () => {
    expect(formatConfidencePercent(0.85)).toBe('85%');
    expect(formatConfidencePercent(0.854)).toBe('85%');
    expect(formatConfidencePercent(0.855)).toBe('86%');
    expect(formatConfidencePercent(1)).toBe('100%');
    expect(formatConfidencePercent(0)).toBe('0%');
  });

  it('clamps to [0, 100]', () => {
    expect(formatConfidencePercent(-0.5)).toBe('0%');
    expect(formatConfidencePercent(2)).toBe('100%');
  });

  it('returns 0% on non-finite input', () => {
    expect(formatConfidencePercent(NaN)).toBe('0%');
    expect(formatConfidencePercent(Infinity)).toBe('0%');
  });
});
