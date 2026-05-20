import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { ForeignTaxObligation } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join } from 'path';
import type { Role } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadExpenseReceiptDto } from './dto/upload-expense-receipt.dto';
import { UpdateExpenseReceiptDto } from './dto/update-expense-receipt.dto';
import { ListExpenseReceiptsDto } from './dto/list-expense-receipts.dto';
import { ListForeignTaxObligationsDto } from './dto/list-foreign-tax-obligations.dto';
import { FileForeignTaxObligationDto } from './dto/file-foreign-tax-obligation.dto';
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

    const billingNameMismatch = await this.isBillingMismatch(companyId, dto.billedToName);

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
            isForeign: dto.isForeign ?? false,
            expenseNature: dto.expenseNature ?? null,
            usedInThailand: dto.usedInThailand ?? true,
            currency: dto.currency || 'THB',
            fxRate: dto.fxRate ? new Prisma.Decimal(dto.fxRate) : new Prisma.Decimal(1),
            foreignSubtotal: dto.foreignSubtotal ? new Prisma.Decimal(dto.foreignSubtotal) : null,
            reverseChargeVat: dto.reverseChargeVat ?? false,
            reverseChargeVatRate: dto.reverseChargeVatRate
              ? new Prisma.Decimal(dto.reverseChargeVatRate)
              : new Prisma.Decimal(7),
            dtaCountry: this.blankToNull(dto.dtaCountry),
            foreignWhtType: dto.foreignWhtType ?? null,
            foreignWhtBorneBy: dto.foreignWhtBorneBy ?? null,
            foreignWhtRate: dto.foreignWhtRate ? new Prisma.Decimal(dto.foreignWhtRate) : null,
            billedToName: this.blankToNull(dto.billedToName),
            billingNameMismatch,
            treatAsIntangible: dto.treatAsIntangible ?? false,
            intangibleUsefulLifeMonths: dto.intangibleUsefulLifeMonths
              ? Number(dto.intangibleUsefulLifeMonths)
              : null,
            serviceStart: dto.serviceStart ? new Date(dto.serviceStart) : null,
            serviceEnd: dto.serviceEnd ? new Date(dto.serviceEnd) : null,
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

  async aiExtract(file?: UploadFile) {
    if (!file) throw new BadRequestException('Receipt file is required');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only PDF, JPEG, PNG, or WEBP receipt files are supported');
    }

    const apiKey = this.config.get<string>('OPENROUTER_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY สำหรับ OCR ด้วย AI');
    }

    const model = this.config.get<string>('OPENROUTER_MODEL_EXTRACT')?.trim()
      || 'anthropic/claude-sonnet-4';
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const content: any[] = [
      {
        type: 'text',
        text: [
          'อ่านข้อความจากใบเสร็จ/ใบกำกับภาษีซื้อภาษาไทย แล้วคืน JSON เท่านั้น',
          'schema: {"vendorName":"","vendorTaxId":"","vendorBranch":"","vendorAddress":"","documentNumber":"","documentDate":"","paidAt":"","category":"","subtotal":"","vatAmount":"","withholdingTaxAmount":"","grandTotal":"","note":""}',
          'วันที่ให้ใช้รูปแบบ YYYY-MM-DD ค.ศ. ถ้าไม่แน่ใจให้เว้นว่าง',
          'จำนวนเงินให้ใช้เลขทศนิยม 2 ตำแหน่ง ไม่ใส่ comma หรือสัญลักษณ์เงิน',
          'category ให้สรุปเป็นหมวดรายจ่ายสั้น ๆ เช่น ค่าซอฟต์แวร์ ค่าเดินทาง ค่าวัสดุสำนักงาน',
          'ถ้าฟิลด์ใดอ่านไม่ได้ให้คืน empty string ห้ามเดา',
        ].join('\n'),
      },
      file.mimetype.startsWith('image/')
        ? { type: 'image_url', image_url: { url: dataUrl } }
        : { type: 'file', file: { filename: file.originalname, file_data: dataUrl } },
    ];

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'HJ Account AI',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ServiceUnavailableException(
        body?.error?.message ?? 'AI OCR service unavailable',
      );
    }

    const raw = body?.choices?.[0]?.message?.content;
    const extracted = this.parseAiJson(raw);
    return {
      fields: this.normalizeAiFields(extracted),
      sourceFile: {
        name: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    };
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

  /**
   * Edit the metadata of an uploaded receipt before it is accounted — vendor
   * proposal, dates, category, note, and the amounts. Blocked once ACCOUNTED
   * since that would desync the posted journal. Vendor linking stays in
   * linkVendor/approveVendor; this only touches the proposed fields + amounts.
   */
  async update(companyId: string, id: string, dto: UpdateExpenseReceiptDto) {
    const receipt = await this.loadEntity(companyId, id);
    if (receipt.status === 'ACCOUNTED') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'ALREADY_ACCOUNTED',
        message: 'ใบเสร็จนี้ลงรายจ่ายแล้ว — แก้ไขไม่ได้ ต้องยกเลิกการลงบัญชีก่อน',
      });
    }

    const billingNameMismatch =
      dto.billedToName !== undefined
        ? await this.isBillingMismatch(companyId, dto.billedToName)
        : undefined;

    // Partial update: only fields the client actually sent (!== undefined) are
    // touched. Sending an empty string clears the field (→ null / 0); omitting
    // it leaves the stored value intact — so fields not shown in the edit form
    // (e.g. note) and the strictly-validated vendorTaxId are never wiped.
    const updated = await this.prisma.expenseReceipt.update({
      where: { id },
      data: {
        proposedVendorName:
          dto.vendorName !== undefined ? this.blankToNull(dto.vendorName) : undefined,
        proposedVendorTaxId:
          dto.vendorTaxId !== undefined ? this.blankToNull(dto.vendorTaxId) : undefined,
        proposedVendorBranch:
          dto.vendorBranch !== undefined ? this.blankToNull(dto.vendorBranch) : undefined,
        proposedVendorAddress:
          dto.vendorAddress !== undefined ? this.blankToNull(dto.vendorAddress) : undefined,
        documentNumber:
          dto.documentNumber !== undefined ? this.blankToNull(dto.documentNumber) : undefined,
        documentDate:
          dto.documentDate !== undefined
            ? dto.documentDate
              ? new Date(dto.documentDate)
              : null
            : undefined,
        paidAt:
          dto.paidAt !== undefined ? (dto.paidAt ? new Date(dto.paidAt) : null) : undefined,
        category: dto.category !== undefined ? this.blankToNull(dto.category) : undefined,
        note: dto.note !== undefined ? this.blankToNull(dto.note) : undefined,
        subtotal: dto.subtotal !== undefined ? this.money(dto.subtotal) : undefined,
        vatAmount: dto.vatAmount !== undefined ? this.money(dto.vatAmount) : undefined,
        withholdingTaxAmount:
          dto.withholdingTaxAmount !== undefined
            ? this.money(dto.withholdingTaxAmount)
            : undefined,
        grandTotal: dto.grandTotal !== undefined ? this.money(dto.grandTotal) : undefined,
        isForeign: dto.isForeign !== undefined ? dto.isForeign : undefined,
        expenseNature: dto.expenseNature !== undefined ? (dto.expenseNature ?? null) : undefined,
        usedInThailand: dto.usedInThailand !== undefined ? dto.usedInThailand : undefined,
        currency: dto.currency !== undefined ? dto.currency || 'THB' : undefined,
        fxRate:
          dto.fxRate !== undefined
            ? dto.fxRate
              ? new Prisma.Decimal(dto.fxRate)
              : new Prisma.Decimal(1)
            : undefined,
        foreignSubtotal:
          dto.foreignSubtotal !== undefined
            ? dto.foreignSubtotal
              ? new Prisma.Decimal(dto.foreignSubtotal)
              : null
            : undefined,
        reverseChargeVat: dto.reverseChargeVat !== undefined ? dto.reverseChargeVat : undefined,
        reverseChargeVatRate:
          dto.reverseChargeVatRate !== undefined
            ? dto.reverseChargeVatRate
              ? new Prisma.Decimal(dto.reverseChargeVatRate)
              : new Prisma.Decimal(7)
            : undefined,
        dtaCountry: dto.dtaCountry !== undefined ? this.blankToNull(dto.dtaCountry) : undefined,
        foreignWhtType: dto.foreignWhtType !== undefined ? (dto.foreignWhtType ?? null) : undefined,
        foreignWhtBorneBy:
          dto.foreignWhtBorneBy !== undefined ? (dto.foreignWhtBorneBy ?? null) : undefined,
        foreignWhtRate:
          dto.foreignWhtRate !== undefined
            ? dto.foreignWhtRate
              ? new Prisma.Decimal(dto.foreignWhtRate)
              : null
            : undefined,
        billedToName:
          dto.billedToName !== undefined ? this.blankToNull(dto.billedToName) : undefined,
        billingNameMismatch,
        treatAsIntangible:
          dto.treatAsIntangible !== undefined ? dto.treatAsIntangible : undefined,
        intangibleUsefulLifeMonths:
          dto.intangibleUsefulLifeMonths !== undefined
            ? dto.intangibleUsefulLifeMonths
              ? Number(dto.intangibleUsefulLifeMonths)
              : null
            : undefined,
        serviceStart:
          dto.serviceStart !== undefined
            ? dto.serviceStart
              ? new Date(dto.serviceStart)
              : null
            : undefined,
        serviceEnd:
          dto.serviceEnd !== undefined ? (dto.serviceEnd ? new Date(dto.serviceEnd) : null) : undefined,
      },
      include: this.include(),
    });

    return this.toDto(updated);
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
          isForeign: receipt.isForeign,
          expenseNature: receipt.expenseNature,
          currency: receipt.currency,
          fxRate: receipt.fxRate,
          foreignSubtotal: receipt.foreignSubtotal,
          foreignWhtType: receipt.foreignWhtType,
          foreignWhtBorneBy: receipt.foreignWhtBorneBy,
          foreignWhtRate: receipt.foreignWhtRate,
          treatAsIntangible: receipt.treatAsIntangible,
          serviceStart: receipt.serviceStart,
          serviceEnd: receipt.serviceEnd,
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
      // F4 — capitalize as intangible → debit the asset, not an expense account.
      const expenseAccount = receipt.treatAsIntangible
        ? ACCOUNTS.INTANGIBLE_ASSET
        : expenseAccountForCategory(receipt.category);
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

      // F4 — when capitalized, create a FixedAsset so the existing depreciation
      // module amortizes it over its useful life. The journal above already
      // debited the intangible-asset account; reports exclude this record from
      // P&L expense (treatAsIntangible) so it isn't double-counted.
      if (receipt.treatAsIntangible) {
        await tx.fixedAsset.create({
          data: {
            companyId,
            name:
              receipt.category?.trim() ||
              receipt.proposedVendorName?.trim() ||
              'สินทรัพย์ไม่มีตัวตน',
            category: ACCOUNTS.INTANGIBLE_ASSET.name,
            acquiredAt: expenseDate,
            cost: receipt.subtotal,
            salvageValue: new Prisma.Decimal(0),
            usefulLifeMonths: receipt.intangibleUsefulLifeMonths ?? 36,
            accumulatedDepr: new Prisma.Decimal(0),
            bookValue: receipt.subtotal,
            expenseRecordId: record.id,
          },
        });
      }

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

      // PP.36 reverse-charge VAT — foreign service used in Thailand. The receipt
      // stays VAT=0; we create a separate PENDING obligation for the 7% the payer
      // must self-remit. Filing later posts Dr Input VAT / Cr Cash + a VatRecord.
      // Goods are excluded (their VAT is paid at customs, evidenced separately).
      if (
        receipt.isForeign &&
        receipt.expenseNature === 'SERVICE' &&
        receipt.usedInThailand &&
        receipt.reverseChargeVat
      ) {
        const taxAmount = receipt.subtotal
          .mul(receipt.reverseChargeVatRate)
          .div(100)
          .toDecimalPlaces(2);
        const ey = expenseDate.getFullYear();
        const em = expenseDate.getMonth() + 1;
        const file = this.nextPeriod(ey, em);
        await tx.foreignTaxObligation.create({
          data: {
            companyId,
            expenseRecordId: record.id,
            kind: 'PP36_VAT',
            status: 'PENDING',
            baseAmount: receipt.subtotal,
            rate: receipt.reverseChargeVatRate,
            taxAmount,
            expensePeriodYear: ey,
            expensePeriodMonth: em,
            filePeriodYear: file.year,
            filePeriodMonth: file.month,
          },
        });
      }

      // PND.54 — withholding tax on the foreign payment. Created PENDING; the
      // file step posts the remittance journal (debit account varies by who
      // bears the tax) and a WithholdingTaxRecord(PAYABLE) → WHT report + 50-ทวิ.
      if (
        receipt.isForeign &&
        receipt.foreignWhtType &&
        receipt.foreignWhtRate &&
        receipt.foreignWhtRate.gt(0)
      ) {
        const rate = receipt.foreignWhtRate;
        let base = receipt.subtotal;
        let tax: Prisma.Decimal;
        if (receipt.foreignWhtBorneBy === 'GROSSED_UP') {
          // Company bears the tax: gross up the net paid to the vendor.
          base = receipt.subtotal
            .mul(100)
            .div(new Prisma.Decimal(100).minus(rate))
            .toDecimalPlaces(2);
          tax = base.minus(receipt.subtotal).toDecimalPlaces(2);
        } else if (receipt.foreignWhtBorneBy === 'WITHHELD') {
          // Already deducted from the vendor at payment → use the amount withheld.
          tax = receipt.withholdingTaxAmount.gt(0)
            ? receipt.withholdingTaxAmount
            : receipt.subtotal.mul(rate).div(100).toDecimalPlaces(2);
        } else {
          // RECOVERABLE (paid full, recover later) → statutory on the base.
          tax = receipt.subtotal.mul(rate).div(100).toDecimalPlaces(2);
        }
        const wy = expenseDate.getFullYear();
        const wm = expenseDate.getMonth() + 1;
        const wfile = this.nextPeriod(wy, wm);
        await tx.foreignTaxObligation.create({
          data: {
            companyId,
            expenseRecordId: record.id,
            kind: 'PND54_WHT',
            status: 'PENDING',
            baseAmount: base,
            rate,
            taxAmount: tax,
            expensePeriodYear: wy,
            expensePeriodMonth: wm,
            filePeriodYear: wfile.year,
            filePeriodMonth: wfile.month,
          },
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

  /** List foreign-tax obligations (PP.36 / PND.54), filtered by status/kind/file period. */
  async listObligations(companyId: string, dto: ListForeignTaxObligationsDto) {
    const where: Prisma.ForeignTaxObligationWhereInput = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.kind ? { kind: dto.kind } : {}),
      ...(dto.year ? { filePeriodYear: dto.year } : {}),
      ...(dto.month ? { filePeriodMonth: dto.month } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.foreignTaxObligation.findMany({
        where,
        include: {
          expenseRecord: {
            select: {
              id: true,
              documentNumber: true,
              category: true,
              expenseDate: true,
              currency: true,
              foreignSubtotal: true,
              foreignWhtType: true,
              foreignWhtBorneBy: true,
              vendor: { select: { nameTh: true } },
            },
          },
        },
        orderBy: [
          { filePeriodYear: 'desc' },
          { filePeriodMonth: 'desc' },
          { createdAt: 'desc' },
        ],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.foreignTaxObligation.count({ where }),
    ]);

    return {
      items: items.map(({ expenseRecord, ...base }) => ({
        ...this.obligationToDto(base),
        expenseRecord: {
          ...expenseRecord,
          expenseDate: expenseRecord.expenseDate.toISOString(),
          foreignSubtotal: expenseRecord.foreignSubtotal?.toString() ?? null,
        },
      })),
      total,
    };
  }

  /**
   * Mark a PP.36 obligation as filed + remitted. Posts Dr Input VAT / Cr Cash in
   * the filing period and snapshots a VatRecord(INPUT) so the 7% flows into that
   * month's PP.30 input tax. Idempotent guard: only PENDING can be filed.
   */
  async fileObligation(
    companyId: string,
    userId: string,
    id: string,
    dto: FileForeignTaxObligationDto,
  ) {
    const obligation = await this.prisma.foreignTaxObligation.findFirst({
      where: { id, companyId },
      include: {
        expenseRecord: {
          select: {
            documentNumber: true,
            expenseDate: true,
            foreignWhtType: true,
            foreignWhtBorneBy: true,
            vendor: { select: { nameTh: true } },
          },
        },
      },
    });
    if (!obligation) throw new NotFoundException('Foreign tax obligation not found');
    if (obligation.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'OBLIGATION_ALREADY_FILED',
        message: 'ภาระภาษีนี้นำส่งแล้ว',
      });
    }

    // Default the journal date to the 7th of the filing period (statutory due
    // date), at local noon so the period derives cleanly regardless of TZ.
    const entryDate = dto.filedAt
      ? new Date(dto.filedAt)
      : new Date(obligation.filePeriodYear, obligation.filePeriodMonth - 1, 7, 12);
    if (Number.isNaN(entryDate.getTime())) {
      throw new BadRequestException('filedAt ไม่ถูกต้อง');
    }

    const vendorName = obligation.expenseRecord.vendor?.nameTh ?? 'foreign vendor';

    const updated = await this.prisma.$transaction(async (tx) => {
      let entryId: string;

      if (obligation.kind === 'PP36_VAT') {
        const entry = await this.journal.postWithTx(tx, {
          companyId,
          userId,
          entryDate,
          description: `นำส่ง ภ.พ.36 — ${vendorName} (ภาษีซื้อ ${obligation.taxAmount.toString()})`,
          sourceType: 'ADJUSTMENT',
          sourceId: obligation.id,
          lines: [
            {
              accountCode: ACCOUNTS.INPUT_VAT.code,
              accountName: ACCOUNTS.INPUT_VAT.name,
              debit: obligation.taxAmount,
              description: 'ภาษีซื้อจาก ภ.พ.36',
            },
            {
              accountCode: ACCOUNTS.CASH.code,
              accountName: ACCOUNTS.CASH.name,
              credit: obligation.taxAmount,
              description: 'นำส่ง ภ.พ.36',
            },
          ],
        });
        entryId = entry.id;

        await this.vat.recordWithTx(tx, {
          companyId,
          recordType: 'INPUT',
          sourceType: 'PP36_OBLIGATION',
          sourceId: obligation.id,
          documentDate: entryDate,
          documentNumber: obligation.expenseRecord.documentNumber,
          partnerName: vendorName,
          partnerTaxId: null,
          baseAmount: obligation.baseAmount,
          vatRate: obligation.rate,
          vatAmount: obligation.taxAmount,
        });
      } else {
        // PND.54 remittance. Debit account depends on who bears the tax:
        //   WITHHELD    → Dr WHT Payable (liability already set on the expense journal)
        //   RECOVERABLE → Dr Other Receivable (the vendor owes it back to us)
        //   GROSSED_UP  → Dr WHT Borne Expense (we absorb it as a cost)
        const borneBy = obligation.expenseRecord.foreignWhtBorneBy;
        const debit =
          borneBy === 'RECOVERABLE'
            ? ACCOUNTS.OTHER_RECEIVABLE_WHT
            : borneBy === 'GROSSED_UP'
              ? ACCOUNTS.WHT_BORNE_EXPENSE
              : ACCOUNTS.WHT_PAYABLE;
        const entry = await this.journal.postWithTx(tx, {
          companyId,
          userId,
          entryDate,
          description: `นำส่ง ภ.ง.ด.54 — ${vendorName} (หัก ณ ที่จ่าย ${obligation.taxAmount.toString()})`,
          sourceType: 'ADJUSTMENT',
          sourceId: obligation.id,
          lines: [
            {
              accountCode: debit.code,
              accountName: debit.name,
              debit: obligation.taxAmount,
              description: 'ภ.ง.ด.54',
            },
            {
              accountCode: ACCOUNTS.CASH.code,
              accountName: ACCOUNTS.CASH.name,
              credit: obligation.taxAmount,
              description: 'นำส่ง ภ.ง.ด.54',
            },
          ],
        });
        entryId = entry.id;

        await tx.withholdingTaxRecord.create({
          data: {
            companyId,
            recordType: 'PAYABLE',
            sourceType: 'FOREIGN_WHT',
            sourceId: obligation.id,
            paidAt: entryDate,
            partnerName: vendorName,
            partnerTaxId: null,
            baseAmount: obligation.baseAmount,
            rate: obligation.rate,
            whtAmount: obligation.taxAmount,
            category: obligation.expenseRecord.foreignWhtType ?? 'OTHER',
            periodYear: obligation.filePeriodYear,
            periodMonth: obligation.filePeriodMonth,
          },
        });
      }

      return tx.foreignTaxObligation.update({
        where: { id: obligation.id },
        data: {
          status: 'FILED',
          filedAt: new Date(),
          filedBy: userId,
          journalEntryId: entryId,
          note: this.blankToNull(dto.note) ?? obligation.note,
        },
      });
    });

    return this.obligationToDto(updated);
  }

  /**
   * Suggest a PND.54 withholding rate from the DTA reference table. Exact
   * country match wins; falls back to the "*" (no-DTA / Section 70) default.
   * This is a suggestion — the accountant confirms the final rate.
   */
  async lookupWhtRate(country: string | undefined, incomeType: 'ROYALTY' | 'SERVICE' | 'OTHER') {
    const c = (country ?? '').trim().toUpperCase();
    const rows = await this.prisma.foreignWhtRate.findMany({
      where: { incomeType, country: { in: c ? [c, '*'] : ['*'] } },
    });
    const picked = (c ? rows.find((r) => r.country === c) : undefined) ?? rows.find((r) => r.country === '*');
    return picked
      ? { country: picked.country, incomeType, rate: picked.rate.toString(), note: picked.note }
      : null;
  }

  /** Next month period (rolls the year at December). month is 1-12. */
  private nextPeriod(year: number, month: number): { year: number; month: number } {
    return month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
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

  /**
   * F4 — flag receipts billed to someone other than the company (e.g. a Cursor
   * invoice issued to a personal name). True when billedToName is set and does
   * not match the company's Thai/English name → the operator should attach a
   * reimbursement voucher and fix the billing name going forward.
   */
  private async isBillingMismatch(companyId: string, billedToName?: string | null): Promise<boolean> {
    if (!this.normalizeName(billedToName)) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { nameTh: true, nameEn: true },
    });
    if (!company) return false;
    const norm = (s?: string | null) => this.normalizeName(s)?.toLocaleLowerCase('th-TH') ?? '';
    const target = norm(billedToName);
    return target !== norm(company.nameTh) && target !== norm(company.nameEn);
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

  private parseAiJson(raw: unknown) {
    if (typeof raw !== 'string') return {};
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException('AI OCR returned invalid JSON');
    }
  }

  private normalizeAiFields(fields: Record<string, unknown>) {
    const stringField = (key: string) =>
      typeof fields[key] === 'string' ? fields[key].trim() : '';
    const moneyField = (key: string) => stringField(key).replace(/,/g, '');
    return {
      vendorName: stringField('vendorName'),
      vendorTaxId: stringField('vendorTaxId').replace(/[^\d]/g, ''),
      vendorBranch: stringField('vendorBranch'),
      vendorAddress: stringField('vendorAddress'),
      documentNumber: stringField('documentNumber'),
      documentDate: this.inputDateOrEmpty(stringField('documentDate')),
      paidAt: this.inputDateOrEmpty(stringField('paidAt')),
      category: stringField('category'),
      subtotal: moneyField('subtotal'),
      vatAmount: moneyField('vatAmount'),
      withholdingTaxAmount: moneyField('withholdingTaxAmount'),
      grandTotal: moneyField('grandTotal'),
      note: stringField('note'),
    };
  }

  private inputDateOrEmpty(value: string) {
    if (!value) return '';
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
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
      expenseRecord: {
        include: { foreignTaxObligations: { orderBy: { createdAt: 'asc' } } },
      },
    } satisfies Prisma.ExpenseReceiptInclude;
  }

  private toDto(receipt: Prisma.ExpenseReceiptGetPayload<{ include: ReturnType<ExpenseReceiptsService['include']> }>) {
    return {
      ...receipt,
      subtotal: receipt.subtotal.toString(),
      vatAmount: receipt.vatAmount.toString(),
      withholdingTaxAmount: receipt.withholdingTaxAmount.toString(),
      grandTotal: receipt.grandTotal.toString(),
      fxRate: receipt.fxRate.toString(),
      foreignSubtotal: receipt.foreignSubtotal?.toString() ?? null,
      reverseChargeVatRate: receipt.reverseChargeVatRate.toString(),
      foreignWhtRate: receipt.foreignWhtRate?.toString() ?? null,
      serviceStart: receipt.serviceStart?.toISOString() ?? null,
      serviceEnd: receipt.serviceEnd?.toISOString() ?? null,
      expenseRecord: receipt.expenseRecord
        ? {
            ...receipt.expenseRecord,
            subtotal: receipt.expenseRecord.subtotal.toString(),
            vatAmount: receipt.expenseRecord.vatAmount.toString(),
            withholdingTaxAmount: receipt.expenseRecord.withholdingTaxAmount.toString(),
            grandTotal: receipt.expenseRecord.grandTotal.toString(),
            fxRate: receipt.expenseRecord.fxRate.toString(),
            foreignSubtotal: receipt.expenseRecord.foreignSubtotal?.toString() ?? null,
            foreignWhtRate: receipt.expenseRecord.foreignWhtRate?.toString() ?? null,
            serviceStart: receipt.expenseRecord.serviceStart?.toISOString() ?? null,
            serviceEnd: receipt.expenseRecord.serviceEnd?.toISOString() ?? null,
            foreignTaxObligations: receipt.expenseRecord.foreignTaxObligations.map((o) =>
              this.obligationToDto(o),
            ),
          }
        : null,
    };
  }

  private obligationToDto(o: ForeignTaxObligation) {
    return {
      ...o,
      baseAmount: o.baseAmount.toString(),
      rate: o.rate.toString(),
      taxAmount: o.taxAmount.toString(),
      filedAt: o.filedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}
