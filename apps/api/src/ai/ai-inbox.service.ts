import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { PDFParse } from 'pdf-parse';
import type { AiSuggestionStatus } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { sniffMime } from '../expense-receipts/mime-sniff';
import { ExpenseReceiptsService } from '../expense-receipts/expense-receipts.service';
import { OpenRouterClient, type ExtractedExpense } from './openrouter.client';
import { AcceptSuggestionDto } from './dto/accept-suggestion.dto';
import { ListSuggestionsDto } from './dto/list-suggestions.dto';
import { RejectSuggestionDto } from './dto/reject-suggestion.dto';

type UploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface AiSuggestionPayload extends ExtractedExpense {
  attachmentId?: string;
  storedPath?: string;
  originalFileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
}

@Injectable()
export class AiInboxService {
  private readonly logger = new Logger(AiInboxService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private openrouter: OpenRouterClient,
    private expenseReceipts: ExpenseReceiptsService,
  ) {}

  /**
   * Upload a document into the AI Inbox. The file lands in the same storage
   * root as expense-receipts but in an `ai-inbox/` subfolder — when the
   * operator accepts the suggestion, we delete the staging copy and the
   * expense-receipts service writes its own copy at the canonical path.
   *
   * The extraction runs synchronously for now (mock or single OpenRouter
   * call). For larger documents this should move to a BullMQ job, but the
   * single sync call keeps the demo flow simple.
   */
  async upload(companyId: string, userId: string, file?: UploadFile) {
    if (!file) throw new BadRequestException('File required');
    const detected = sniffMime(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
      throw new BadRequestException('รองรับเฉพาะ PDF/JPEG/PNG/WEBP');
    }
    if (file.mimetype !== detected) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'MIME_MISMATCH',
        message: `Content-Type (${file.mimetype}) ไม่ตรงกับเนื้อหาไฟล์จริง (${detected})`,
      });
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const { relativePath, absolutePath } = await this.persistFile(companyId, file);
    let committed = false;
    try {
      const text = await this.extractText(file.buffer, detected);
      const result = await this.openrouter.extractExpense({
        fileName: file.originalname,
        text,
      });

      const payload: AiSuggestionPayload = {
        ...result.payload,
        storedPath: relativePath,
        originalFileName: file.originalname,
        mimeType: detected,
        sizeBytes: file.size,
        sha256,
      };

      const suggestion = await this.prisma.aiSuggestion.create({
        data: {
          companyId,
          type: 'DOCUMENT_EXTRACT',
          status: 'PENDING',
          sourceType: 'EXPENSE_RECEIPT_DRAFT',
          confidence: new Prisma.Decimal(result.confidence.toFixed(4)),
          payload: payload as unknown as Prisma.InputJsonValue,
          model: result.model,
        },
      });
      committed = true;
      return this.toDto(suggestion);
    } finally {
      if (!committed) {
        await unlink(absolutePath).catch((err) =>
          this.logger.error(`Failed to unlink ai-inbox orphan: ${err.message}`),
        );
      }
    }
  }

  async list(companyId: string, dto: ListSuggestionsDto) {
    const where: Prisma.AiSuggestionWhereInput = {
      companyId,
      ...(dto.status ? { status: dto.status } : { status: 'PENDING' }),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.sourceType ? { sourceType: dto.sourceType } : {}),
      ...(dto.sourceId ? { sourceId: dto.sourceId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.aiSuggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.aiSuggestion.count({ where }),
    ]);
    return { items: items.map((s) => this.toDto(s)), total };
  }

  async findOne(companyId: string, id: string) {
    const s = await this.prisma.aiSuggestion.findFirst({ where: { id, companyId } });
    if (!s) throw new NotFoundException('Suggestion not found');
    return this.toDto(s);
  }

  /**
   * Materialize a DOCUMENT_EXTRACT suggestion into an ExpenseReceipt. We move
   * the staged file from the AI inbox folder to the canonical expense-receipt
   * storage by reading it back into a buffer and re-invoking the upload service
   * — that gives us identical hashing/dedup/journal posting semantics for free.
   */
  async accept(
    companyId: string,
    userId: string,
    id: string,
    dto: AcceptSuggestionDto,
  ) {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id, companyId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== 'PENDING') {
      throw new ConflictException({
        statusCode: 409,
        code: 'SUGGESTION_NOT_PENDING',
        message: `Suggestion already ${suggestion.status}`,
      });
    }
    if (suggestion.type !== 'DOCUMENT_EXTRACT') {
      throw new BadRequestException(
        `Accept flow currently only supports DOCUMENT_EXTRACT, got ${suggestion.type}`,
      );
    }

    const payload = suggestion.payload as unknown as AiSuggestionPayload;
    if (!payload?.storedPath) {
      throw new BadRequestException('Suggestion has no staged file path');
    }
    const absolutePath = this.resolveStoredPath(payload.storedPath);
    let buffer: Buffer;
    try {
      buffer = await readFile(absolutePath);
    } catch {
      throw new NotFoundException('ไฟล์ที่ AI วางไว้หายจากเครื่องเก็บข้อมูล');
    }

    // Merge operator overrides on top of AI payload; operator wins.
    const merged: ExtractedExpense = {
      vendorName: dto.vendorName ?? payload.vendorName,
      vendorTaxId: dto.vendorTaxId ?? payload.vendorTaxId,
      documentNumber: dto.documentNumber ?? payload.documentNumber,
      documentDate: dto.documentDate ?? payload.documentDate,
      paidAt: dto.paidAt ?? payload.paidAt,
      category: dto.category ?? payload.category,
      subtotal: dto.subtotal ?? payload.subtotal,
      vatAmount: dto.vatAmount ?? payload.vatAmount,
      withholdingTaxAmount: dto.withholdingTaxAmount ?? payload.withholdingTaxAmount,
      grandTotal: dto.grandTotal ?? payload.grandTotal,
    };

    // Hand off to ExpenseReceiptsService — this triggers all the H3/H4/H5/H6
    // guards + journal posting + VAT record creation.
    const receipt = await this.expenseReceipts.upload(
      companyId,
      userId,
      {
        ...merged,
        note: dto.note,
      },
      {
        originalname: payload.originalFileName ?? 'ai-inbox.pdf',
        mimetype: payload.mimeType ?? 'application/pdf',
        size: payload.sizeBytes ?? buffer.length,
        buffer,
      },
    );

    // Update suggestion → ACCEPTED with cross-link to the receipt
    const updated = await this.prisma.aiSuggestion.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedBy: userId,
        acceptedAt: new Date(),
        sourceType: 'EXPENSE_RECEIPT',
        sourceId: receipt.id,
      },
    });

    // Best-effort cleanup of the staging file. If unlink fails we just log —
    // the expense-receipts service has its own copy, so the staging file is
    // safely orphaned.
    await unlink(absolutePath).catch((err) =>
      this.logger.warn(`Failed to delete staged file ${absolutePath}: ${err.message}`),
    );

    return { suggestion: this.toDto(updated), receipt };
  }

  async reject(
    companyId: string,
    userId: string,
    id: string,
    dto: RejectSuggestionDto,
  ) {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id, companyId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== 'PENDING') {
      throw new ConflictException('Suggestion already handled');
    }

    // Clean up the staged file — operator said "this isn't real", so don't
    // keep the bytes around. The audit log still records the rejection action.
    const payload = suggestion.payload as unknown as AiSuggestionPayload;
    if (payload?.storedPath) {
      const absolutePath = this.resolveStoredPath(payload.storedPath);
      await unlink(absolutePath).catch((err) =>
        this.logger.warn(`Failed to delete rejected file ${absolutePath}: ${err.message}`),
      );
    }

    const updated = await this.prisma.aiSuggestion.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: dto.reason?.trim() || null,
      },
    });
    return this.toDto(updated);
  }

  async readStagedFile(companyId: string, id: string) {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id, companyId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    const payload = suggestion.payload as unknown as AiSuggestionPayload;
    if (!payload?.storedPath || !payload.mimeType || !payload.originalFileName) {
      throw new NotFoundException('Suggestion has no staged file');
    }
    const absolutePath = this.resolveStoredPath(payload.storedPath);
    try {
      const buffer = await readFile(absolutePath);
      return {
        buffer,
        mimeType: payload.mimeType,
        originalFileName: payload.originalFileName,
      };
    } catch {
      throw new NotFoundException('Staged file not found on disk');
    }
  }

  /**
   * Extract text content so the LLM has something to read. รองรับเฉพาะ PDF;
   * image (jpeg/png/webp) คืน undefined — รอ vision phase หรือ OCR.
   * ไม่ throw ถ้า extract ไม่ได้ — กลับ undefined แล้วให้ LLM ใช้ mock/filename
   * ตามเดิม.
   */
  private async extractText(buffer: Buffer, mime: string): Promise<string | undefined> {
    if (mime !== 'application/pdf') return undefined;
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      const text = result.text?.trim();
      return text && text.length > 0 ? text : undefined;
    } catch (err) {
      this.logger.warn(
        `pdf-parse failed (${err instanceof Error ? err.message : String(err)}) — proceeding without text`,
      );
      return undefined;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private async persistFile(companyId: string, file: UploadFile) {
    const root = this.getStorageRoot();
    const dirRelative = join('ai-inbox', companyId);
    const dirAbsolute = join(root, dirRelative);
    await mkdir(dirAbsolute, { recursive: true });
    const ext = this.extensionFor(file.mimetype);
    const filename = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}${ext}`;
    const relativePath = join(dirRelative, filename);
    const absolutePath = join(dirAbsolute, filename);
    await writeFile(absolutePath, file.buffer);
    return { relativePath, absolutePath };
  }

  private getStorageRoot(): string {
    return this.config.get<string>('ATTACHMENT_DIR') ?? join(process.cwd(), 'var', 'attachments');
  }

  private resolveStoredPath(stored: string): string {
    if (isAbsolute(stored)) return stored;
    return join(this.getStorageRoot(), stored);
  }

  private extensionFor(mimeType: string) {
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '';
  }

  private toDto(s: {
    id: string;
    type: string;
    status: AiSuggestionStatus;
    sourceType: string | null;
    sourceId: string | null;
    attachmentId: string | null;
    confidence: Prisma.Decimal | null;
    payload: Prisma.JsonValue;
    model: string | null;
    acceptedBy: string | null;
    acceptedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...s,
      confidence: s.confidence ? Number(s.confidence.toString()) : null,
      acceptedAt: s.acceptedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
