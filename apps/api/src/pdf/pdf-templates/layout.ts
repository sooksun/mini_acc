import type { Company, SalesDocument, SalesDocumentItem } from '@prisma/client';
import { PDF_DOC_META, PdfDocMeta } from './meta';
import {
  escapeHtml,
  formatTaxId,
  formatThaiDateShort,
  formatThb,
  numberToThaiBahtText,
} from './format';
import { pdfStyles } from './styles';

const MIN_ROWS = 21;

export interface RenderInput {
  company: Company;
  doc: SalesDocument & { items: SalesDocumentItem[] };
  watermark?: string;
}

export function buildPdfHtml(input: RenderInput): string {
  const meta = PDF_DOC_META[
    input.doc.type as keyof typeof PDF_DOC_META
  ] as PdfDocMeta | undefined;
  if (!meta) {
    throw new Error(`Unsupported document type for PDF: ${input.doc.type}`);
  }

  const { company, doc } = input;
  const customerTaxId = formatTaxId(doc.customerSnapshotTaxId);
  const isHeadOffice =
    !doc.customerSnapshotBranch || doc.customerSnapshotBranch.trim().length === 0;
  const branchValue = isHeadOffice ? '' : escapeHtml(doc.customerSnapshotBranch);

  const numberDisplay = doc.number.startsWith('DRAFT-')
    ? '<span style="color:#888;font-style:italic;">' + escapeHtml(doc.number) + '</span>'
    : '<strong>' + escapeHtml(doc.number) + '</strong>';

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(meta.title)} ${escapeHtml(doc.number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${pdfStyles(meta.primaryColor)}</style>
</head>
<body>
${headerSection(company, meta)}
${titleBox(meta)}
${customerSection(doc, customerTaxId, isHeadOffice, branchValue, numberDisplay)}
${itemsTable(doc, meta)}
${meta.receivedNote ? receivedNoteBlock(meta.receivedNote) : ''}
${summaryBlock(doc, meta)}
${notesBlock()}
${signaturesBlock(meta, company)}
${input.watermark ? watermarkOverlay(input.watermark) : ''}
</body>
</html>`;
}

function headerSection(company: Company, meta: PdfDocMeta): string {
  const initials = company.brandShort ?? 'SN';
  const tagline = company.tagline ? `<div class="sub">${escapeHtml(company.tagline)}</div>` : '';
  const phone = company.phone ? `โทร. ${escapeHtml(company.phone)}` : '';
  const taxLine = `เลขประจำตัวผู้เสียภาษี ${escapeHtml(formatTaxId(company.taxId))}`;
  return `
<div class="header">
  <div class="brand-mark">
    <div>${escapeHtml(initials)}</div>
    ${tagline}
  </div>
  <div class="company-block">
    <div class="company-name-th">${escapeHtml(company.nameTh)}</div>
    ${company.nameEn ? `<div class="company-name-en">${escapeHtml(company.nameEn)}</div>` : ''}
    <div class="company-line">สำนักงานใหญ่ : ${escapeHtml(company.address)}</div>
    <div class="company-line">${phone} &nbsp; ${taxLine}</div>
  </div>
  <div class="for-customer">สำหรับลูกค้า</div>
</div>`;
}

function titleBox(meta: PdfDocMeta): string {
  return `<div class="title-box">${escapeHtml(meta.title)}</div>`;
}

function customerSection(
  doc: SalesDocument,
  customerTaxId: string,
  isHeadOffice: boolean,
  branchValue: string,
  numberDisplay: string,
): string {
  const dateShort = formatThaiDateShort(doc.documentDate);
  const yearLabel = `ปี ${doc.beYear - 1}-${doc.beYear}`;
  return `
<div class="meta-grid">
  <div class="meta-left">
    <div class="field"><div class="label">นามลูกค้า</div><div class="value">${escapeHtml(doc.customerSnapshotName)} <span style="color:#666; margin-left:8px;">${escapeHtml(yearLabel)}</span></div></div>
    <div class="field"><div class="label">ที่อยู่</div><div class="value">${escapeHtml(doc.customerSnapshotAddress ?? '')}</div></div>
  </div>
  <div class="meta-right">
    <div class="field"><div class="label">เลขที่</div><div class="value">${numberDisplay}</div></div>
    <div class="field"><div class="label">วันที่</div><div class="value">${escapeHtml(dateShort)}</div></div>
  </div>
</div>
<div class="branch-row">
  <div class="field"><div class="label">เลขประจำตัวผู้เสียภาษี</div><div class="value" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(customerTaxId)}</div></div>
  <span class="checkbox ${isHeadOffice ? 'checked' : ''}">${isHeadOffice ? 'X' : ''}</span> สำนักงานใหญ่
  <span class="checkbox ${!isHeadOffice ? 'checked' : ''}">${!isHeadOffice ? 'X' : ''}</span> สาขาที่<span class="branch-no">${branchValue}</span>
</div>`;
}

function itemsTable(
  doc: SalesDocument & { items: SalesDocumentItem[] },
  _meta: PdfDocMeta,
): string {
  const rows: string[] = [];
  for (const item of doc.items) {
    rows.push(itemRow(item));
  }
  const filler = Math.max(0, MIN_ROWS - doc.items.length);
  for (let i = 0; i < filler; i++) {
    rows.push(emptyRow(doc.items.length + i + 1));
  }
  return `
<table class="items">
  <thead>
    <tr>
      <th style="width: 28px;">ลำดับ</th>
      <th style="width: 70px;">รหัสสินค้า</th>
      <th>รายละเอียด</th>
      <th class="num" style="width: 50px;">จำนวน</th>
      <th style="width: 50px;">หน่วย</th>
      <th class="num" style="width: 70px;">ราคา/หน่วย</th>
      <th class="num" style="width: 80px;">จำนวนเงิน</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('\n')}
  </tbody>
