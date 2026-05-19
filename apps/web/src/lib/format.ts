const TZ = 'Asia/Bangkok';

const longFmt = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
});

const shortFmt = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'numeric', year: '2-digit', timeZone: TZ,
});

const dateTimeFmt = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
});

export function formatThaiDate(date: string | Date): string {
  return longFmt.format(new Date(date));
}

export function formatThaiDateShort(date: string | Date): string {
  return shortFmt.format(new Date(date));
}

export function formatThaiDateTime(date: string | Date): string {
  return dateTimeFmt.format(new Date(date));
}

const thbFmt = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatThaiCurrency(n: number | string): string {
  const v = typeof n === 'string' ? Number(n) : n;
  return thbFmt.format(v);
}

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

function readIntegerChunk(intStr: string): string {
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
    if (s.length - 6 > 0) {
      result += readIntegerChunk(head) + 'ล้าน';
      s = tail;
    } else break;
  }
  result += readIntegerChunk(s);
  return result;
}

export function localDateString(date?: Date): string {
  const d = date ?? new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
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
