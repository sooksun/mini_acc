import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRendererService } from './pdf-renderer.service';
import { PdfTemplateService } from './pdf-template.service';
import {
  GeneratePdfJobData,
  PDF_GENERATE_JOB,
  PDF_QUEUE,
  ensureStorageDir,
} from './pdf-generation.service';

@Processor(PDF_QUEUE)
export class PdfJobProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfJobProcessor.name);

  constructor(
    private prisma: PrismaService,
    private renderer: PdfRendererService,
    private template: PdfTemplateService,
    private audit: AuditLogService,
  ) {
    super();
  }

  async process(job: Job<GeneratePdfJobData>) {
    if (job.name !== PDF_GENERATE_JOB) {
      throw new Error(`Unknown job name: ${job.name}`);
    }
    const { type, documentId, companyId, userId } = job.data;

    const doc = await this.prisma.salesDocument.findFirst({
      where: { id: documentId, companyId, type },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!doc) throw new Error('Document not found');

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });

    const html = this.template.buildSalesDocumentHtml({ company, doc });
    const buffer = await this.renderer.render(html);

    const dir = await ensureStorageDir();
    const version = await this.nextVersion(companyId, type, documentId);
    const fileName = `${type}-${documentId}-v${version}.pdf`;
    const fullPath = path.join(dir, fileName);
    await fs.writeFile(fullPath, buffer);

    await this.prisma.$transaction([
      this.prisma.generatedPdf.create({
        data: {
          companyId,
          documentType: type,
          documentId,
          storedPath: fullPath,
          sizeBytes: buffer.byteLength,
          isPreview: false,
          dataVersion: version,
          generatedBy: userId,
        },
      }),
      this.prisma.salesDocument.update({
        where: { id: documentId },
        data: {
          pdfPath: fullPath,
          pdfGeneratedAt: new Date(),
          pdfGeneratedBy: userId,
        },
      }),
    ]);

    await this.audit.record({
      companyId,
      userId,
      action: 'GENERATE_PDF',
      entityType: `SalesDocument:${type}`,
      entityId: documentId,
      metadata: { number: doc.number, version, sizeBytes: buffer.byteLength },
    });

    return { pdfPath: fullPath, version };
  }

  private async nextVersion(
    companyId: string,
    type: string,
    documentId: string,
  ): Promise<number> {
    const last = await this.prisma.generatedPdf.findFirst({
      where: { companyId, documentType: type as any, documentId, isPreview: false },
      orderBy: { dataVersion: 'desc' },
      select: { dataVersion: true },
    });
    return (last?.dataVersion ?? 0) + 1;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<GeneratePdfJobData>, err: Error) {
    this.logger.error(
      `PDF job ${job.id} failed for ${job.data.type}/${job.data.documentId}: ${err.message}`,
      err.stack,
    );
  }
}
