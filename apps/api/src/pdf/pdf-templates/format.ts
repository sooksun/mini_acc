const TZ = 'Asia/Bangkok';

const longFmt = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TZ,
});

const shortFmt = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'numeric',
  year: '2-digit',
  timeZone: TZ,
});

const thbFmt = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatThaiDate(date: Date | string): string {
  return longFmt.format(typeof date === 'string' ? new Date(date) : date);
}

export function formatThaiDateShort(date: Date | string): string {
  return shortFmt.format(typeof date === 'string' ? new Date(date) : date);
}

export function formatThb(n: number | string): string {
  const v = typeof n === 'string' ? Number(n) : n;
  return thbFmt.format(v);
}

export function formatTaxId(taxId: string | null | undefined): string {
  if (!taxId) return '';
  const d = taxId.replace(/\D/g, '');
  if (d.length !== 13) return taxId;
  return `${d[0]} ${d.slice(1, 5)} ${d.slice(5, 10)} ${d.slice(10, 12)} ${d[12]}`;
}

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
  const [intPart, fracPart = '00'] = fixed.split('.');
  const intText = readInteger(intPart!);
  const satang = Number(fracPart);
  let text = intText + 'บาท';
  if (satang === 0) text += 'ถ้วน';
  else text += readInteger(String(satang)) + 'สตางค์';
  return (negative ? 'ลบ' : '') + text;
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
