import type { Company, WithholdingTaxRecord } from '@prisma/client';
import {
  escapeHtml,
  formatShortThaiBuddhistDate,
  formatTaxId,
  formatThb,
  type PndForm,
  numberToThaiBahtText,
  thaiBuddhistYear,
  thaiMonthName,
} from './wht-shared';
import { getLogoDataUrl } from '../../pdf/pdf-templates/logo';

export interface PndSummaryInput {
  company: Company;
  form: PndForm;
  year: number;
  month: number;
  records: WithholdingTaxRecord[];
}

const FORM_LABEL: Record<PndForm, { code: string; full: string; subjects: string }> = {
  PND3: {
    code: 'ภ.ง.ด.3',
    full: 'แบบยื่นรายการภาษีหัก ณ ที่จ่าย ตามมาตรา 3 เตรส แห่งประมวลรัษฎากร',
    subjects: 'สำหรับเงินได้ที่จ่ายให้ผู้รับซึ่งเป็นบุคคลธรรมดา',
  },
  PND53: {
    code: 'ภ.ง.ด.53',
    full: 'แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ตามมาตรา 3 เตรส และมาตรา 69 ทวิ',
    subjects: 'สำหรับเงินได้ที่จ่ายให้ผู้รับซึ่งเป็นบริษัทหรือห้างหุ้นส่วนนิติบุคคล',
  },
  PND54: {
    code: 'ภ.ง.ด.54',
    full: 'แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย / นำส่ง ตามมาตรา 70 (จ่ายไปต่างประเทศ)',
    subjects: 'สำหรับเงินได้ที่จ่ายให้นิติบุคคล/บุคคลในต่างประเทศซึ่งมิได้ประกอบกิจการในไทย',
  },
};

/** Map the stored foreign income type (PND.54 records) to a Thai label. */
const FOREIGN_INCOME_LABEL: Record<string, string> = {
  ROYALTY: 'ค่าสิทธิ มาตรา 40(3)',
  SERVICE: 'ค่าบริการ/กำไรธุรกิจ',
  OTHER: 'อื่น ๆ',
};

/**
 * Render the monthly attachment ("ใบแนบ ภ.ง.ด.3" or "ใบแนบ ภ.ง.ด.53") that the
 * accountant submits along with the cash transfer to the Revenue Department.
 *
 * Layout is A4 landscape because the table has 8 columns and Thai text needs
 * room to breathe. Each row = one WhtRecord; the footer aggregates baseAmount
 * + whtAmount across all records.
 */
