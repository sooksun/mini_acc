import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type { AccountType } from './types';

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

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASSET: 'สินทรัพย์',
  LIABILITY: 'หนี้สิน',
  EQUITY: 'ส่วนของผู้ถือหุ้น',
  REVENUE: 'รายได้',
  EXPENSE: 'ค่าใช้จ่าย',
  OTHER: 'อื่น ๆ',
};

export const SALES_DOC_TYPE_LABEL: Record<string, string> = {
  INVOICE: 'ใบแจ้งหนี้',
  TAX_INVOICE: 'ใบกำกับภาษี',
  RECEIPT: 'ใบเสร็จรับเงิน',
  RECEIPT_TAX_INVOICE: 'ใบเสร็จ/ใบกำกับภาษี',
  ADJUSTMENT: 'รายการปรับปรุง',
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toNumber(value: Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

export function toMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export function toYearRange(year: number) {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

export function assertYearMonth(year: number, month?: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequestException({ code: 'BAD_YEAR', year });
  }
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new BadRequestException({ code: 'BAD_MONTH', month });
  }
}

export function endOfPeriod(year: number, month?: number): Date {
  return month ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year + 1, 0, 1));
}

export function asOfLabel(year: number, month?: number): { beYear: number; label: string } {
  const beYear = year + 543;
  return {
    beYear,
    label: month ? `ณ สิ้นเดือน${THAI_MONTHS[month - 1]} ${beYear}` : `ณ สิ้นปี ${beYear}`,
  };
}

export function rangeLabel(year: number, month?: number): { beYear: number; label: string } {
  const beYear = year + 543;
  return { beYear, label: month ? `${THAI_MONTHS[month - 1]} ${beYear}` : `ปี ${beYear}` };
}