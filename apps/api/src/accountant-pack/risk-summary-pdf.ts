import type { PrismaClient } from '@prisma/client';
import { PdfRendererService } from '../pdf/pdf-renderer.service';

const LEVEL_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต',
  HIGH: 'สูง',
  MEDIUM: 'ปานกลาง',
  LOW: 'ต่ำ',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'เปิดอยู่',
  IN_REVIEW: 'กำลังตรวจ',
  RESOLVED: 'แก้ไขแล้ว',
  ACCEPTED_RISK: 'รับความเสี่ยง',
  DISMISSED: 'ปิด',
};

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a 1-page risk summary PDF for the period — counts by level + a table
 * of every risk that was open at any time during the period.
 */
export async function buildRiskSummaryPdf(
  prisma: PrismaClient,
  renderer: PdfRendererService,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const risks = await prisma.riskItem.findMany({
    where: {
      companyId,
      OR: [
        { detectedAt: { gte: start, lt: end } },
        { status: { in: ['OPEN', 'IN_REVIEW'] } },
      ],
    },
    orderBy: [{ status: 'asc' }, { level: 'desc' }, { detectedAt: 'desc' }],
  });

  const byLevel = {
    CRITICAL: risks.filter((r) => r.level === 'CRITICAL').length,
    HIGH: risks.filter((r) => r.level === 'HIGH').length,
    MEDIUM: risks.filter((r) => r.level === 'MEDIUM').length,
    LOW: risks.filter((r) => r.level === 'LOW').length,
  };

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<title>สรุปความเสี่ยง ${year}-${String(month).padStart(2, '0')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16mm; font-family: 'IBM Plex Sans Thai', sans-serif; font-size: 10pt; color: #1a1a1a; }
  h1 { font-size: 16pt; margin: 0 0 4pt; }
  .sub { color: #555; font-size: 9pt; margin-bottom: 12pt; }
  .summary { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8pt; margin-bottom: 14pt; }
  .card { border: 1px solid #ccc; border-radius: 4pt; padding: 8pt 10pt; }
  .card .label { font-size: 9pt; color: #555; }
  .card .value { font-size: 18pt; font-weight: 700; margin-top: 2pt; }
  .card.critical .value { color: #c0392b; }
  .card.high .value { color: #d96b00; }
  .card.medium .value { color: #d4a017; }
  .card.low .value { color: #2980b9; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead th { background: #f2f2f2; padding: 5pt 6pt; text-align: left; border: 1px solid #ccc; font-weight: 600; }
  tbody td { padding: 4pt 6pt; border: 1px solid #ddd; vertical-align: top; }
  .pill { display: inline-block; border: 1px solid; border-radius: 999px; padding: 1pt 6pt; font-size: 8.5pt; }
  .pill.CRITICAL { color: #c0392b; border-color: #c0392b; background: rgba(192, 57, 43, 0.08); }
  .pill.HIGH { color: #d96b00; border-color: #d96b00; background: rgba(217, 107, 0, 0.08); }
  .pill.MEDIUM { color: #d4a017; border-color: #d4a017; background: rgba(212, 160, 23, 0.08); }
  .pill.LOW { color: #2980b9; border-color: #2980b9; background: rgba(41, 128, 185, 0.08); }
  .pill.OPEN { color: #c0392b; border-color: #c0392b; }
  .pill.IN_REVIEW { color: #d96b00; border-color: #d96b00; }
  .pill.RESOLVED { color: #27ae60; border-color: #27ae60; }
  .pill.ACCEPTED_RISK, .pill.DISMISSED { color: #6b6b6b; border-color: #6b6b6b; }
</style>
</head>
<body>
  <h1>สรุปความเสี่ยง — รอบ ${year + 543}/${String(month).padStart(2, '0')}</h1>
  <div class="sub">รวมรายการที่ตรวจพบในงวด + รายการเปิดค้าง ณ เวลาส่งออก</div>

  <div class="summary">
    <div class="card critical"><div class="label">CRITICAL</div><div class="value">${byLevel.CRITICAL}</div></div>
    <div class="card high"><div class="label">HIGH</div><div class="value">${byLevel.HIGH}</div></div>
    <div class="card medium"><div class="label">MEDIUM</div><div class="value">${byLevel.MEDIUM}</div></div>
    <div class="card low"><div class="label">LOW</div><div class="value">${byLevel.LOW}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 8%;">ระดับ</th>
        <th style="width: 12%;">ประเภท</th>
        <th>รายการ</th>
        <th style="width: 14%;">เป้าหมาย</th>
        <th style="width: 12%;">สถานะ</th>
      </tr>
    </thead>
    <tbody>
      ${
        risks.length === 0
          ? '<tr><td colspan="5" style="text-align:center; color:#888; padding: 20pt;">ไม่มีรายการความเสี่ยง</td></tr>'
          : risks
              .map(
                (r) => `
        <tr>
          <td><span class="pill ${r.level}">${LEVEL_LABEL[r.level] ?? r.level}</span></td>
          <td><code style="font-size:8pt;">${escapeHtml(r.type)}</code></td>
          <td>
            <div style="font-weight:500;">${escapeHtml(r.title)}</div>
            ${r.description ? `<div style="color:#666; font-size:8.5pt; margin-top:1pt;">${escapeHtml(r.description)}</div>` : ''}
          </td>
          <td style="font-size:8.5pt; color:#555;">${escapeHtml(r.entityType ?? '')} ${escapeHtml(r.entityId ?? '')}</td>
          <td><span class="pill ${r.status}">${STATUS_LABEL[r.status] ?? r.status}</span></td>
        </tr>`,
              )
              .join('')
      }
    </tbody>
  </table>
</body>
</html>`;

  return renderer.render(html);
}