</table>`;
}

function itemRow(item: SalesDocumentItem): string {
  const qty = Number(item.quantity.toString());
  const qtyStr = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2);
  return `
<tr>
  <td class="center">${item.lineNumber}</td>
  <td>${escapeHtml(item.productCode ?? '')}</td>
  <td>${escapeHtml(item.description).replace(/\n/g, '<br/>')}</td>
  <td class="num">${qtyStr}</td>
  <td class="center">${escapeHtml(item.unit)}</td>
  <td class="num">${formatThb(item.unitPrice.toString())}</td>
  <td class="num">${formatThb(item.lineTotal.toString())}</td>
</tr>`;
}

function emptyRow(idx: number): string {
  return `<tr>
  <td class="center" style="color:#bbb;">${idx}</td>
  <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
</tr>`;
}

function receivedNoteBlock(note: string): string {
  return `<div class="received-note">${escapeHtml(note)}</div>`;
}

function summaryBlock(doc: SalesDocument, _meta: PdfDocMeta): string {
  const inWords = numberToThaiBahtText(doc.netReceived.toString());
  const vatPct = Number(doc.vatRate.toString()).toString();
  const whtPct = Number(doc.whtRate.toString()).toString();
  return `
<div class="summary-grid">
  <div class="amount-words">
    <span class="label">ตัวอักษร.</span>
    <span class="value">(${escapeHtml(inWords)})</span>
  </div>
  <table class="summary">
    <tr><td class="label">รวมเงิน<span class="en">TOTAL AMOUNT</span></td><td class="value">${formatThb(doc.subtotal.toString())}</td></tr>
    <tr><td class="label">ภาษีมูลค่าเพิ่ม ${vatPct}%<span class="en">VAT</span></td><td class="value">${formatThb(doc.vatAmount.toString())}</td></tr>
    <tr><td class="label">รวมหลัง VAT<span class="en">TOTAL AFTER VAT</span></td><td class="value">${formatThb(doc.totalAfterVat.toString())}</td></tr>
    <tr><td class="label">หักภาษี ณ ที่จ่าย ${whtPct}%<span class="en">WITHHOLDING TAX</span></td><td class="value">${formatThb(doc.whtAmount.toString())}</td></tr>
    <tr class="grand"><td class="label">ยอดเงินสุทธิ<span class="en">NET RECEIVED</span></td><td class="value">${formatThb(doc.netReceived.toString())}</td></tr>
  </table>
</div>`;
}

function notesBlock(): string {
  return `
<div class="notes">
  <div class="h">หมายเหตุ:</div>
  <ol>
    <li>กรณีชำระเงินโดยเช็ค กรุณาสั่งจ่ายเช็คขีดคร่อมในนาม &ldquo;หจก. โซลูชั่น เนกซ์เจน&rdquo; เท่านั้น</li>
    <li>สินค้าตามรายการข้างต้นแม้จะได้ส่งมอบให้แก่ผู้ซื้อแล้วก็ยังคงเป็นทรัพย์สินของผู้ขายจนกว่าผู้ซื้อจะได้ชำระเงินเรียบร้อยแล้ว</li>
    <li>บริษัทฯ ขอสงวนสิทธิ์ในการแก้ไขใบกำกับภาษีภายใน 7 วัน นับจากวันที่ระบุในใบกำกับภาษี (ผิด ตก ยกเว้น E. &amp; OE.)</li>
  </ol>
</div>`;
}

function signaturesBlock(meta: PdfDocMeta, company: Company): string {
  return `
<div class="signatures">
  <div class="sig-box">
    <div class="line"></div>
    <div class="label">${escapeHtml(meta.signatures.left)}</div>
    <div class="date"><span>วันที่</span><span class="dline"></span></div>
  </div>
  <div class="sig-box">
    <div class="line"></div>
    <div class="label">${escapeHtml(meta.signatures.middle)}</div>
    <div class="date"><span>วันที่</span><span class="dline"></span></div>
  </div>
  <div class="sig-box">
    <div class="sig-name">ในนาม ${escapeHtml(company.nameTh)}</div>
    <div class="line"></div>
    <div class="label">${escapeHtml(meta.signatures.right)}</div>
  </div>
</div>`;
}

function watermarkOverlay(text: string): string {
  return `<div class="watermark">${escapeHtml(text)}</div>`;
}