export function buildPndSummaryHtml(input: PndSummaryInput): string {
  const { company, form, year, month, records } = input;
  const meta = FORM_LABEL[form];
  const total = {
    base: records.reduce((s, r) => s + Number(r.baseAmount.toString()), 0),
    wht: records.reduce((s, r) => s + Number(r.whtAmount.toString()), 0),
  };

  const periodLabel = `${thaiMonthName(month)} ${thaiBuddhistYear(year)}`;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<title>${meta.code} — ${periodLabel}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; font-family: 'IBM Plex Sans Thai', 'Sarabun', sans-serif; color: #1a1a1a; font-size: 9.5pt; line-height: 1.3; }
body { padding: 10mm 12mm; }

.head { display: grid; grid-template-columns: 60pt 1fr 240px; gap: 12pt; align-items: center; padding-bottom: 8pt; border-bottom: 2px solid #1F5F8B; }
.head .logo { width: 60pt; height: 60pt; object-fit: contain; }
.head h1 { font-size: 16pt; margin: 0; color: #1F5F8B; }
.head .sub { color: #555; font-size: 9pt; margin-top: 1pt; }
.head .subjects { color: #888; font-size: 8.5pt; margin-top: 2pt; }
.period-card { border: 1.5px solid #1F5F8B; border-radius: 4pt; padding: 6pt 10pt; text-align: center; }
.period-card .label { font-size: 8pt; color: #666; }
.period-card .value { font-size: 13pt; font-weight: 700; color: #1F5F8B; }

.party { margin-top: 8pt; display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
.party-block { border: 1px solid #ccc; padding: 6pt 10pt; }
.party-block .h { font-size: 9pt; color: #555; margin-bottom: 3pt; font-weight: 600; }
.party-block .row { display: grid; grid-template-columns: 100pt 1fr; gap: 4pt; align-items: baseline; }
.party-block .label { color: #777; font-size: 9pt; }
.party-block .value { font-size: 9.5pt; }
.party-block .value.mono { font-family: 'IBM Plex Mono', monospace; }

table.detail { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 8.5pt; }
table.detail thead th { background: #f0f0f0; padding: 4pt 5pt; text-align: center; border: 1px solid #888; font-weight: 600; }
table.detail tbody td { padding: 3.5pt 5pt; border: 1px solid #aaa; vertical-align: top; }
table.detail tbody td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: 'IBM Plex Mono', monospace; }
table.detail tbody td.center { text-align: center; }
table.detail tfoot td { padding: 5pt 6pt; border: 1px solid #888; background: #f5f5f5; font-weight: 600; }
table.detail tfoot td.num { text-align: right; font-variant-numeric: tabular-nums; }

.summary { margin-top: 10pt; display: grid; grid-template-columns: 1fr 320pt; gap: 10pt; }
.amount-words { border: 1px solid #888; padding: 6pt 10pt; font-size: 9.5pt; display: flex; align-items: center; gap: 6pt; }
.amount-words .label { color: #666; }
.amount-words .value { font-weight: 700; }
.box-total { border: 2px solid #1F5F8B; padding: 6pt 10pt; }
.box-total .label { font-size: 8.5pt; color: #555; }
.box-total .value { font-size: 14pt; font-weight: 700; color: #1F5F8B; text-align: right; font-variant-numeric: tabular-nums; }

.certify { margin-top: 10pt; font-size: 9pt; color: #333; }

.signature { margin-top: 14pt; display: grid; grid-template-columns: 1fr 260pt; gap: 16pt; align-items: end; }
.sig-meta { font-size: 9pt; color: #555; }
.sig-meta .row { display: grid; grid-template-columns: 70pt 1fr; gap: 4pt; align-items: baseline; margin-bottom: 2pt; }
.sig-meta .val { border-bottom: 1px dotted #888; min-height: 14pt; }
.sig-line { border-bottom: 1px dotted #555; height: 18pt; }
.sig-label { margin-top: 2pt; text-align: center; font-size: 9pt; color: #555; }

.footer { margin-top: 8pt; padding-top: 4pt; border-top: 1px solid #ccc; font-size: 8pt; color: #777; }
</style>
</head>
<body>

${(() => {
  const logo = getLogoDataUrl();
  const logoCell = logo
    ? `<img class="logo" src="${logo}" alt="logo"/>`
    : '<div></div>';
  return `<div class="head">
  ${logoCell}
  <div>
    <h1>ใบแนบ ${meta.code}</h1>
    <div class="sub">${escapeHtml(meta.full)}</div>
    <div class="subjects">${escapeHtml(meta.subjects)}</div>
  </div>
  <div class="period-card">
    <div class="label">รอบเดือนภาษี</div>
    <div class="value">${escapeHtml(periodLabel)}</div>
  </div>
</div>`;
})()}

<div class="party">
  <div class="party-block">
    <div class="h">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (Withholder)</div>
    <div class="row"><div class="label">ชื่อ</div><div class="value">${escapeHtml(company.nameTh)}</div></div>
    <div class="row"><div class="label">เลขผู้เสียภาษี</div><div class="value mono">${escapeHtml(formatTaxId(company.taxId))}</div></div>
    <div class="row"><div class="label">ที่อยู่</div><div class="value">${escapeHtml(company.address ?? '')}</div></div>
    <div class="row"><div class="label">โทร</div><div class="value">${escapeHtml(company.phone ?? '')}</div></div>
  </div>
  <div class="party-block">
    <div class="h">รายละเอียดการยื่น</div>
    <div class="row"><div class="label">แบบยื่น</div><div class="value">${escapeHtml(meta.code)}</div></div>
    <div class="row"><div class="label">เดือนภาษี</div><div class="value">${escapeHtml(periodLabel)}</div></div>
    <div class="row"><div class="label">จำนวนผู้รับ</div><div class="value">${records.length} ราย</div></div>
    <div class="row"><div class="label">ยื่นแบบ</div><div class="value">☐ ปกติ &nbsp; ☐ เพิ่มเติม</div></div>
  </div>
</div>

<table class="detail">
  <thead>
    <tr>
      <th style="width: 4%;">ลำดับ</th>
      <th style="width: 11%;">เลขประจำตัวผู้เสียภาษี</th>
      <th style="width: 22%;">ชื่อ-สกุล / นิติบุคคล</th>
      <th style="width: 8%;">วันที่จ่าย</th>
      <th>ประเภทเงินได้</th>
      <th style="width: 8%;">เลข 50 ทวิ</th>
      <th style="width: 11%;">จำนวนเงินที่จ่าย</th>
      <th style="width: 5%;">อัตรา</th>
      <th style="width: 11%;">ภาษีที่หัก</th>
    </tr>
  </thead>
  <tbody>
    ${
      records.length === 0
        ? `<tr><td colspan="9" style="text-align:center; color:#888; padding: 24pt;">ไม่มีรายการหักภาษี ณ ที่จ่ายในเดือนนี้</td></tr>`
        : records
            .map(
              (r, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td class="center" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(formatTaxId(r.partnerTaxId))}</td>
        <td>${escapeHtml(r.partnerName)}</td>
        <td class="center">${escapeHtml(formatShortThaiBuddhistDate(new Date(r.paidAt)))}</td>
        <td>${escapeHtml(
          form === 'PND54'
            ? FOREIGN_INCOME_LABEL[r.category ?? ''] ?? r.category ?? '—'
            : r.category ?? '—',
        )}</td>
        <td class="center" style="font-family:'IBM Plex Mono',monospace; font-size: 7.5pt;">${escapeHtml(r.certNumber ?? '—')}</td>
        <td class="num">${formatThb(r.baseAmount.toString())}</td>
        <td class="center">${r.rate.toString()}%</td>
        <td class="num">${formatThb(r.whtAmount.toString())}</td>
      </tr>`,
            )
            .join('')
    }
  </tbody>
  ${
    records.length > 0
      ? `<tfoot>
    <tr>
      <td colspan="6" style="text-align:right;">รวมทั้งสิ้น</td>
      <td class="num">${formatThb(total.base)}</td>
      <td></td>
      <td class="num">${formatThb(total.wht)}</td>
    </tr>
  </tfoot>`
      : ''
  }
</table>

<div class="summary">
  <div class="amount-words">
    <span class="label">รวมจำนวนภาษีที่หักนำส่งทั้งสิ้น (ตัวอักษร):</span>
    <span class="value">${escapeHtml(numberToThaiBahtText(total.wht))}</span>
  </div>
  <div class="box-total">
    <div class="label">ภาษีที่หักและนำส่ง</div>
    <div class="value">${formatThb(total.wht)} บาท</div>
  </div>
</div>

<div class="certify">
  ข้าพเจ้าขอรับรองว่ารายการที่แสดงข้างต้นถูกต้องและครบถ้วน ตามที่ได้จ่ายและหักภาษี ณ ที่จ่ายไว้แล้ว และได้นำส่งภาษีไว้แก่กรมสรรพากรพร้อมแบบยื่นนี้ทุกประการ
</div>

<div class="signature">
  <div class="sig-meta">
    <div class="row"><span>ในนาม</span><span class="val">${escapeHtml(company.nameTh)}</span></div>
    <div class="row"><span>ตำแหน่ง</span><span class="val"></span></div>
    <div class="row"><span>วันที่ยื่น</span><span class="val"></span></div>
  </div>
  <div>
    <div class="sig-line"></div>
    <div class="sig-label">ผู้มีอำนาจลงนาม</div>
  </div>
</div>

<div class="footer">
  ${escapeHtml(meta.code)} · ${escapeHtml(periodLabel)} · ${records.length} รายการ · Auto-generated โดย HJ Account AI ·
  สำหรับยื่นกรมสรรพากรพร้อมส่งเงินภาษี ${formatThb(total.wht)} บาท
</div>

</body>
</html>`;
}
