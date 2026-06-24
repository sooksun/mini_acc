// Shared filter primitives for the report pages (profit-loss, trial-balance,
// balance-sheet, general-ledger). Kept in one place so the year window and the
// month-option label conventions can't drift between pages.

import { formatThaiCurrency } from './format';

export const CURRENT_CE_YEAR = new Date().getFullYear();

/** 7-year window centred two years back: [now-2 … now+4]. */
export const YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_CE_YEAR - 2 + i);

export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export type MonthOption = { value: string; label: string };

/**
 * As-of phrasing for snapshot reports (balance sheet, trial balance):
 * "สิ้นปี" / "สิ้นเดือนมกราคม…". The value 'all' means the whole period.
 */
export const asOfMonthOptions: MonthOption[] = [
  { value: 'all', label: 'สิ้นปี' },
  ...THAI_MONTHS.map((m, i) => ({ value: String(i + 1), label: `สิ้นเดือน${m}` })),
];

/**
 * Range phrasing for date-range reports (profit & loss, general ledger):
 * "ทั้งปี" / bare "มกราคม…".
 */
export const rangeMonthOptions: MonthOption[] = [
  { value: 'all', label: 'ทั้งปี' },
  ...THAI_MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
];

export function thb(n: number): string {
  return formatThaiCurrency(n);
}
