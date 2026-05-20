import ExcelJS from 'exceljs';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Builders for each xlsx file in the Accountant Pack (PRD §18).
 *
 * Every builder takes (prisma, companyId, year, month) and returns a Buffer
 * containing a single-sheet xlsx file. We deliberately keep the output simple:
 *   - one row per record, one sheet per file
 *   - Thai column headers + monospace number columns
 *   - dates formatted as ISO short ("2026-05-10") — Excel/Numbers reads them
 *     as dates; users can switch to Buddhist format manually
 *
 * Decimal columns serialize via .toString() so xlsx stores the number, not a
 * truncated float.
 */

function rangeForMonth(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function num(value: Prisma.Decimal | string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}

function applyHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function bufferOf(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// 01 — Sales register
// ---------------------------------------------------------------------------
export async function buildSalesRegister(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const range = rangeForMonth(year, month);
  const docs = await prisma.salesDocument.findMany({
    where: {
      companyId,
      documentDate: { gte: range.start, lt: range.end },
      status: { in: ['USER_CONFIRMED', 'ACCOUNTED', 'PENDING_ACCOUNTANT', 'ACCOUNTANT_APPROVED', 'LOCKED'] },
    },
    orderBy: [{ documentDate: 'asc' }, { number: 'asc' }],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('สมุดรายวันขาย');
  ws.columns = [
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'ประเภท', key: 'type', width: 22 },
    { header: 'เลขที่', key: 'number', width: 18 },
    { header: 'ลูกค้า', key: 'customer', width: 32 },
    { header: 'เลขผู้เสียภาษีลูกค้า', key: 'taxId', width: 18 },
    { header: 'ฐานภาษี (Subtotal)', key: 'subtotal', width: 14 },
    { header: 'VAT', key: 'vat', width: 12 },
    { header: 'WHT', key: 'wht', width: 12 },
    { header: 'ยอดสุทธิ', key: 'netReceived', width: 14 },
    { header: 'สถานะ', key: 'status', width: 16 },
  ];

  for (const doc of docs) {
    ws.addRow({
      date: doc.documentDate.toISOString().slice(0, 10),
      type: doc.type,
      number: doc.number,
      customer: doc.customerSnapshotName,
      taxId: doc.customerSnapshotTaxId ?? '',
      subtotal: num(doc.subtotal),
      vat: num(doc.vatAmount),
      wht: num(doc.whtAmount),
      netReceived: num(doc.netReceived),
      status: doc.status,
    });
  }

  ['subtotal', 'vat', 'wht', 'netReceived'].forEach((k) => {
    ws.getColumn(k).numFmt = '#,##0.00';
  });
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 02 — Delivery register
// ---------------------------------------------------------------------------
export async function buildDeliveryRegister(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const range = rangeForMonth(year, month);
  const docs = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: 'DELIVERY_NOTE',
      documentDate: { gte: range.start, lt: range.end },
      status: { in: ['USER_CONFIRMED', 'ACCOUNTED', 'PENDING_ACCOUNTANT', 'ACCOUNTANT_APPROVED', 'LOCKED'] },
    },
    include: { items: { orderBy: { lineNumber: 'asc' } } },
    orderBy: { documentDate: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ทะเบียนใบส่งของ');
  ws.columns = [
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'เลขที่ใบส่งของ', key: 'number', width: 18 },
    { header: 'ลูกค้า', key: 'customer', width: 32 },
    { header: 'จำนวนรายการ', key: 'itemCount', width: 12 },
    { header: 'ยอดรวม', key: 'total', width: 14 },
    { header: 'สถานะ', key: 'status', width: 16 },
  ];
  for (const doc of docs) {
    ws.addRow({
      date: doc.documentDate.toISOString().slice(0, 10),
      number: doc.number,
      customer: doc.customerSnapshotName,
      itemCount: doc.items.length,
      total: num(doc.grandTotal),
      status: doc.status,
    });
  }
  ws.getColumn('total').numFmt = '#,##0.00';
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 03 — Purchase / Expense register
// ---------------------------------------------------------------------------
export async function buildPurchaseRegister(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const range = rangeForMonth(year, month);
  const records = await prisma.expenseRecord.findMany({
    where: {
      companyId,
      status: 'RECORDED',
      treatAsIntangible: false,
      expenseDate: { gte: range.start, lt: range.end },
    },
    include: { vendor: { select: { nameTh: true, taxId: true } } },
    orderBy: { expenseDate: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('สมุดรายจ่าย');
  ws.columns = [
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'เลขที่เอกสาร', key: 'docNo', width: 18 },
    { header: 'ผู้ขาย', key: 'vendor', width: 32 },
    { header: 'เลขผู้เสียภาษี', key: 'taxId', width: 18 },
    { header: 'หมวด', key: 'category', width: 22 },
    { header: 'ก่อน VAT', key: 'subtotal', width: 14 },
    { header: 'VAT', key: 'vat', width: 12 },
    { header: 'WHT', key: 'wht', width: 12 },
    { header: 'จ่ายจริง', key: 'grand', width: 14 },
  ];
  for (const r of records) {
    ws.addRow({
      date: r.expenseDate.toISOString().slice(0, 10),
      docNo: r.documentNumber ?? '',
      vendor: r.vendor.nameTh,
      taxId: r.vendor.taxId ?? '',
      category: r.category ?? '',
      subtotal: num(r.subtotal),
      vat: num(r.vatAmount),
      wht: num(r.withholdingTaxAmount),
      grand: num(r.grandTotal),
    });
  }
  ['subtotal', 'vat', 'wht', 'grand'].forEach((k) => {
    ws.getColumn(k).numFmt = '#,##0.00';
  });
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 04 — Payment register
// ---------------------------------------------------------------------------
export async function buildPaymentRegister(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const range = rangeForMonth(year, month);
  const payments = await prisma.payment.findMany({
    where: {
      companyId,
      paymentDate: { gte: range.start, lt: range.end },
    },
    include: { partner: { select: { nameTh: true, taxId: true } } },
    orderBy: { paymentDate: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('สมุดรับ-จ่ายเงิน');
  ws.columns = [
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'ทิศทาง', key: 'direction', width: 10 },
    { header: 'คู่ค้า', key: 'partner', width: 32 },
    { header: 'เลขผู้เสียภาษี', key: 'taxId', width: 18 },
    { header: 'อ้างอิง', key: 'ref', width: 18 },
    { header: 'วิธีชำระ', key: 'method', width: 14 },
    { header: 'ยอด', key: 'amount', width: 14 },
    { header: 'WHT', key: 'wht', width: 12 },
    { header: 'สถานะ', key: 'status', width: 12 },
  ];
  for (const p of payments) {
    ws.addRow({
      date: p.paymentDate.toISOString().slice(0, 10),
      direction: p.direction === 'IN' ? 'รับเข้า' : 'จ่ายออก',
      partner: p.partner.nameTh,
      taxId: p.partner.taxId ?? '',
      ref: p.reference ?? '',
      method: p.method,
      amount: num(p.amount),
      wht: num(p.whtAmount),
      status: p.status,
    });
  }
  ['amount', 'wht'].forEach((k) => {
    ws.getColumn(k).numFmt = '#,##0.00';
  });
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 05 — Bank reconciliation (placeholder until Bank module ships)
// ---------------------------------------------------------------------------
export async function buildBankReconciliation(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const range = rangeForMonth(year, month);
  const lines = await prisma.bankStatementLine.findMany({
    where: { companyId, postedAt: { gte: range.start, lt: range.end } },
    orderBy: { postedAt: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bank Reconciliation');
  ws.columns = [
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'บัญชีธนาคาร', key: 'bank', width: 22 },
    { header: 'ฝั่ง', key: 'side', width: 10 },
    { header: 'ยอด', key: 'amount', width: 14 },
    { header: 'รายละเอียด', key: 'desc', width: 40 },
    { header: 'อ้างอิง', key: 'ref', width: 18 },
    { header: 'จับคู่กับ Payment', key: 'matched', width: 18 },
  ];
  for (const l of lines) {
    ws.addRow({
      date: l.postedAt.toISOString().slice(0, 10),
      bank: l.bankAccount,
      side: l.side,
      amount: num(l.amount),
      desc: l.description,
      ref: l.reference ?? '',
      matched: l.matchedPaymentId ?? 'ยังไม่จับคู่',
    });
  }
  ws.getColumn('amount').numFmt = '#,##0.00';
  applyHeader(ws);
  if (lines.length === 0) {
    ws.addRow({ desc: '(ยังไม่มีการ import bank statement ในงวดนี้)' });
  }
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 06 — VAT report
// ---------------------------------------------------------------------------
export async function buildVatReport(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const records = await prisma.vatRecord.findMany({
    where: { companyId, periodYear: year, periodMonth: month },
    orderBy: [{ recordType: 'asc' }, { documentDate: 'asc' }],
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VAT Report');
  ws.columns = [
    { header: 'ประเภท', key: 'type', width: 12 },
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'เลขที่เอกสาร', key: 'docNo', width: 18 },
    { header: 'คู่ค้า', key: 'partner', width: 32 },
    { header: 'เลขผู้เสียภาษี', key: 'taxId', width: 18 },
    { header: 'ฐานภาษี', key: 'base', width: 14 },
    { header: 'อัตรา', key: 'rate', width: 8 },
    { header: 'VAT', key: 'vat', width: 14 },
  ];
  for (const r of records) {
    ws.addRow({
      type: r.recordType === 'OUTPUT' ? 'ภาษีขาย' : 'ภาษีซื้อ',
      date: r.documentDate.toISOString().slice(0, 10),
      docNo: r.documentNumber ?? '',
      partner: r.partnerName,
      taxId: r.partnerTaxId ?? '',
      base: num(r.baseAmount),
      rate: num(r.vatRate),
      vat: num(r.vatAmount),
    });
  }
  ['base', 'vat'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0.00'));
  ws.getColumn('rate').numFmt = '0.00"%"';
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 07 — WHT report
// ---------------------------------------------------------------------------
export async function buildWhtReport(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const records = await prisma.withholdingTaxRecord.findMany({
    where: { companyId, periodYear: year, periodMonth: month },
    orderBy: [{ recordType: 'asc' }, { paidAt: 'asc' }],
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('WHT Report');
  ws.columns = [
    { header: 'ประเภท', key: 'type', width: 22 },
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'คู่ค้า', key: 'partner', width: 32 },
    { header: 'เลขผู้เสียภาษี', key: 'taxId', width: 18 },
    { header: 'ฐานภาษี', key: 'base', width: 14 },
    { header: 'อัตรา', key: 'rate', width: 8 },
    { header: 'WHT', key: 'wht', width: 14 },
    { header: 'เลขที่ 50 ทวิ', key: 'cert', width: 18 },
    { header: 'ประเภทเงินได้', key: 'category', width: 18 },
  ];
  for (const r of records) {
    ws.addRow({
      type: r.recordType === 'PAYABLE' ? 'หักไว้แทนสรรพากร' : 'ถูกหักไว้',
      date: r.paidAt.toISOString().slice(0, 10),
      partner: r.partnerName,
      taxId: r.partnerTaxId ?? '',
      base: num(r.baseAmount),
      rate: num(r.rate),
      wht: num(r.whtAmount),
      cert: r.certNumber ?? '',
      category: r.category ?? '',
    });
  }
  ['base', 'wht'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0.00'));
  ws.getColumn('rate').numFmt = '0.00"%"';
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 08 — Journal entries
// ---------------------------------------------------------------------------
export async function buildJournalReport(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId, periodYear: year, periodMonth: month, status: 'POSTED' },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
    orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Journal Entries');
  ws.columns = [
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'เลข JE', key: 'jeId', width: 26 },
    { header: 'แหล่งที่มา', key: 'source', width: 28 },
    { header: 'คำอธิบาย', key: 'desc', width: 40 },
    { header: 'รหัสบัญชี', key: 'accCode', width: 10 },
    { header: 'ชื่อบัญชี', key: 'accName', width: 30 },
    { header: 'เดบิต', key: 'debit', width: 14 },
    { header: 'เครดิต', key: 'credit', width: 14 },
  ];
  for (const entry of entries) {
    for (const [i, line] of entry.lines.entries()) {
      ws.addRow({
        date: i === 0 ? entry.entryDate.toISOString().slice(0, 10) : '',
        jeId: i === 0 ? entry.id : '',
        source: i === 0 ? `${entry.sourceType}/${entry.sourceId ?? ''}` : '',
        desc: i === 0 ? entry.description : '',
        accCode: line.accountCode,
        accName: line.accountName,
        debit: num(line.debit),
        credit: num(line.credit),
      });
    }
    // Blank separator row between entries
    ws.addRow({});
  }
  ['debit', 'credit'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0.00'));
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 09 — Inventory report
// ---------------------------------------------------------------------------
export async function buildInventoryReport(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const range = rangeForMonth(year, month);
  const movements = await prisma.inventoryMovement.findMany({
    where: { companyId, movementDate: { gte: range.start, lt: range.end } },
    include: { product: { select: { code: true, nameTh: true, unit: true } } },
    orderBy: [{ productId: 'asc' }, { movementDate: 'asc' }],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Inventory Movements');
  ws.columns = [
    { header: 'วันที่', key: 'date', width: 12 },
    { header: 'รหัสสินค้า', key: 'code', width: 12 },
    { header: 'ชื่อสินค้า', key: 'name', width: 32 },
    { header: 'ประเภท', key: 'type', width: 14 },
    { header: 'จำนวน', key: 'qty', width: 12 },
    { header: 'หน่วย', key: 'unit', width: 10 },
    { header: 'ต้นทุน/หน่วย', key: 'unitCost', width: 14 },
    { header: 'รวมต้นทุน', key: 'totalCost', width: 14 },
    { header: 'อ้างอิง', key: 'ref', width: 22 },
  ];
  for (const m of movements) {
    ws.addRow({
      date: m.movementDate.toISOString().slice(0, 10),
      code: m.product.code ?? '',
      name: m.product.nameTh,
      type: m.type,
      qty: num(m.quantity),
      unit: m.product.unit,
      unitCost: m.unitCost ? num(m.unitCost) : '',
      totalCost: m.totalCost ? num(m.totalCost) : '',
      ref: m.referenceType ? `${m.referenceType}/${m.referenceId ?? ''}` : '',
    });
  }
  ['qty'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0.0000'));
  ['unitCost', 'totalCost'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0.00'));
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 10 — Fixed asset register
// ---------------------------------------------------------------------------
export async function buildFixedAssetRegister(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  // As-of end-of-period snapshot of all assets that existed at that time.
  const endOfPeriod = new Date(Date.UTC(year, month, 1));
  const assets = await prisma.fixedAsset.findMany({
    where: {
      companyId,
      acquiredAt: { lt: endOfPeriod },
    },
    orderBy: [{ status: 'asc' }, { acquiredAt: 'asc' }],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fixed Assets');
  ws.columns = [
    { header: 'รหัส', key: 'code', width: 12 },
    { header: 'ชื่อทรัพย์สิน', key: 'name', width: 32 },
    { header: 'หมวด', key: 'category', width: 18 },
    { header: 'วันที่ได้มา', key: 'acquiredAt', width: 12 },
    { header: 'ต้นทุน', key: 'cost', width: 14 },
    { header: 'มูลค่าซาก', key: 'salvage', width: 12 },
    { header: 'อายุการใช้งาน (เดือน)', key: 'life', width: 14 },
    { header: 'ค่าเสื่อมสะสม', key: 'accum', width: 14 },
    { header: 'มูลค่าตามบัญชี', key: 'bookValue', width: 14 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'วันที่จำหน่าย', key: 'disposedAt', width: 12 },
  ];
  for (const a of assets) {
    ws.addRow({
      code: a.code ?? '',
      name: a.name,
      category: a.category,
      acquiredAt: a.acquiredAt.toISOString().slice(0, 10),
      cost: num(a.cost),
      salvage: num(a.salvageValue),
      life: a.usefulLifeMonths,
      accum: num(a.accumulatedDepr),
      bookValue: num(a.bookValue),
      status: a.status,
      disposedAt: a.disposedAt?.toISOString().slice(0, 10) ?? '',
    });
  }
  ['cost', 'salvage', 'accum', 'bookValue'].forEach((k) => {
    ws.getColumn(k).numFmt = '#,##0.00';
  });
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 11 — Project profit (basic: cost from expenses linked to project)
// ---------------------------------------------------------------------------
export async function buildProjectProfit(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  // For now: sum expenses by project for the period. Revenue allocation per
  // project isn't tracked yet (sales docs don't have projectId), so the report
  // shows expense only with a placeholder for revenue.
  const range = rangeForMonth(year, month);
  const projects = await prisma.project.findMany({
    where: { companyId },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  const expensesByProject = await prisma.expenseRecord.groupBy({
    by: ['projectId'],
    where: {
      companyId,
      status: 'RECORDED',
      treatAsIntangible: false,
      expenseDate: { gte: range.start, lt: range.end },
      projectId: { not: null },
    },
    _sum: { grandTotal: true },
  });
  const expenseMap = new Map<string, number>();
  for (const e of expensesByProject) {
    if (e.projectId) expenseMap.set(e.projectId, num(e._sum.grandTotal));
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Project Profit');
  ws.columns = [
    { header: 'รหัสโครงการ', key: 'code', width: 14 },
    { header: 'ชื่อโครงการ', key: 'name', width: 32 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'งบประมาณ', key: 'budget', width: 14 },
    { header: 'ค่าใช้จ่ายในงวด', key: 'expense', width: 16 },
    { header: 'หมายเหตุ', key: 'note', width: 36 },
  ];
  for (const p of projects) {
    ws.addRow({
      code: p.code ?? '',
      name: p.name,
      status: p.status,
      budget: p.budget ? num(p.budget) : '',
      expense: expenseMap.get(p.id) ?? 0,
      note: 'รายได้ต่อโครงการยังไม่ track (sales doc ไม่มี projectId)',
    });
  }
  ['budget', 'expense'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0.00'));
  applyHeader(ws);
  return bufferOf(wb);
}

// ---------------------------------------------------------------------------
// 13 — Attachment index
// ---------------------------------------------------------------------------
export async function buildAttachmentIndex(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Buffer> {
  // List all attachments referenced by any source created during the period.
  const range = rangeForMonth(year, month);
  const attachments = await prisma.attachment.findMany({
    where: { companyId, createdAt: { gte: range.start, lt: range.end } },
    orderBy: { createdAt: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attachment Index');
  ws.columns = [
    { header: 'วันที่อัปโหลด', key: 'createdAt', width: 16 },
    { header: 'ประเภทแหล่ง', key: 'targetType', width: 18 },
    { header: 'รหัสแหล่ง', key: 'targetId', width: 28 },
    { header: 'ชื่อไฟล์', key: 'fileName', width: 38 },
    { header: 'ประเภทไฟล์', key: 'mimeType', width: 18 },
    { header: 'ขนาด (KB)', key: 'sizeKb', width: 10 },
    { header: 'SHA-256', key: 'sha256', width: 36 },
    { header: 'Path', key: 'storedPath', width: 50 },
  ];
  for (const a of attachments) {
    ws.addRow({
      createdAt: a.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      targetType: a.targetType,
      targetId: a.targetId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeKb: Math.round(a.sizeBytes / 1024),
      sha256: a.sha256 ?? '',
      storedPath: a.storedPath,
    });
  }
  applyHeader(ws);
  return bufferOf(wb);
}
