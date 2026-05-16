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
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join } from 'path';
import type { Role } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadExpenseReceiptDto } from './dto/upload-expense-receipt.dto';
import { ListExpenseReceiptsDto } from './dto/list-expense-receipts.dto';
import { LinkExpenseVendorDto } from './dto/link-expense-vendor.dto';
import { ApproveExpenseVendorDto } from './dto/approve-expense-vendor.dto';
import { RejectExpenseReceiptDto } from './dto/reject-expense-receipt.dto';
import { sniffMime } from './mime-sniff';
import { validateExpenseTransition } from './transitions';
import { JournalService } from '../journal/journal.service';
import { ACCOUNTS, expenseAccountForCategory } from '../journal/accounts';
import { VatService } from '../tax/vat.service';

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
    private journal: JournalService,
    private vat: VatService,
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
    const { relativePath, absolutePath } = await this.persistFile(companyId, file);
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
            storedPath: relativePath,
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
            storedPath: relativePath,
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
        await unlink(absolutePath).catch((err) => {
          this.logger.error(
            `Failed to unlink orphan upload after tx rollback: path=${absolutePath} err=${err instanceof Error ? err.message : String(err)}`,
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
      let vendor;
      try {
        vendor = await tx.partner.create({
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
      } catch (err) {
        // M8: a P2002 here means another concurrent flow created a partner
        // with the same (companyId, code) while we were past our collision
        // pre-check. Translate to a 409 the frontend can surface instead of
        // a 500.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // On MySQL Prisma surfaces `meta.target` as a string ("PRIMARY", "Partner_companyId_code_key");
          // on PostgreSQL it's a string[]. Normalize either shape for the error payload.
          const target = err.meta?.target;
          const targetLabel = Array.isArray(target)
            ? target.join(', ')
            : typeof target === 'string'
              ? target
              : 'unique constraint';
          throw new ConflictException({
            statusCode: 409,
            code: 'VENDOR_CONSTRAINT_CONFLICT',
            message: `สร้างผู้ขายไม่สำเร็จ — มีผู้ขายที่ใช้ค่านี้แล้ว (${targetLabel})`,
            target: target ?? null,
          });
        }
        throw err;
      }

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

    // H3 + P3: subtotal + VAT − WHT must reconcile with grandTotal exactly.
    // We tighten to zero tolerance because the journal posting below requires
    // exact Dr = Cr — any rounding noise would prevent a valid journal entry.
    // Users with off-by-one-baht receipts should reconcile in the source data
    // (or capture the rounding diff in a separate line) before accounting.
    const expectedGrand = receipt.subtotal
      .plus(receipt.vatAmount)
      .minus(receipt.withholdingTaxAmount);
    if (!receipt.grandTotal.equals(expectedGrand)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'AMOUNT_INCONSISTENT',
        message: `ยอดรวมไม่สอดคล้องกัน: subtotal (${receipt.subtotal}) + VAT (${receipt.vatAmount}) − WHT (${receipt.withholdingTaxAmount}) = ${expectedGrand} แต่ grandTotal = ${receipt.grandTotal}`,
        expectedGrandTotal: expectedGrand.toString(),
        actualGrandTotal: receipt.grandTotal.toString(),
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.expenseRecord.create({
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

      // Post the matching journal entry in the same transaction so a journal
      // failure rolls back the expense record (and vice versa). Standard Thai
      // SMB expense entry:
      //   Dr Expense (subtotal — by category)
      //   Dr Input VAT (vatAmount, if any)
      //   Cr Cash (grandTotal — what we actually paid out)
      //   Cr WHT Payable (whtAmount, if any)
      // Balance: subtotal + vat = grandTotal + wht ← guaranteed by H3.
      const expenseAccount = expenseAccountForCategory(receipt.category);
      const lines: Parameters<typeof this.journal.postWithTx>[1]['lines'] = [
        {
          accountCode: expenseAccount.code,
          accountName: expenseAccount.name,
          debit: receipt.subtotal,
          partnerId: receipt.vendorId!,
          description: receipt.documentNumber ?? receipt.originalFileName,
        },
      ];
      if (!receipt.vatAmount.isZero()) {
        lines.push({
          accountCode: ACCOUNTS.INPUT_VAT.code,
          accountName: ACCOUNTS.INPUT_VAT.name,
          debit: receipt.vatAmount,
        });
      }
      lines.push({
        accountCode: ACCOUNTS.CASH.code,
        accountName: ACCOUNTS.CASH.name,
        credit: receipt.grandTotal,
        partnerId: receipt.vendorId!,
      });
      if (!receipt.withholdingTaxAmount.isZero()) {
        lines.push({
          accountCode: ACCOUNTS.WHT_PAYABLE.code,
          accountName: ACCOUNTS.WHT_PAYABLE.name,
          credit: receipt.withholdingTaxAmount,
        });
      }
      await this.journal.postWithTx(tx, {
        companyId,
        userId,
        entryDate: expenseDate,
        description: `รายจ่าย — ${receipt.proposedVendorName ?? 'vendor'} ${receipt.documentNumber ?? ''}`.trim(),
        sourceType: 'EXPENSE_RECORD',
        sourceId: record.id,
        lines,
      });

      // Snapshot INPUT VAT for tax reporting when the receipt has VAT.
      // We use the vendor's snapshot info (or proposedVendor fallback) so the
      // record survives the vendor row being renamed/deactivated later.
      if (!receipt.vatAmount.isZero()) {
        // Effective VAT rate inferred from baseAmount: vat / base * 100, rounded.
        // Common case is 7%; the receipt may have a non-standard rate from
        // earlier imports — preserve it rather than hard-coding.
        const vatRate = receipt.subtotal.isZero()
          ? new Prisma.Decimal(0)
          : receipt.vatAmount.div(receipt.subtotal).mul(100).toDecimalPlaces(2);

        // Pull vendor snapshot — vendor must exist at this point (vendorId guard above)
        const vendor = await tx.partner.findUniqueOrThrow({
          where: { id: receipt.vendorId! },
          select: { nameTh: true, taxId: true },
        });

        await this.vat.recordWithTx(tx, {
          companyId,
          recordType: 'INPUT',
          sourceType: 'EXPENSE_RECORD',
          sourceId: record.id,
          documentDate: receipt.documentDate ?? expenseDate,
          documentNumber: receipt.documentNumber,
          partnerName: vendor.nameTh,
          partnerTaxId: vendor.taxId,
          baseAmount: receipt.subtotal,
          vatRate,
          vatAmount: receipt.vatAmount,
        });
      }

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

  async readStoredFile(companyId: string, id: string) {
    const receipt = await this.prisma.expenseReceipt.findFirst({
      where: { id, companyId },
      select: { storedPath: true, originalFileName: true, mimeType: true },
    });
    if (!receipt) throw new NotFoundException('Expense receipt not found');

    const absolutePath = this.resolveStoredPath(receipt.storedPath);
    try {
      const buffer = await readFile(absolutePath);
      return { buffer, originalFileName: receipt.originalFileName, mimeType: receipt.mimeType };
    } catch {
      throw new NotFoundException('ไฟล์ใบเสร็จไม่พบบนเครื่องเก็บข้อมูล');
    }
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

    // M4: collapse runs of whitespace so "บริษัท  ก  จำกัด" matches "บริษัท ก จำกัด".
    // MySQL utf8mb4_unicode_ci is already case-insensitive at column level, so case
    // doesn't need a Prisma `mode` toggle. We then scan candidates whose normalized
    // name matches the normalized input. If the dataset grows this should switch
    // to a stored normalized column with an index.
    const cleanName = this.normalizeName(name);
    if (!cleanName) return null;

    const candidates = await this.prisma.partner.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [{ type: 'VENDOR' }, { type: 'BOTH' }],
      },
      select: {
        id: true,
        code: true,
        nameTh: true,
        taxId: true,
        branch: true,
        address: true,
        type: true,
      },
    });
    const normalizedInput = cleanName.toLocaleLowerCase('th-TH');
    return (
      candidates.find(
        (p) => this.normalizeName(p.nameTh)?.toLocaleLowerCase('th-TH') === normalizedInput,
      ) ?? null
    );
  }

  /** Trim + collapse runs of whitespace. Returns null on empty input. */
  private normalizeName(value?: string | null): string | null {
    const trimmed = value?.trim().replace(/\s+/g, ' ');
    return trimmed ? trimmed : null;
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

  /**
   * Write file to disk. Returns:
   *  - `relativePath` to store in DB (portable across storage roots)
   *  - `absolutePath` for the caller's unlink-on-rollback finally block
   *
   * M2: storing relative paths means moving ATTACHMENT_DIR doesn't invalidate
   * every receipt row in the DB.
   */
  private async persistFile(companyId: string, file: UploadFile) {
    const dirRelative = join('expense-receipts', companyId);
    const dirAbsolute = join(this.getStorageRoot(), dirRelative);
    await mkdir(dirAbsolute, { recursive: true });
    const ext = this.extensionFor(file.mimetype);
    const filename = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}${ext}`;
    const relativePath = join(dirRelative, filename);
    const absolutePath = join(dirAbsolute, filename);
    await writeFile(absolutePath, file.buffer);
    return { relativePath, absolutePath };
  }

  private getStorageRoot(): string {
    // H8: ATTACHMENT_DIR is the env var actually declared in .env.example.
    return this.config.get<string>('ATTACHMENT_DIR') ?? join(process.cwd(), 'var', 'attachments');
  }

  /**
   * Resolve a DB-stored path back to an absolute filesystem path.
   * Backward-compat: rows written before M2 may have stored absolute paths —
   * return those as-is so old receipts are still readable.
   */
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
