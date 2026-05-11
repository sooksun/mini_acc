import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadExpenseReceiptDto } from './dto/upload-expense-receipt.dto';
import { ListExpenseReceiptsDto } from './dto/list-expense-receipts.dto';
import { LinkExpenseVendorDto } from './dto/link-expense-vendor.dto';
import { ApproveExpenseVendorDto } from './dto/approve-expense-vendor.dto';
import { RejectExpenseReceiptDto } from './dto/reject-expense-receipt.dto';

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
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async upload(companyId: string, userId: string, dto: UploadExpenseReceiptDto, file?: UploadFile) {
    if (!file) throw new BadRequestException('Receipt file is required');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only PDF, JPEG, PNG, or WEBP receipt files are supported');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const vendor = await this.findVendorCandidate(companyId, dto.vendorTaxId, dto.vendorName);
    const storedPath = await this.persistFile(companyId, file);
    const status = vendor
      ? 'READY_TO_ACCOUNT'
      : dto.vendorName || dto.vendorTaxId
        ? 'PENDING_VENDOR_APPROVAL'
        : 'UPLOADED';

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
          documentDate: this.parseDate(dto.documentDate),
          paidAt: this.parseDate(dto.paidAt),
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

    return this.findOne(companyId, receipt.id);
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

  async linkVendor(companyId: string, userId: string, id: string, dto: LinkExpenseVendorDto) {
    await this.findOne(companyId, id);
    const vendor = await this.requireVendor(companyId, dto.vendorId);

    const receipt = await this.prisma.expenseReceipt.update({
      where: { id },
      data: {
        vendorId: vendor.id,
        status: 'READY_TO_ACCOUNT',
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
      include: this.include(),
    });

    return this.toDto(receipt);
  }

  async approveVendor(companyId: string, userId: string, id: string, dto: ApproveExpenseVendorDto) {
    const receipt = await this.prisma.expenseReceipt.findFirst({
      where: { id, companyId },
      include: this.include(),
    });
    if (!receipt) throw new NotFoundException('Expense receipt not found');
    if (receipt.status === 'ACCOUNTED') throw new ConflictException('Receipt is already accounted');

    if (dto.vendorId) {
      return this.linkVendor(companyId, userId, id, { vendorId: dto.vendorId });
    }

    const nameTh = this.blankToNull(dto.nameTh) ?? receipt.proposedVendorName;
    if (!nameTh) throw new BadRequestException('Vendor name is required');

    const vendor = await this.prisma.partner.create({
      data: {
        companyId,
        type: 'VENDOR',
        code: this.blankToNull(dto.code),
        nameTh,
        taxId: this.blankToNull(dto.taxId) ?? receipt.proposedVendorTaxId,
        branch: this.blankToNull(dto.branch) ?? receipt.proposedVendorBranch,
        address: this.blankToNull(dto.address) ?? receipt.proposedVendorAddress,
        note: `สร้างจากใบเสร็จรายจ่าย ${receipt.documentNumber ?? receipt.originalFileName}`,
      },
    });

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

  async account(companyId: string, userId: string, id: string) {
    const receipt = await this.prisma.expenseReceipt.findFirst({
      where: { id, companyId },
      include: this.include(),
    });
    if (!receipt) throw new NotFoundException('Expense receipt not found');
    if (!receipt.vendorId) throw new UnprocessableEntityException('Vendor must be linked before accounting');
    if (receipt.status === 'ACCOUNTED') throw new ConflictException('Receipt is already accounted');
    if (receipt.status === 'REJECTED') throw new ConflictException('Rejected receipt cannot be accounted');

    const expenseDate = receipt.paidAt ?? receipt.documentDate ?? new Date();

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

  async reject(companyId: string, userId: string, id: string, dto: RejectExpenseReceiptDto) {
    await this.findOne(companyId, id);
    const receipt = await this.prisma.expenseReceipt.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: dto.reason,
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
      include: this.include(),
    });
    return this.toDto(receipt);
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
    const root = this.config.get<string>('FILE_STORAGE_ROOT') ?? join(process.cwd(), 'storage');
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

  private parseDate(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid date: ${value}`);
    return date;
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
