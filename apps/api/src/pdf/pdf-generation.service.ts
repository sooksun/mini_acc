import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { DocumentType } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRendererService } from './pdf-renderer.service';
import { PdfTemplateService } from './pdf-template.service';

export const PDF_QUEUE = 'pdf';
export const PDF_GENERATE_JOB = 'generate-sales-pdf';

export interface GeneratePdfJobData {
  type: DocumentType;
  documentId: string;
  companyId: string;
  userId: string;
}

@Injectable()
export class PdfGenerationService {
  constructor(
    private prisma: PrismaService,
    private renderer: PdfRendererService,
    private template: PdfTemplateService,
    @InjectQueue(PDF_QUEUE) private queue: Queue<GeneratePdfJobData>,
  ) {}

  async preview(type: DocumentType, companyId: string, id: string): Promise<Buffer> {
    const { company, doc } = await this.loadDoc(type, companyId, id);
    const html = this.template.buildSalesDocumentHtml({
      company,
      doc,
      watermark: 'DRAFT',
    });
    return this.renderer.render(html);
  }

  async enqueueGenerate(
    type: DocumentType,
    companyId: string,
    id: string,
    userId: string,
  ): Promise<{ jobId: string }> {
    await this.loadDoc(type, companyId, id);
    const job = await this.queue.add(
      PDF_GENERATE_JOB,
      { type, documentId: id, companyId, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400 },
      },
    );
    return { jobId: String(job.id) };
  }

  async getJobStatus(
    jobId: string,
  ): Promise<{ state: string; error?: string; pdfPath?: string | null }> {
    const job = await this.queue.getJob(jobId);
    if (!job) return { state: 'not_found' };
    const state = await job.getState();
    if (state === 'failed') {
      return { state, error: job.failedReason ?? 'unknown error' };
    }
    if (state === 'completed') {
      return { state, pdfPath: (job.returnvalue as any)?.pdfPath ?? null };
    }
    return { state };
  }

  async openStoredPdf(
    type: DocumentType,
    companyId: string,
    id: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = await this.prisma.salesDocument.findFirst({
      where: { id, companyId, type },
      select: { id: true, number: true, pdfPath: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (!doc.pdfPath) {
      throw new NotFoundException('PDF not generated yet');
    }
    const buffer = await fs.readFile(doc.pdfPath);
    const safeNum = doc.number.replace(/[^A-Za-z0-9_\-]/g, '_');
    return { buffer, fileName: `${safeNum}.pdf` };
  }

  async loadDoc(type: DocumentType, companyId: string, id: string) {
    const doc = await this.prisma.salesDocument.findFirst({
      where: { id, companyId, type },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    return { company, doc };
  }
}

export function getStoragePath(): string {
  return path.resolve(process.cwd(), 'var', 'generated_pdfs');
}

export async function ensureStorageDir(): Promise<string> {
  const dir = getStoragePath();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
