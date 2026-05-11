import { describe, expect, it } from 'vitest';
import { numberToThaiBahtText, formatThaiDate, formatThaiDateShort } from './format';

describe('numberToThaiBahtText', () => {
  it('handles whole numbers', () => {
    expect(numberToThaiBahtText(100000)).toBe('หนึ่งแสนบาทถ้วน');
    expect(numberToThaiBahtText(0)).toBe('ศูนย์บาทถ้วน');
    expect(numberToThaiBahtText(1)).toBe('หนึ่งบาทถ้วน');
    expect(numberToThaiBahtText(11)).toBe('สิบเอ็ดบาทถ้วน');
    expect(numberToThaiBahtText(21)).toBe('ยี่สิบเอ็ดบาทถ้วน');
  });

  it('handles satang', () => {
    expect(numberToThaiBahtText(93457.94)).toBe(
      'เก้าหมื่นสามพันสี่ร้อยห้าสิบเจ็ดบาทเก้าสิบสี่สตางค์',
    );
  });

  it('handles millions', () => {
    expect(numberToThaiBahtText(1_000_000)).toBe('หนึ่งล้านบาทถ้วน');
  });
});

describe('formatThaiDate', () => {
  it('renders Buddhist year', () => {
    const result = formatThaiDate('2026-05-10T03:30:00Z');
    expect(result).toContain('2569');
    expect(result).toContain('พฤษภาคม');
  });

  it('short format uses 2-digit BE year', () => {
    const result = formatThaiDateShort('2026-05-10T03:30:00Z');
    expect(result).toMatch(/69$/);
  });
});
