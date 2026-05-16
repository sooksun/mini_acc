/**
 * Shared utilities for WHT-related PDF templates (Form 50 ทวิ + ภ.ง.ด.3/53).
 *
 * Includes:
 *   - Thai inference helpers (PND form type, income category code)
 *   - Date + number formatters that match Revenue Department conventions
 *   - HTML escaping
 */

export type PndForm = 'PND3' | 'PND53';

/**
 * Infer PND form type from the partner's 13-digit Thai tax ID.
 *
 * - Leading "0": juristic person (นิติบุคคล) → ภ.ง.ด.53
 * - Leading 1/2/3/4 or 5: individual (บุคคลธรรมดา) → ภ.ง.ด.3
 *
 * For partners without a tax ID (or non-Thai format), default to ภ.ง.ด.3.
 */
export function inferPndForm(taxId: string | null | undefined): PndForm {
  if (!taxId) return 'PND3';
  const digits = taxId.replace(/\D/g, '');
  if (digits.length !== 13) return 'PND3';
  return digits[0] === '0' ? 'PND53' : 'PND3';
}

/**
 * Map free-text category (what the operator typed in payment.whtCategory) onto
 * the Revenue Code section number. Falls back to '40(2) ค่าจ้างทำของ' which is
 * the most common withholding category for service businesses.
 *
 * The PDF shows both the section reference and the original text so the
 * accountant can verify.
 */
export function incomeTypeLabel(category: string | null | undefined): string {
  if (!category?.trim()) return 'มาตรา 40(2) ค่าจ้างทำของ';
  const c = category.trim();
  if (/40\(1\)|เงินเดือน|ค่าจ้าง.*พนักงาน/i.test(c)) return `มาตรา 40(1) เงินเดือน — ${c}`;
  if (/40\(2\)|ค่านายหน้า|ค่าธรรมเนียม/i.test(c)) return `มาตรา 40(2) ค่าธรรมเนียม/นายหน้า — ${c}`;
  if (/40\(3\)|ลิขสิทธิ์|royalty/i.test(c)) return `มาตรา 40(3) ค่าแห่งลิขสิทธิ์ — ${c}`;
  if (/40\(4\)|ดอกเบี้ย|interest/i.test(c)) return `มาตรา 40(4)(ก) ดอกเบี้ย — ${c}`;
  if (/40\(5\)|ค่าเช่า|เช่า/i.test(c)) return `มาตรา 40(5) ค่าเช่า — ${c}`;
  if (/40\(6\)|วิชาชีพอิสระ|professional/i.test(c)) return `มาตรา 40(6) วิชาชีพอิสระ — ${c}`;
  if (/40\(7\)|งานก่อสร้าง|รับเหมา/i.test(c)) return `มาตรา 40(7) รับเหมาก่อสร้าง — ${c}`;
  if (/40\(8\)|ค่าจ้างทำของ|บริการ/i.test(c)) return `มาตรา 40(8) ค่าจ้างทำของ — ${c}`;
  return `มาตรา 40(2) — ${c}`;
}

const thaiMonths = [
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

export function thaiMonthName(month: number): string {
  return thaiMonths[month - 1] ?? '';
}

export function thaiBuddhistYear(year: number): number {
  return year + 543;
}

/** "10 พฤษภาคม 2569" — long Thai Buddhist date. */
export function formatThaiBuddhistDate(date: Date): string {
  const day = date.getDate();
  const month = thaiMonthName(date.getMonth() + 1);
  const year = thaiBuddhistYear(date.getFullYear());
  return `${day} ${month} ${year}`;
}

/** "10/05/69" — short Thai Buddhist date. */
export function formatShortThaiBuddhistDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(thaiBuddhistYear(date.getFullYear())).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/** "1,234.56" thousand-separated to 2 decimals. */
export function formatThb(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '0.00';
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** "0 1234 56789 12 3" — Thai tax ID spacing for forms. */
export function formatTaxId(taxId: string | null | undefined): string {
  if (!taxId) return '';
  const d = taxId.replace(/\D/g, '');
  if (d.length !== 13) return taxId;
  return `${d[0]} ${d.slice(1, 5)} ${d.slice(5, 10)} ${d.slice(10, 12)} ${d[12]}`;
}

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Number → Thai baht text. Mirrored from apps/web/src/lib/format.ts so the
 * server-side PDF doesn't depend on the web build artifact.
 */
const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

function readChunk(intStr: string): string {
  let result = '';
  const len = intStr.length;
  for (let i = 0; i < len; i++) {
    const digit = Number(intStr[i]);
    const place = len - i - 1;
    if (digit === 0) continue;
    if (place === 0 && digit === 1 && len > 1) result += 'เอ็ด';
    else if (place === 1 && digit === 2) result += 'ยี่';
    else if (place === 1 && digit === 1) result += '';
    else result += DIGITS[digit];
    result += PLACES[place];
  }
  return result;
}

function readInteger(intStr: string): string {
  if (intStr === '0') return 'ศูนย์';
  let s = intStr;
  let result = '';
  while (s.length > 6) {
    const head = s.slice(0, s.length - 6);
    const tail = s.slice(s.length - 6);
    result += readChunk(head) + 'ล้าน';
    s = tail;
  }
  result += readChunk(s);
  return result;
}

export function numberToThaiBahtText(n: number | string): string {
  const num = typeof n === 'string' ? Number(n) : n;
  if (!isFinite(num)) return '';
  const negative = num < 0;
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const parts = fixed.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = parts[1] ?? '00';
  const intText = readInteger(intPart);
  const satang = Number(fracPart);
  let text = intText + 'บาท';
  if (satang === 0) text += 'ถ้วน';
  else text += readInteger(String(satang)) + 'สตางค์';
  return (negative ? 'ลบ' : '') + text;
}
