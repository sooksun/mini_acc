import type { Company, Partner, WithholdingTaxRecord } from '@prisma/client';
import {
  escapeHtml,
  formatShortThaiBuddhistDate,
  formatTaxId,
  formatThaiBuddhistDate,
  formatThb,
  inferPndForm,
  incomeTypeLabel,
  numberToThaiBahtText,
} from './wht-shared';

export type CertCopy = 'ORIGINAL' | 'COPY_1' | 'COPY_2';

const COPY_LABEL: Record<CertCopy, string> = {
  ORIGINAL: 'ต้นฉบับ — สำหรับผู้ถูกหักภาษี ณ ที่จ่าย',
  COPY_1: 'สำเนาฉบับที่ 1 — สำหรับผู้ถูกหักภาษีฯ ใช้แนบกับแบบ ภ.ง.ด.',
  COPY_2: 'สำเนาฉบับที่ 2 — สำหรับผู้จ่ายเงิน',
};

export interface WhtCertificateInput {
  company: Company;
  /** Optional — pulled via paymentId. Use null when payment is detached. */
  partner: Partner | null;
  record: WithholdingTaxRecord;
  /** Render ต้นฉบับ + ทั้ง 2 สำเนา (3 หน้า) — set to ['ORIGINAL'] for a single page. */
  copies?: CertCopy[];
}

function checkbox(checked: boolean): string {
  return checked ? '☑' : '☐';
}

/**
 * Render one A4 portrait page per requested copy. Section ordering follows
 * the Revenue Department's "หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ"
 * template — the data fields are positionally identical so an accountant can
 * cross-reference rapidly.
 */
