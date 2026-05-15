import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Role } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadExpenseReceiptDto } from './dto/upload-expense-receipt.dto';
import { ListExpenseReceiptsDto } from './dto/list-expense-receipts.dto';
import { LinkExpenseVendorDto } from './dto/link-expense-vendor.dto';
import { ApproveExpenseVendorDto } from './dto/approve-expense-vendor.dto';
import { RejectExpenseReceiptDto } from './dto/reject-expense-receipt.dto';
import { sniffMime } from './mime-sniff';
import { validateExpenseTransition } from './transitions';

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

@Injectable()
export class ExpenseReceiptsService {
  private readonly logger = new Logger(ExpenseReceiptsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async upload(companyId: string, userId: string, dto: UploadExpenseReceiptDto, file?: UploadFile) {
    if (!file) throw new BadRequestException('Receipt file is required');

    // H1: validate by file content, not by client-supplied Content-Type.
    // The sniffer only recognizes the 4 formats we accept; anything else is rejected here.
    const detectedMime = sniffMime(file.buffer);
    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      throw new BadRequestException(
        'รองรับเฉพาะไฟล์ PDF, JPEG, PNG, WEBP — ไฟล์ที่อัปโหลดไม่ตรงประเภทใด ๆ',
      );
    }
    if (file.mimetype !== detectedMime) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'MIME_MISMATCH',
        message: `Content-Type ที่ส่งมา (${file.mimetype}) ไม่ตรงกับเนื้อหาไฟล์จริง (${detectedMime})`,
      });
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // H6: dedup. Same file uploaded twice for the same company should not create
    // a second receipt + second file on disk.
    const existing = await this.prisma.expenseReceipt.findFirst({
      where: { companyId, sha256 },
      select: { id: true, status: true, originalFileName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EXPENSE_RECEIPT_DUPLICATE',
        message: `พบใบเสร็จเดิมในระบบแล้ว (${existing.originalFileName}) สถานะ ${existing.status}`,
        duplicateOf: existing.id,
        duplicateStatus: existing.status,
      });
    }

    const vendor = await this.findVendorCandidate(companyId, dto.vendorTaxId, dto.vendorName);
    const status = vendor
      ? 'READY_TO_ACCOUNT'
      : dto.vendorName || dto.vendorTaxId
        ? 'PENDING_VENDOR_APPROVAL'
        : 'UPLOADED';

    // C4: write file to disk only if we commit the receipt; clean up otherwise.
    // We persist the file *before* the tx so the row can reference its path, but
    // if the tx throws we unlink the orphan in finally.
    const storedPath = await this.persistFile(companyId, file);
    let committed = false;
    try {
      const receipt = await this.prisma.$transaction(async (tx) => {
        const created = await tx.expenseReceipt.create({
          data: {
            companyId,
            status,
            vendorId: vendor?.id,
            proposedVendorName: this.blankToNull(dto.vendorName),
            proposedVendorTaxId: this.blankToNull(dto.vendorTaxId),
            proposedVendorBranch: this.blankToNull(dto.vendorBranch),
            proposedVendorAddress: this.blankToNull(dto.vendorAddress),
            documentNumber: this.blankToNull(dto.documentNumber),
            // DTO already validates with @IsDateString (strict ISO 8601), so direct
            // construction is safe. Keep the null path for the optional case.
            documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
            paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
            category: this.blankToNull(dto.category),
            note: this.blankToNull(dto.note),
            subtotal: this.money(dto.subtotal),
            vatAmount: this.money(dto.vatAmount),
            withholdingTaxAmount: this.money(dto.withholdingTaxAmount),
            grandTotal: this.money(dto.grandTotal),
            originalFileName: file.originalname,
            storedPath,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sha256,
            uploadedBy: userId,
          },
        });

        await tx.attachment.create({
          data: {
            companyId,
            targetType: 'EXPENSE',
            targetId: created.id,
            fileName: file.originalname,
            storedPath,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sha256,
            uploadedBy: userId,
          },
        });

        return created;
      });

      committed = true;
      return this.findOne(companyId, receipt.id);
    } finally {
      if (!committed) {
        await unlink(storedPath).catch((err) => {
          this.logger.error(
            `Failed to unlink orphan upload after tx rollback: path=${storedPath} err=${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    }
  }

  async list(companyId: string, dto: ListExpenseReceiptsDto) {
    const where: Prisma.ExpenseReceiptWhereInput = {
      companyId,
      ...(dto.status
        ? { status: dto.status }
        : dto.includeAccounted
          ? {}
          : { status: { not: 'ACCOUNTED' } }),
      ...(dto.search
        ? {
            OR: [
              { proposedVendorName: { contains: dto.search } },
              { proposedVendorTaxId: { contains: dto.search } },
              { documentNumber: { contains: dto.search } },
              { vendor: { nameTh: { contains: dto.search } } },
              { vendor: { taxId: { contains: dto.search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.expenseReceipt.findMany({
        where,
        include: this.include(),
        orderBy: { createdAt: 'desc' },
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.expenseReceipt.count({ where }),
    ]);

    return { items: items.map((item) => this.toDto(item)), total };
  }

  async findOne(companyId: string, id: string) {
    const receipt = await this.prisma.expenseReceipt.findFirst({
      where: { id, companyId },
      include: this.include(),
    });
    if (!receipt) throw new NotFoundException('Expense receipt not found');
    return this.toDto(receipt);
  }

  /** Read entity (not DTO) — used internally where Decimal columns and FK fields are needed. */
  private async loadEntity(companyId: string, id: string) {
    const receipt = await this.prisma.expenseReceipt.findFirst({
      where: { id, companyId },
    });
    if (!receipt) throw new NotFoundException('Expense receipt not found');
    return receipt;
  }

  async linkVendor(companyId: string, userId: string, role: Role, id: string, dto: LinkExpenseVendorDto) {
    const receipt = await this.loadEntity(companyId, id);
    validateExpenseTransition({ from: receipt.status, to: 'READY_TO_ACCOUNT', role });
    const vendor = await this.requireVendor(companyId, dto.vendorId);

    const updated = await this.prisma.expenseReceipt.update({
      where: { id },
      data: {
        vendorId: vendor.id,
        status: 'READY_TO_ACCOUNT',
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
      include: this.include(),
    });

    return this.toDto(updated);
  }

  async approveVendor(companyId: string, userId: string, role: Role, id: string, dto: ApproveExpenseVendorDto) {
    const receipt = await this.loadEntity(companyId, id);
    validateExpenseTransition({ from: receipt.status, to: 'READY_TO_ACCOUNT', role });

    if (dto.vendorId) {
      return this.linkVendor(companyId, userId, role, id, { vendorId: dto.vendorId });
    }

    const nameTh = this.blankToNull(dto.nameTh) ?? receipt.proposedVendorName;
    if (!nameTh) throw new BadRequestException('Vendor name is required');

    const taxId = this.blankToNull(dto.taxId) ?? receipt.proposedVendorTaxId;
    const branch = this.blankToNull(dto.branch) ?? receipt.proposedVendorBranch;
    const address = this.blankToNull(dto.address) ?? receipt.proposedVendorAddress;
    const code = this.blankToNull(dto.code);

    // H5: don't silently create a duplicate vendor.
    // Match by taxId first (strongest identity), then by exact nameTh.
    const collision = await this.findVendorCandidate(companyId, taxId ?? undefined, nameTh);
    if (collision) {
      throw new ConflictException({
        statusCode: 409,
        code: 'VENDOR_ALREADY_EXISTS',
        message: `พบผู้ขายเดิมในระบบ (${collision.nameTh}) — กรุณาผูกใบเสร็จกับผู้ขายเดิม`,
        existingVendorId: collision.id,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const vendor = await tx.partner.create({
        data: {
          companyId,
          type: 'VENDOR',
          code,
          nameTh,
          taxId,
          branch,
          address,
          note: `สร้างจากใบเสร็จรายจ่าย ${receipt.documentNumber ?? receipt.originalFileName}`,
        },
      });

      return tx.expenseReceipt.update({
        where: { id },
        data: {
          vendorId: vendor.id,
          status: 'READY_TO_ACCOUNT',
          reviewedBy: userId,
          reviewedAt: new Date(),
        },
        include: this.include(),
      });
    });

    return this.toDto(updated);
  }

  async account(companyId: string, userId: string, role: Role, id: string) {
    const receipt = await this.loadEntity(companyId, id);
    validateExpenseTransition({ from: receipt.status, to: 'ACCOUNTED', role });

    if (!receipt.vendorId) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'VENDOR_REQUIRED',
        message: 'ต้องผูกผู้ขายก่อนจึงจะลงรายจ่ายได้',
      });
    }

    // H4: refuse to book a zero-baht expense, and refuse to default the expense date to "today".
    // An expense without a real date silently drifts into the wrong accounting period.
    if (receipt.grandTotal.lte(0)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'EXPENSE_AMOUNT_REQUIRED',
        message: 'ยอดรวมต้องมากกว่า 0 จึงจะลงรายจ่ายได้',
      });
    }
    const expenseDate = receipt.paidAt ?? receipt.documentDate;
    if (!expenseDate) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'EXPENSE_DATE_REQUIRED',
        message: 'ต้องระบุวันที่จ่ายหรือวันที่เอกสารก่อนลงรายจ่าย',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.expenseRecord.create({
        data: {
          companyId,
          receiptId: receipt.id,
          vendorId: receipt.vendorId!,
          expenseDate,
          documentNumber: receipt.documentNumber,
          category: receipt.category,
          note: receipt.note,
          subtotal: receipt.subtotal,
          vatAmount: receipt.vatAmount,
          withholdingTaxAmount: receipt.withholdingTaxAmount,
          grandTotal: receipt.grandTotal,
          recordedBy: userId,
        },
      });

      return tx.expenseReceipt.update({
        where: { id },
        data: {
          status: 'ACCOUNTED',
          accountedBy: userId,
          accountedAt: new Date(),
        },
        include: this.include(),
      });
    });

    return this.toDto(updated);
  }

  async reject(companyId: string, userId: string, role: Role, id: string, dto: RejectExpenseReceiptDto) {
    const receipt = await this.loadEntity(companyId, id);
    validateExpenseTransition({ from: receipt.status, to: 'REJECTED', role, reason: dto.reason });

    const updated = await this.prisma.expenseReceipt.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: dto.reason,
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
      include: this.include(),
    });
    return this.toDto(updated);
  }

  async openStoredFile(companyId: string, id: string) {
    const receipt = await this.prisma.expenseReceipt.findFirst({
      where: { id, companyId },
      select: { storedPath: true, originalFileName: true, mimeType: true },
    });
    if (!receipt) throw new NotFoundException('Expense receipt not found');
    return receipt;
  }

  private async findVendorCandidate(companyId: string, taxId?: string, name?: string) {
    const cleanTaxId = this.blankToNull(taxId);
    if (cleanTaxId) {
      const byTaxId = await this.prisma.partner.findFirst({
        where: {
          companyId,
          taxId: cleanTaxId,
          isActive: true,
          OR: [{ type: 'VENDOR' }, { type: 'BOTH' }],
        },
      });
      if (byTaxId) return byTaxId;
    }

    const cleanName = this.blankToNull(name);
    if (!cleanName) return null;

    return this.prisma.partner.findFirst({
      where: {
        companyId,
        nameTh: cleanName,
        isActive: true,
        OR: [{ type: 'VENDOR' }, { type: 'BOTH' }],
      },
    });
  }

  private async requireVendor(companyId: string, vendorId: string) {
    const vendor = await this.prisma.partner.findFirst({
      where: {
        id: vendorId,
        companyId,
        isActive: true,
        OR: [{ type: 'VENDOR' }, { type: 'BOTH' }],
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async persistFile(companyId: string, file: UploadFile) {
    // H8: read ATTACHMENT_DIR (the env var actually declared in .env.example), not the
    // ad-hoc FILE_STORAGE_ROOT the old code expected.
    const root = this.config.get<string>('ATTACHMENT_DIR') ?? join(process.cwd(), 'var', 'attachments');
    const dir = join(root, 'expense-receipts', companyId);
    await mkdir(dir, { recursive: true });
    const ext = this.extensionFor(file.mimetype);
    const filename = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}${ext}`;
    const storedPath = join(dir, filename);
    await writeFile(storedPath, file.buffer);
    return storedPath;
  }

  private extensionFor(mimeType: string) {
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '';
  }

  private money(value?: string) {
    if (!value?.trim()) return new Prisma.Decimal(0);
    const normalized = value.replace(/,/g, '');
    if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new BadRequestException(`Invalid money value: ${value}`);
    }
    return new Prisma.Decimal(normalized);
  }

  private blankToNull(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private include() {
    return {
      vendor: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          taxId: true,
          branch: true,
          address: true,
          type: true,
        },
      },
      expenseRecord: true,
    } satisfies Prisma.ExpenseReceiptInclude;
  }

  private toDto(receipt: Prisma.ExpenseReceiptGetPayload<{ include: ReturnType<ExpenseReceiptsService['include']> }>) {
    return {
      ...receipt,
      subtotal: receipt.subtotal.toString(),
      vatAmount: receipt.vatAmount.toString(),
      withholdingTaxAmount: receipt.withholdingTaxAmount.toString(),
      grandTotal: receipt.grandTotal.toString(),
      expenseRecord: receipt.expenseRecord
        ? {
            ...receipt.expenseRecord,
            subtotal: receipt.expenseRecord.subtotal.toString(),
            vatAmount: receipt.expenseRecord.vatAmount.toString(),
            withholdingTaxAmount: receipt.expenseRecord.withholdingTaxAmount.toString(),
            grandTotal: receipt.expenseRecord.grandTotal.toString(),
          }
        : null,
    };
  }
}
