import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRendererService } from '../pdf/pdf-renderer.service';
import {
  buildAttachmentIndex,
  buildBankReconciliation,
  buildDeliveryRegister,
  buildFixedAssetRegister,
  buildInventoryReport,
  buildJournalReport,
  buildPaymentRegister,
  buildProjectProfit,
  buildPurchaseRegister,
  buildSalesRegister,
  buildVatReport,
  buildWhtReport,
} from './report-builders';
import { buildRiskSummaryPdf } from './risk-summary-pdf';

/** Numbered report files in the pack (01..13) — recorded on the ExportBatch. */
const PACK_REPORT_FILE_COUNT = 13;

@Injectable()
export class AccountantPackService {
  private readonly logger = new Logger(AccountantPackService.name);

  constructor(
    private prisma: PrismaService,
    private renderer: PdfRendererService,
  ) {}

  /**
   * Build the ZIP for an accountant pack and return a readable stream + the
   * file name. The pack must come from a LOCKED period (PRD §22.3 #10) — if
   * the period is still open, refuse so the accountant doesn't receive numbers
   * that can still change.
   *
   * The ZIP contents follow PRD §18 — 12 xlsx + 1 pdf + attachments/ +
   * generated_pdfs/ folders. Missing modules (currently Bank) ship as an empty
   * sheet noting the data isn't available yet, not as an omitted file, so the
   * accountant can rely on a stable filename schema across periods.
   */
  async exportPack(
    companyId: string,
    year: number,
    month: number,
    userId?: string,
  ): Promise<{ filename: string; buffer: Buffer; batchId: string }> {
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { companyId_year_month: { companyId, year, month } },
    });
    if (!period) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PERIOD_NOT_FOUND',
        message: `งวด ${year}/${month} ยังไม่ถูกตั้งค่า — ปิดงวดก่อน export`,
      });
    }
    if (period.status !== 'LOCKED') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'PERIOD_NOT_LOCKED',
        message: 'ต้องปิดงวดก่อนจึง export Accountant Pack ได้',
        currentStatus: period.status,
      });
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { nameTh: true, brandShort: true },
    });

    const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
    const brand = company.brandShort || 'pack';
    const filename = `accountant-pack-${brand}-${periodLabel}.zip`;

    this.logger.log(
      `Building accountant pack: company=${companyId} period=${periodLabel}`,
    );

    // Build every report in parallel — they share read-only Prisma queries
    // and don't write anything, so they're safe to run concurrently.
    const [
      sales,
      delivery,
      purchase,
      payment,
      bank,
      vat,
      wht,
      journal,
      inventory,
      assets,
      projects,
      attachments,
      riskPdf,
    ] = await Promise.all([
      buildSalesRegister(this.prisma, companyId, year, month),
      buildDeliveryRegister(this.prisma, companyId, year, month),
      buildPurchaseRegister(this.prisma, companyId, year, month),
      buildPaymentRegister(this.prisma, companyId, year, month),
      buildBankReconciliation(this.prisma, companyId, year, month),
      buildVatReport(this.prisma, companyId, year, month),
      buildWhtReport(this.prisma, companyId, year, month),
      buildJournalReport(this.prisma, companyId, year, month),
      buildInventoryReport(this.prisma, companyId, year, month),
      buildFixedAssetRegister(this.prisma, companyId, year, month),
      buildProjectProfit(this.prisma, companyId, year, month),
      buildAttachmentIndex(this.prisma, companyId, year, month),
      buildRiskSummaryPdf(this.prisma, this.renderer, companyId, year, month),
    ]);

    const out = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => {
      this.logger.warn(`accountant-pack archive warning: ${err.message}`);
    });
    archive.on('error', (err) => {
      this.logger.error(`accountant-pack archive error: ${err.message}`);
      out.destroy(err);
    });
    archive.pipe(out);

    // 12 xlsx + 1 pdf — fixed filenames so the accountant always sees the
    // same schema regardless of which month they open.
    archive.append(sales, { name: '01_sales_register.xlsx' });
    archive.append(delivery, { name: '02_delivery_register.xlsx' });
    archive.append(purchase, { name: '03_purchase_register.xlsx' });
    archive.append(payment, { name: '04_payment_register.xlsx' });
    archive.append(bank, { name: '05_bank_reconciliation.xlsx' });
    archive.append(vat, { name: '06_vat_report.xlsx' });
    archive.append(wht, { name: '07_wht_report.xlsx' });
    archive.append(journal, { name: '08_journal_entries.xlsx' });
    archive.append(inventory, { name: '09_inventory_report.xlsx' });
    archive.append(assets, { name: '10_fixed_asset_register.xlsx' });
    archive.append(projects, { name: '11_project_profit_report.xlsx' });
    archive.append(riskPdf, { name: '12_risk_summary.pdf' });
    archive.append(attachments, { name: '13_attachment_index.xlsx' });

    // README so the accountant knows what's in the pack
    archive.append(
      this.buildReadme(company.nameTh, year, month, period.closedAt),
      { name: 'README.txt' },
    );

    // Collect the whole archive into a Buffer so we can both persist it as
    // evidence (ExportBatch) and stream it back. The pack comes from a LOCKED
    // period so it's a stable snapshot — worth keeping for re-download.
    const bufferPromise = collectStream(out);
    await archive.finalize();
    const buffer = await bufferPromise;

    const relDir = join('accountant-packs', companyId);
    await mkdir(join(this.getStorageRoot(), relDir), { recursive: true });
    const relPath = join(relDir, `${periodLabel}-${randomUUID()}.zip`);
    await writeFile(join(this.getStorageRoot(), relPath), buffer);

    const batch = await this.prisma.exportBatch.create({
      data: {
        companyId,
        year,
        month,
        fileName: filename,
        storedPath: relPath,
        sizeBytes: buffer.length,
        fileCount: PACK_REPORT_FILE_COUNT,
        generatedBy: userId ?? null,
      },
    });

    this.logger.log(
      `Accountant pack persisted: batch=${batch.id} bytes=${buffer.length} period=${periodLabel}`,
    );

    return { filename, buffer, batchId: batch.id };
  }

  /** List previously exported packs (most recent first). */
  async listBatches(companyId: string) {
    const items = await this.prisma.exportBatch.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return items.map((b) => ({
      id: b.id,
      year: b.year,
      month: b.month,
      fileName: b.fileName,
      sizeBytes: b.sizeBytes,
      fileCount: b.fileCount,
      generatedBy: b.generatedBy,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  /** Read a persisted pack back from disk for re-download. */
  async downloadBatch(companyId: string, id: string): Promise<{ filename: string; buffer: Buffer }> {
    const batch = await this.prisma.exportBatch.findFirst({ where: { id, companyId } });
    if (!batch) {
      throw new NotFoundException({ statusCode: 404, code: 'EXPORT_NOT_FOUND', message: 'ไม่พบไฟล์ export นี้' });
    }
    const abs = isAbsolute(batch.storedPath)
      ? batch.storedPath
      : join(this.getStorageRoot(), batch.storedPath);
    try {
      const buffer = await readFile(abs);
      return { filename: batch.fileName, buffer };
    } catch {
      throw new NotFoundException({
        statusCode: 404,
        code: 'EXPORT_FILE_MISSING',
        message: 'ไฟล์ export ถูกลบหรือย้ายไปแล้ว — กรุณา export ใหม่',
      });
    }
  }

  private getStorageRoot(): string {
    return process.env.ATTACHMENT_DIR ?? join(process.cwd(), 'var', 'attachments');
  }

  private buildReadme(companyName: string, year: number, month: number, closedAt: Date | null) {
    const periodLabel = `${year}/${String(month).padStart(2, '0')} (พ.ศ. ${year + 543})`;
    const generated = new Date().toISOString();
    return Buffer.from(
      `Accountant Pack
=================

บริษัท: ${companyName}
รอบ: ${periodLabel}
ปิดงวดเมื่อ: ${closedAt ? closedAt.toISOString() : '(unknown)'}
สร้าง pack เมื่อ: ${generated}

เนื้อหา:
  01_sales_register.xlsx         — สมุดรายวันขาย
  02_delivery_register.xlsx      — ทะเบียนใบส่งของ
  03_purchase_register.xlsx      — สมุดรายจ่าย
  04_payment_register.xlsx       — สมุดรับ-จ่ายเงิน
  05_bank_reconciliation.xlsx    — Bank reconciliation
  06_vat_report.xlsx             — รายงาน VAT
  07_wht_report.xlsx             — รายงาน WHT (ภงด.3/53)
  08_journal_entries.xlsx        — Journal entries (Dr=Cr enforced)
  09_inventory_report.xlsx       — รายงานสต็อก
  10_fixed_asset_register.xlsx   — ทะเบียนทรัพย์สินถาวร
  11_project_profit_report.xlsx  — กำไรต่อโครงการ
  12_risk_summary.pdf            — สรุปความเสี่ยง
  13_attachment_index.xlsx       — ดัชนีไฟล์แนบ

หมายเหตุ: ตัวเลขทุกบรรทัดย้อนกลับไปหา journal entry + เอกสารต้นทางได้
ผ่านฟิลด์ sourceType/sourceId — ดู audit log สำหรับประวัติการแก้ไข
`,
      'utf-8',
    );
  }
}

/** Drain a readable stream fully into a single Buffer. */
function collectStream(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