export function buildWhtCertificateHtml(input: WhtCertificateInput): string {
  const copies = input.copies ?? ['ORIGINAL', 'COPY_1', 'COPY_2'];
  const pages = copies.map((c) => renderCopyPage(input, c)).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>หนังสือรับรองการหักภาษี ณ ที่จ่าย ${escapeHtml(input.record.certNumber ?? '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${pageStyles()}</style>
</head>
<body>
${pages}
</body>
</html>`;
}

function pageStyles(): string {
  return `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; font-family: 'IBM Plex Sans Thai', 'Sarabun', sans-serif; color: #1a1a1a; font-size: 10pt; line-height: 1.35; }
.page { page-break-after: always; padding: 12mm 14mm; min-height: 297mm; position: relative; }
.page:last-child { page-break-after: auto; }

.head { display: grid; grid-template-columns: 1fr 200px; gap: 16px; align-items: start; border-bottom: 1.5px solid #1F5F8B; padding-bottom: 8px; }
.head h1 { font-size: 16pt; margin: 0; color: #1F5F8B; }
.head .sub { font-size: 9pt; color: #555; margin-top: 2pt; }
.cert-num { border: 1px solid #888; border-radius: 4pt; padding: 4pt 8pt; font-size: 9pt; text-align: center; }
.cert-num .label { color: #666; font-size: 8pt; }
.cert-num .value { font-weight: 700; font-family: 'IBM Plex Mono', monospace; }

.section { margin-top: 10pt; }
.section h2 { font-size: 11pt; font-weight: 600; margin: 0 0 4pt; color: #444; }
.section .row { display: grid; grid-template-columns: 100pt 1fr 100pt 1fr; column-gap: 8pt; row-gap: 2pt; align-items: baseline; }
.section .label { color: #555; }
.section .value { border-bottom: 1px dotted #888; padding-bottom: 1pt; min-height: 14pt; }
.section .value.address { white-space: pre-wrap; }

.checkboxes { display: grid; grid-template-columns: repeat(2, 1fr); column-gap: 12pt; row-gap: 3pt; font-size: 9.5pt; margin-top: 4pt; }
.checkboxes .checkbox-line { display: flex; gap: 4pt; align-items: baseline; }
.cb { font-family: 'IBM Plex Mono', monospace; font-size: 11pt; }

.pnd-row { display: flex; gap: 14pt; flex-wrap: wrap; font-size: 9.5pt; margin-top: 6pt; padding: 4pt 0; border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; }

table.amounts { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 9.5pt; }
table.amounts thead th { background: #f0f0f0; padding: 5pt 6pt; text-align: center; border: 1px solid #999; font-weight: 600; }
table.amounts tbody td { padding: 4pt 6pt; border: 1px solid #999; text-align: center; }
table.amounts td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: 'IBM Plex Mono', monospace; }
table.amounts tfoot td { padding: 5pt 6pt; border: 1px solid #999; background: #f8f8f8; font-weight: 600; }
table.amounts tfoot td.num { text-align: right; font-variant-numeric: tabular-nums; }

.amount-words { margin-top: 6pt; padding: 4pt 8pt; border: 1px solid #888; font-size: 10pt; }
.amount-words .label { color: #666; margin-right: 6pt; }

.certify { margin-top: 14pt; font-size: 9.5pt; color: #333; }

.signature { margin-top: 22pt; display: grid; grid-template-columns: 1fr 220pt; gap: 16pt; align-items: end; }
.sig-line { border-bottom: 1px dotted #555; height: 18pt; }
.sig-label { margin-top: 2pt; text-align: center; font-size: 9pt; color: #555; }
.sig-meta { font-size: 9pt; color: #555; margin-top: 8pt; }
.sig-meta .row { display: grid; grid-template-columns: 70pt 1fr; gap: 4pt; align-items: baseline; margin-bottom: 2pt; }
.sig-meta .val { border-bottom: 1px dotted #888; min-height: 14pt; }

.copy-badge { position: absolute; top: 12mm; right: 14mm; border: 1.5px solid #1F5F8B; border-radius: 4pt; padding: 3pt 10pt; font-size: 9pt; color: #1F5F8B; background: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.5pt; }

.footer { margin-top: 12pt; padding-top: 4pt; border-top: 1px solid #ccc; font-size: 8pt; color: #777; }
`;
}

function renderCopyPage(input: WhtCertificateInput, copy: CertCopy): string {
  const { company, partner, record } = input;
  const pndForm = inferPndForm(record.partnerTaxId);
  const paidAt = new Date(record.paidAt);
  const category = record.category?.trim() ?? '';

  // Match category against the 6 income-type checkboxes on Form 50 ทวิ.
  const isType1 = /40\(1\)|เงินเดือน/.test(category);
  const isType2 = /40\(2\)|ค่านายหน้า|ค่าธรรมเนียม/.test(category);
  const isType3 = /40\(3\)|ลิขสิทธิ์/.test(category);
  const isType4 = /40\(4\)|ดอกเบี้ย/.test(category);
  const isType5 = /40\(5\)|ค่าเช่า/.test(category);
  const isType6or8 = /40\(8\)|40\(6\)|40\(7\)|วิชาชีพอิสระ|รับเหมา|ค่าจ้างทำของ|บริการ/.test(category);
  // Default: "อื่น ๆ" if none matched and we have a non-empty category
  const isOther = !!category && !isType1 && !isType2 && !isType3 && !isType4 && !isType5 && !isType6or8;

  const partnerAddress = partner?.address ?? '';
  const companyAddress = company.address ?? '';

  return `
<div class="page">
  <div class="copy-badge">${escapeHtml(COPY_LABEL[copy])}</div>

  <div class="head">
    <div>
      <h1>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
      <div class="sub">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
    </div>
    <div class="cert-num">
      <div class="label">เล่มที่ / เลขที่</div>
      <div class="value">${escapeHtml(record.certNumber ?? `WHT-${record.periodYear}-${record.periodMonth.toString().padStart(2, '0')}-${record.id.slice(-4).toUpperCase()}`)}</div>
    </div>
  </div>

  <div class="section">
    <h2>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (Withholder)</h2>
    <div class="row">
      <div class="label">ชื่อ</div><div class="value" style="grid-column: span 3;">${escapeHtml(company.nameTh)}</div>
      <div class="label">เลขประจำตัวผู้เสียภาษี</div><div class="value" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(formatTaxId(company.taxId))}</div>
      <div class="label">โทร</div><div class="value">${escapeHtml(company.phone ?? '')}</div>
      <div class="label">ที่อยู่</div><div class="value address" style="grid-column: span 3;">${escapeHtml(companyAddress)}</div>
    </div>
  </div>

  <div class="section">
    <h2>ผู้ถูกหักภาษี ณ ที่จ่าย (Recipient)</h2>
    <div class="row">
      <div class="label">ชื่อ</div><div class="value" style="grid-column: span 3;">${escapeHtml(record.partnerName)}</div>
      <div class="label">เลขประจำตัวผู้เสียภาษี</div><div class="value" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(formatTaxId(record.partnerTaxId))}</div>
      <div class="label">ประเภท</div><div class="value">${pndForm === 'PND53' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</div>
      <div class="label">ที่อยู่</div><div class="value address" style="grid-column: span 3;">${escapeHtml(partnerAddress)}</div>
    </div>
  </div>

  <div class="section">
    <h2>ลำดับที่ในแบบ</h2>
    <div class="pnd-row">
      <span><span class="cb">${checkbox(pndForm === 'PND53' === false && /ภงด\.?1ก/.test(category))}</span> ภ.ง.ด.1ก</span>
      <span><span class="cb">${checkbox(false)}</span> ภ.ง.ด.1ก พิเศษ</span>
      <span><span class="cb">${checkbox(false)}</span> ภ.ง.ด.2</span>
      <span><span class="cb">${checkbox(pndForm === 'PND3')}</span> ภ.ง.ด.3</span>
      <span><span class="cb">${checkbox(false)}</span> ภ.ง.ด.2ก</span>
      <span><span class="cb">${checkbox(false)}</span> ภ.ง.ด.3ก</span>
      <span><span class="cb">${checkbox(pndForm === 'PND53')}</span> ภ.ง.ด.53</span>
    </div>
  </div>

  <div class="section">
    <h2>ประเภทเงินได้พึงประเมินที่จ่าย</h2>
    <div class="checkboxes">
      <span class="checkbox-line"><span class="cb">${checkbox(isType1)}</span> (1) เงินเดือน ค่าจ้าง โบนัส — มาตรา 40(1)</span>
      <span class="checkbox-line"><span class="cb">${checkbox(isType2)}</span> (2) ค่าธรรมเนียม ค่านายหน้า — มาตรา 40(2)</span>
      <span class="checkbox-line"><span class="cb">${checkbox(isType3)}</span> (3) ค่าแห่งลิขสิทธิ์ — มาตรา 40(3)</span>
      <span class="checkbox-line"><span class="cb">${checkbox(isType4)}</span> (4) ดอกเบี้ย/เงินปันผล — มาตรา 40(4)</span>
      <span class="checkbox-line"><span class="cb">${checkbox(isType5)}</span> (5) ค่าเช่า — มาตรา 40(5)</span>
      <span class="checkbox-line"><span class="cb">${checkbox(isType6or8)}</span> (6) ค่าจ้างทำของ/บริการ — มาตรา 3 เตรส</span>
      ${isOther ? `<span class="checkbox-line" style="grid-column: span 2;"><span class="cb">☑</span> (7) อื่น ๆ — ${escapeHtml(category)}</span>` : ''}
    </div>
  </div>

  <div class="section">
    <h2>ผู้จ่ายเงิน</h2>
    <div class="checkboxes">
      <span class="checkbox-line"><span class="cb">☑</span> (1) หักภาษี ณ ที่จ่าย</span>
      <span class="checkbox-line"><span class="cb">☐</span> (2) ออกให้ตลอดไป</span>
      <span class="checkbox-line"><span class="cb">☐</span> (3) ออกให้ครั้งเดียว</span>
      <span class="checkbox-line"><span class="cb">☐</span> (4) อื่น ๆ</span>
    </div>
  </div>

  <table class="amounts">
    <thead>
      <tr>
        <th style="width: 60pt;">ครั้งที่</th>
        <th style="width: 120pt;">วันเดือนปีที่จ่าย</th>
        <th>จำนวนเงินที่จ่าย (บาท)</th>
        <th style="width: 80pt;">อัตราภาษี</th>
        <th>จำนวนภาษีที่หักไว้ (บาท)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${escapeHtml(formatShortThaiBuddhistDate(paidAt))}</td>
        <td class="num">${formatThb(record.baseAmount.toString())}</td>
        <td>${record.rate.toString()}%</td>
        <td class="num">${formatThb(record.whtAmount.toString())}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
        <td class="num">${formatThb(record.baseAmount.toString())}</td>
        <td></td>
        <td class="num">${formatThb(record.whtAmount.toString())}</td>
      </tr>
    </tfoot>
  </table>

  <div class="amount-words">
    <span class="label">จำนวนเงินภาษีที่หักนำส่ง (ตัวอักษร):</span>
    <strong>${escapeHtml(numberToThaiBahtText(record.whtAmount.toString()))}</strong>
  </div>

  <div class="certify">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>

  <div class="signature">
    <div class="sig-meta">
      <div class="row"><span>ในนาม</span><span class="val">${escapeHtml(company.nameTh)}</span></div>
      <div class="row"><span>ตำแหน่ง</span><span class="val"></span></div>
      <div class="row"><span>วันที่</span><span class="val">${escapeHtml(formatThaiBuddhistDate(paidAt))}</span></div>
    </div>
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">ผู้จ่ายเงิน</div>
    </div>
  </div>

  <div class="footer">
    ${pndForm === 'PND53' ? 'ภ.ง.ด.53 (นิติบุคคล)' : 'ภ.ง.ด.3 (บุคคลธรรมดา)'} ·
    รอบ ${record.periodYear + 543}/${record.periodMonth.toString().padStart(2, '0')} ·
    Auto-generated โดย HJ Account AI · เก็บไว้เป็นหลักฐานตามประมวลรัษฎากร
  </div>
</div>`;
}
