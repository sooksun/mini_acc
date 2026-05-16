import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// อ่าน logo.png เป็น base64 data URL ครั้งเดียวตอน module load — Playwright
// ไม่มี file-server context ตอน render PDF จึง inline ภาพเข้า HTML ตรงๆ.
// ใน dev (Nest CLI cwd = apps/api) ไฟล์อยู่ที่ ../web/public/logo.png; ใน prod
// container ตั้ง LOGO_PATH ผ่าน env เพื่อ point ไปยังตำแหน่งจริง.
function loadLogoDataUrl(): string | null {
  const candidates = [
    process.env.LOGO_PATH,
    resolve(process.cwd(), '..', 'web', 'public', 'logo.png'),
    resolve(process.cwd(), 'apps', 'web', 'public', 'logo.png'),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const buffer = readFileSync(path);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const LOGO_DATA_URL = loadLogoDataUrl();

export function getLogoDataUrl(): string | null {
  return LOGO_DATA_URL;
}
