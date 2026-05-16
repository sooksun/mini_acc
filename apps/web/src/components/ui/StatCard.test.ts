import { describe, expect, it } from 'vitest';
import { formatDelta } from './StatCard';

describe('formatDelta', () => {
  it('positive delta gets ok color + leading +', () => {
    const out = formatDelta({ value: 12 });
    expect(out.text).toBe('+12');
    expect(out.cls).toContain('ok');
  });

  it('negative delta gets bad color + leading -', () => {
    const out = formatDelta({ value: -3 });
    expect(out.text).toBe('-3');
    expect(out.cls).toContain('bad');
  });

  it('zero delta is muted', () => {
    const out = formatDelta({ value: 0 });
    expect(out.text).toBe('0');
    expect(out.cls).toContain('text-mute');
  });

  it('respects custom format + suffix', () => {
    const out = formatDelta({
      value: 0.123,
      format: (n) => n.toFixed(2),
      suffix: '%',
    });
    expect(out.text).toBe('0.12%');
  });
});
