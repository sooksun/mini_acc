import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, SalesDocument, SalesDocumentItem } from '@prisma/client';
import type { DocumentStatus, DocumentType, Role } from '@hj/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { getBuddhistYear } from '../../numbering/be-year';
import { validateTransition } from '../../lifecycle/validate-transition';
import { VatService } from '../../tax/vat.service';
import { JournalService } from '../../journal/journal.service';
import { ACCOUNTS, AccountRef } from '../../journal/accounts';
import {
  CreateSalesDocumentInput,
  ListSalesDocumentsQuery,
  PreCreateHook,
  SalesDocumentItemInput,
} from './sales-document.types';
import { computeTotals, lineTotal } from './totals';

@Injectable()
export class SalesDocumentService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private vat: VatService,
    private journal: JournalService,
  ) {}

  /** Validate that a projectId (if given) belongs to the company. */
  private async resolveProjectId(
    companyId: string,
    projectId: string | undefined,
  ): Promise<string | null> {
    if (!projectId) return null;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project.id;
  }

  async create(
    type: DocumentType,
    companyId: string,
    userId: string,
    input: CreateSalesDocumentInput,
    preValidate?: PreCreateHook,
  ) {
    const customer = await this.prisma.partner.findFirst({
      where: {
        id: input.customerId,
        companyId,
        OR: [{ type: 'CUSTOMER' }, { type: 'BOTH' }],
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found or not a customer');
    }

    if (preValidate) await preValidate(companyId, customer, input);

    await this.validateProducts(companyId, input.items);
    const projectId = await this.resolveProjectId(companyId, input.projectId);

    const totals = computeTotals(input.items, input.vatRate ?? 7, input.whtRate ?? 0);
    const documentDate = new Date(input.documentDate);
    const beYear = getBuddhistYear(documentDate);
    const placeholder = `DRAFT-${randomUUID().slice(0, 8).toUpperCase()}`;

    const created = await this.prisma.salesDocument.create({
      data: {
        companyId,
        type,
        number: placeholder,
        beYear,
        status: 'DRAFT',
        customerId: customer.id,
        projectId,
        documentDate,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        customerSnapshotName: customer.nameTh,
        customerSnapshotAddress: customer.address,
        customerSnapshotTaxId: customer.taxId,
        customerSnapshotBranch: customer.branch,
        subtotal: totals.subtotal,
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        totalAfterVat: totals.totalAfterVat,
        whtRate: totals.whtRate,
        whtAmount: totals.whtAmount,
        grandTotal: totals.grandTotal,
        netReceived: totals.netReceived,
        createdBy: userId,
        items: {
          create: input.items.map((item, idx) => ({
            productId: item.productId ?? null,
            lineNumber: idx + 1,
            productCode: item.productCode ?? null,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount ?? 0,
            lineTotal: lineTotal(item),
            vatable: item.vatable ?? true,
          })),
        },
      },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });

    return this.toDto(created);
  }

  /**
   * Update a DRAFT sales document. Only `DRAFT` status is editable — once
   * confirmed (USER_CONFIRMED+), the document is locked and corrections must
   * happen via void + new document. OWNER/ADMIN authorisation is enforced at
   * the controller level via @Roles.
   *
   * Replaces all items + recomputes totals. Re-resolves the customer snapshot
   * if the customerId changed.
   */
  async update(
    type: DocumentType,
    companyId: string,
    id: string,
    input: CreateSalesDocumentInput,
    preValidate?: PreCreateHook,
  ) {
    const existing = await this.prisma.salesDocument.findFirst({
      where: { id, companyId, type },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Document not found');
    if (existing.status !== 'DRAFT') {
      throw new UnprocessableEntityException({
        code: 'ONLY_DRAFT_EDITABLE',
        message: `แก้ไขเอกสารได้เฉพาะสถานะ DRAFT — ปัจจุบัน ${existing.status}. กรุณายกเลิกแล้วสร้างใบใหม่`,
        status: existing.status,
      });
    }

    const customer = await this.prisma.partner.findFirst({
      where: {
        id: input.customerId,
        companyId,
        OR: [{ type: 'CUSTOMER' }, { type: 'BOTH' }],
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found or not a customer');
    }

    if (preValidate) await preValidate(companyId, customer, input);

    await this.validateProducts(companyId, input.items);

    const projectId = await this.resolveProjectId(companyId, input.projectId);
    const totals = computeTotals(input.items, input.vatRate ?? 7, input.whtRate ?? 0);
    const documentDate = new Date(input.documentDate);
    const beYear = getBuddhistYear(documentDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Replace all items — simpler + safer than diffing, and DRAFTs aren't
      // referenced from journals or VAT records yet so cascading is fine.
      await tx.salesDocumentItem.deleteMany({ where: { salesDocumentId: id } });

      return tx.salesDocument.update({
        where: { id },
        data: {
          customerId: customer.id,
          projectId,
          documentDate,
          beYear,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          reference: input.reference ?? null,
          note: input.note ?? null,
          customerSnapshotName: customer.nameTh,
          customerSnapshotAddress: customer.address,
          customerSnapshotTaxId: customer.taxId,
          customerSnapshotBranch: customer.branch,
          subtotal: totals.subtotal,
          vatRate: totals.vatRate,
          vatAmount: totals.vatAmount,
          totalAfterVat: totals.totalAfterVat,
          whtRate: totals.whtRate,
          whtAmount: totals.whtAmount,
          grandTotal: totals.grandTotal,
          netReceived: totals.netReceived,
          items: {
            create: input.items.map((item, idx) => ({
              productId: item.productId ?? null,
              lineNumber: idx + 1,
              productCode: item.productCode ?? null,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              lineTotal: lineTotal(item),
              vatable: item.vatable ?? true,
            })),
          },
        },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });
    });

    return this.toDto(updated);
  }

  async confirm(
    type: DocumentType,
    companyId: string,
    userId: string,
    role: Role,
    id: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const doc = await tx.salesDocument.findFirst({
        where: { id, companyId, type },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });
      if (!doc) throw new NotFoundException('Document not found');

      if (type === 'TAX_INVOICE' || type === 'RECEIPT_TAX_INVOICE') {
        const snapshotTaxId = doc.customerSnapshotTaxId?.trim() ?? '';
        if (!snapshotTaxId) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'CUSTOMER_TAX_ID_REQUIRED',
            message: 'ลูกค้าในเอกสารนี้ยังไม่มีเลขประจำตัวผู้เสียภาษี — แก้ไขข้อมูลลูกค้าแล้วบันทึกเอกสารใหม่ก่อนยืนยัน',
          });
        }
        if (!/^\d{13}$/.test(snapshotTaxId)) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'CUSTOMER_TAX_ID_INVALID',
            message: 'เลขประจำตัวผู้เสียภาษีในเอกสารนี้ไม่ใช่ตัวเลข 13 หลัก — แก้ไขข้อมูลลูกค้าแล้วบันทึกเอกสารใหม่ก่อนยืนยัน',
          });
        }
        await this.assertVatEligible(companyId, doc.documentDate.toISOString());
      }

      validateTransition({ from: doc.status, to: 'USER_CONFIRMED', role });

      const allocated = await this.numbering.allocate(companyId, type, doc.documentDate, tx);

      const updated = await tx.salesDocument.update({
        where: { id },
        data: {
          status: 'USER_CONFIRMED',
          number: allocated.number,
          confirmedAt: new Date(),
          confirmedBy: userId,
        },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });

      // Snapshot OUTPUT VAT for tax-bearing document types. Non-VAT types
      // (QUOTATION/DELIVERY_NOTE/INVOICE/RECEIPT) skip this — they may have
      // a vatAmount set for total reporting but are not tax invoices.
      if (
        (type === 'TAX_INVOICE' || type === 'RECEIPT_TAX_INVOICE') &&
        !updated.vatAmount.isZero()
      ) {
        await this.vat.recordWithTx(tx, {
          companyId,
          recordType: 'OUTPUT',
          sourceType: 'SALES_DOCUMENT',
          sourceId: updated.id,
          documentDate: updated.documentDate,
          documentNumber: updated.number,
          partnerName: updated.customerSnapshotName,
          partnerTaxId: updated.customerSnapshotTaxId,
          baseAmount: updated.subtotal,
          vatRate: updated.vatRate,
          vatAmount: updated.vatAmount,
        });
      }

      // Post the revenue journal so sales reach the ledger (PRD §7.2). Only
      // revenue-recognition documents post — see postRevenueJournal.
      await this.postRevenueJournal(tx, updated, companyId, userId);

      // Materialise the rest of the chain (DN/INV/RT|RC) as DRAFTs so the
      // operator can confirm each one as the real-world event happens.
      await this.createDownstreamDrafts(tx, updated, companyId, userId);

      return this.toDto(updated);
    });
  }

  /**
   * Which document types recognise revenue in the ledger. Mirrors the
   * recognition rule in ReportsService exactly so the journal-based P&L equals
   * what users saw before: INVOICE/TAX_INVOICE always; a RECEIPT or
   * RECEIPT_TAX_INVOICE only when standalone (no parent invoice) — i.e. a cash
   * sale. A receipt that closes an invoice does NOT re-recognise revenue (the
   * invoice already did); its cash is captured by the Payments module clearing
   * the receivable.
   */
  private recognisesRevenue(doc: SalesDocument): boolean {
    switch (doc.type) {
      case 'INVOICE':
      case 'TAX_INVOICE':
        return true;
      case 'RECEIPT':
      case 'RECEIPT_TAX_INVOICE':
        return doc.parentDocumentId === null;
      default:
        return false;
    }
  }

  /**
   * Post the double-entry for a confirmed sales document.
   *
   *   AR docs (INVOICE / TAX_INVOICE):
   *     Dr ลูกหนี้การค้า (grandTotal)
   *     Cr รายได้ (subtotal)
   *     Cr ภาษีขาย (vatAmount, if any)
   *
   *   Cash docs (standalone RECEIPT / RECEIPT_TAX_INVOICE):
   *     Dr เงินสด (netReceived)
   *     Dr ภาษีหัก ณ ที่จ่ายรอเรียกคืน (whtAmount, if the customer withheld)
   *     Cr รายได้ (subtotal)
   *     Cr ภาษีขาย (vatAmount, if any)
   *
   * Both balance because grandTotal = subtotal + vatAmount and
   * netReceived = grandTotal − whtAmount. Non-revenue documents
   * (QUOTATION / DELIVERY_NOTE / receipts that close an invoice) post nothing.
   */
  private async postRevenueJournal(
    tx: Prisma.TransactionClient,
    doc: SalesDocument & { items: SalesDocumentItem[] },
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (!this.recognisesRevenue(doc)) return;

    const isCash = doc.type === 'RECEIPT' || doc.type === 'RECEIPT_TAX_INVOICE';
    const revenueAccount = await this.resolveRevenueAccount(tx, doc.items);

    const lines: Parameters<typeof this.journal.postWithTx>[1]['lines'] = [];

    if (isCash) {
      lines.push({
        accountCode: ACCOUNTS.CASH.code,
        accountName: ACCOUNTS.CASH.name,
        debit: doc.netReceived,
        partnerId: doc.customerId,
        description: doc.number,
      });
      if (!doc.whtAmount.isZero()) {
        lines.push({
          accountCode: ACCOUNTS.WHT_RECEIVABLE.code,
          accountName: ACCOUNTS.WHT_RECEIVABLE.name,
          debit: doc.whtAmount,
          partnerId: doc.customerId,
        });
      }
    } else {
      lines.push({
        accountCode: ACCOUNTS.AR.code,
        accountName: ACCOUNTS.AR.name,
        debit: doc.grandTotal,
        partnerId: doc.customerId,
        description: doc.number,
      });
    }

    lines.push({
      accountCode: revenueAccount.code,
      accountName: revenueAccount.name,
      credit: doc.subtotal,
      partnerId: doc.customerId,
    });
    if (!doc.vatAmount.isZero()) {
      lines.push({
        accountCode: ACCOUNTS.OUTPUT_VAT.code,
        accountName: ACCOUNTS.OUTPUT_VAT.name,
        credit: doc.vatAmount,
      });
    }

    await this.journal.postWithTx(tx, {
      companyId,
      userId,
      entryDate: doc.documentDate,
      description: `รายได้ ${doc.number} — ${doc.customerSnapshotName}`,
      sourceType: 'SALES_DOCUMENT',
      sourceId: doc.id,
      lines,
    });
  }

  /**
   * Pick the revenue account: "รายได้จากการขาย" (4120) when any line is a
   * stocked good/material/asset, otherwise "รายได้ค่าบริการ" (4110). Free-text
   * lines (no productId) count as service. This only affects the trial-balance
   * label — the P&L groups revenue by document type, not account code.
   */
  private async resolveRevenueAccount(
    tx: Prisma.TransactionClient,
    items: SalesDocumentItem[],
  ): Promise<AccountRef> {
    const productIds = items
      .map((it) => it.productId)
      .filter((id): id is string => !!id);
    if (productIds.length === 0) return ACCOUNTS.REVENUE_SERVICE;

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { type: true },
    });
    const hasGoods = products.some(
      (p) => p.type === 'GOOD' || p.type === 'MATERIAL' || p.type === 'ASSET',
    );
    return hasGoods ? ACCOUNTS.REVENUE_SALE : ACCOUNTS.REVENUE_SERVICE;
  }

  /**
   * One-time backfill: post the revenue journal for already-confirmed sales
   * documents that predate journal posting (so journal-based reports include
   * historical sales). Idempotent — skips any document that already has a
   * POSTED SALES_DOCUMENT entry, and only revenue-recognition documents post.
   */
  async backfillRevenueJournals(companyId: string, userId: string) {
    const docs = await this.prisma.salesDocument.findMany({
      where: {
        companyId,
        status: {
          in: [
            'USER_CONFIRMED',
            'ACCOUNTED',
            'PENDING_ACCOUNTANT',
            'ACCOUNTANT_APPROVED',
            'LOCKED',
          ],
        },
        type: { in: ['INVOICE', 'TAX_INVOICE', 'RECEIPT', 'RECEIPT_TAX_INVOICE'] },
      },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
      orderBy: { documentDate: 'asc' },
    });

    let posted = 0;
    for (const doc of docs) {
      if (!this.recognisesRevenue(doc)) continue;
      const existing = await this.prisma.journalEntry.count({
        where: { companyId, sourceType: 'SALES_DOCUMENT', sourceId: doc.id, status: 'POSTED' },
      });
      if (existing > 0) continue;
      await this.prisma.$transaction((tx) =>
        this.postRevenueJournal(tx, doc, companyId, userId),
      );
      posted += 1;
    }
    return { scanned: docs.length, posted };
  }

  /**
   * Resolve the next document type in the QT → DN → INV → (RT|RC) chain.
   * INVOICE branches to RECEIPT_TAX_INVOICE when the customer has a valid
   * 13-digit tax id, otherwise to a plain RECEIPT. Returns null for the
   * end-of-chain types (RECEIPT / RECEIPT_TAX_INVOICE) and any non-chain type.
   */
  private resolveNextType(
    type: DocumentType,
    customerHasTaxId: boolean,
  ): DocumentType | null {
    switch (type) {
      case 'QUOTATION':
        return 'DELIVERY_NOTE';
      case 'DELIVERY_NOTE':
        return 'INVOICE';
      case 'INVOICE':
        return customerHasTaxId ? 'RECEIPT_TAX_INVOICE' : 'RECEIPT';
      default:
        return null;
    }
  }

  /**
   * After a document is confirmed, materialise the remaining downstream chain
   * (QT → DN → INV → RT|RC) as DRAFTs in one shot. Idempotent: any leg that
   * already has a non-voided child is skipped, so confirming a later document
   * only fills the gaps. INVOICE branches to RECEIPT_TAX_INVOICE when the
   * customer has a 13-digit tax id, otherwise a plain RECEIPT. All drafts copy
   * the confirmed source's customer snapshot + items + VAT/WHT rates and link
   * together via parentDocumentId.
   */
  private async createDownstreamDrafts(
    tx: Prisma.TransactionClient,
    source: SalesDocument & { items: SalesDocumentItem[] },
    companyId: string,
    userId: string,
  ) {
    const customer = await tx.partner.findFirst({
      where: { id: source.customerId, companyId },
    });
    if (!customer) return;
    const customerHasTaxId = /^\d{13}$/.test(customer.taxId?.trim() ?? '');

    const itemInputs: SalesDocumentItemInput[] = source.items.map((it) => ({
      productId: it.productId ?? undefined,
      productCode: it.productCode ?? undefined,
      description: it.description,
      unit: it.unit,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      discount: Number(it.discount),
      vatable: it.vatable,
    }));
    const totals = computeTotals(
      itemInputs,
      Number(source.vatRate),
      Number(source.whtRate),
    );
    const documentDate = new Date();
    const beYear = getBuddhistYear(documentDate);

    let parentId = source.id;
    let currentType: DocumentType = source.type;

    // Defensive bound — the chain is at most 3 legs (DN → INV → RT|RC).
    for (let i = 0; i < 5; i++) {
      const nextType = this.resolveNextType(currentType, customerHasTaxId);
      if (!nextType) break;

      const existing = await tx.salesDocument.findFirst({
        where: {
          parentDocumentId: parentId,
          type: nextType,
          companyId,
          status: { not: 'VOIDED' },
        },
        select: { id: true },
      });
      if (existing) {
        parentId = existing.id;
        currentType = nextType;
        continue;
      }

      const placeholder = `DRAFT-${randomUUID().slice(0, 8).toUpperCase()}`;
      const child = await tx.salesDocument.create({
        data: {
          companyId,
          type: nextType,
          number: placeholder,
          beYear,
          status: 'DRAFT',
          customerId: customer.id,
          parentDocumentId: parentId,
          documentDate,
          reference: source.number,
          customerSnapshotName: customer.nameTh,
          customerSnapshotAddress: customer.address,
          customerSnapshotTaxId: customer.taxId,
          customerSnapshotBranch: customer.branch,
          subtotal: totals.subtotal,
          vatRate: totals.vatRate,
          vatAmount: totals.vatAmount,
          totalAfterVat: totals.totalAfterVat,
          whtRate: totals.whtRate,
          whtAmount: totals.whtAmount,
          grandTotal: totals.grandTotal,
          netReceived: totals.netReceived,
          createdBy: userId,
          items: {
            create: itemInputs.map((item, idx) => ({
              productId: item.productId ?? null,
              lineNumber: idx + 1,
              productCode: item.productCode ?? null,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              lineTotal: lineTotal(item),
              vatable: item.vatable ?? true,
            })),
          },
        },
        select: { id: true },
      });
      parentId = child.id;
      currentType = nextType;
    }
  }

  /**
   * Mark a confirmed document as ACCOUNTED ("ลงบัญชี"). Used for receipts once
   * the money has cleared the bank. Goes through the lifecycle state machine.
   */
  async account(
    type: DocumentType,
    companyId: string,
    userId: string,
    role: Role,
    id: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const doc = await tx.salesDocument.findFirst({
        where: { id, companyId, type },
      });
      if (!doc) throw new NotFoundException('Document not found');

      validateTransition({ from: doc.status, to: 'ACCOUNTED', role });

      const updated = await tx.salesDocument.update({
        where: { id },
        data: { status: 'ACCOUNTED' },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });

      return this.toDto(updated);
    });
  }

  async void(
    type: DocumentType,
    companyId: string,
    userId: string,
    role: Role,
    id: string,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const doc = await tx.salesDocument.findFirst({
        where: { id, companyId, type },
      });
      if (!doc) throw new NotFoundException('Document not found');

      validateTransition({ from: doc.status, to: 'VOIDED', role, reason });

      const updated = await tx.salesDocument.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: reason,
        },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });

      // Void the revenue journal too so the document drops out of the
      // journal-based P&L. No-op for documents that never posted one.
      await tx.journalEntry.updateMany({
        where: { companyId, sourceType: 'SALES_DOCUMENT', sourceId: id, status: 'POSTED' },
        data: {
          status: 'VOIDED',
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: `void ${updated.number}: ${reason}`,
        },
      });

      return this.toDto(updated);
    });
  }

  async findOne(type: DocumentType, companyId: string, id: string) {
    const doc = await this.prisma.salesDocument.findFirst({
      where: { id, companyId, type },
      include: {
        items: { orderBy: { lineNumber: 'asc' } },
        parentDocument: { select: { id: true, type: true, number: true, status: true } },
        childDocuments: {
          where: { status: { not: 'VOIDED' } },
          select: { id: true, type: true, number: true, status: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');

    // Settlement — payments linked back to this document via
    // (sourceType=SALES_DOCUMENT, sourceId). Voided payments are excluded. The
    // document's receivable (Dr ลูกหนี้) equals grandTotal, so
    // outstanding = grandTotal − Σ(linked payment amount).
    const linkedPayments = await this.prisma.payment.findMany({
      where: {
        companyId,
        sourceType: 'SALES_DOCUMENT',
        sourceId: id,
        status: { not: 'VOIDED' },
      },
      orderBy: { paymentDate: 'asc' },
      select: {
        id: true,
        paymentDate: true,
        amount: true,
        whtAmount: true,
        method: true,
        reference: true,
      },
    });
    const paidAmount = linkedPayments.reduce(
      (sum, p) => sum.plus(p.amount),
      new Prisma.Decimal(0),
    );

    return {
      ...this.toDto(doc),
      settlement: {
        paid: linkedPayments.length > 0,
        paidAmount: paidAmount.toString(),
        outstanding: doc.grandTotal.minus(paidAmount).toString(),
        payments: linkedPayments.map((p) => ({
          id: p.id,
          paymentDate: p.paymentDate.toISOString(),
          amount: p.amount.toString(),
          whtAmount: p.whtAmount.toString(),
          method: p.method,
          reference: p.reference,
        })),
      },
    };
  }

  async list(type: DocumentType, companyId: string, query: ListSalesDocumentsQuery) {
    const where: Prisma.SalesDocumentWhereInput = {
      companyId,
      type,
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            documentDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search } },
              { customerSnapshotName: { contains: query.search } },
              { reference: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesDocument.findMany({
        where,
        include: { items: { orderBy: { lineNumber: 'asc' } } },
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.salesDocument.count({ where }),
    ]);

    return {
      items: items.map((d) => this.toDto(d)),
      total,
    };
  }

  async assertVatEligible(companyId: string, documentDate: string) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { vatEffectiveDate: true },
    });
    if (!company.vatEffectiveDate) {
      throw new UnprocessableEntityException({
        code: 'VAT_NOT_EFFECTIVE',
        message: 'บริษัทยังไม่ได้จดทะเบียน VAT — ออกใบกำกับภาษีไม่ได้',
      });
    }
    const docDate = new Date(documentDate);
    if (docDate < company.vatEffectiveDate) {
      throw new UnprocessableEntityException({
        code: 'VAT_NOT_EFFECTIVE',
        message: `วันที่เอกสารต้องไม่ก่อน ${company.vatEffectiveDate
          .toISOString()
          .slice(0, 10)} (วันที่ VAT มีผล)`,
        vatEffectiveDate: company.vatEffectiveDate.toISOString(),
        documentDate,
      });
    }
  }

  private async validateProducts(companyId: string, items: SalesDocumentItemInput[]) {
    const ids = Array.from(
      new Set(
        items
          .map((i) => i.productId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (ids.length === 0) return;
    const found = await this.prisma.product.findMany({
      where: { id: { in: ids }, companyId, isActive: true },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Some products not found or inactive');
    }
  }

  toDto(
    doc: SalesDocument & {
      items: SalesDocumentItem[];
      parentDocument?: {
        id: string;
        type: DocumentType;
        number: string;
        status: DocumentStatus;
      } | null;
      childDocuments?: Array<{
        id: string;
        type: DocumentType;
        number: string;
        status: DocumentStatus;
      }>;
    },
  ) {
    return {
      id: doc.id,
      type: doc.type,
      number: doc.number,
      beYear: doc.beYear,
      status: doc.status,
      customerId: doc.customerId,
      projectId: doc.projectId,
      parentDocumentId: doc.parentDocumentId,
      parentDocument: doc.parentDocument
        ? {
            id: doc.parentDocument.id,
            type: doc.parentDocument.type,
            number: doc.parentDocument.number,
            status: doc.parentDocument.status,
          }
        : null,
      childDocuments: (doc.childDocuments ?? []).map((c) => ({
        id: c.id,
        type: c.type,
        number: c.number,
        status: c.status,
      })),
      documentDate: doc.documentDate.toISOString(),
      dueDate: doc.dueDate ? doc.dueDate.toISOString() : null,
      reference: doc.reference,
      note: doc.note,
      customer: {
        nameTh: doc.customerSnapshotName,
        address: doc.customerSnapshotAddress,
        taxId: doc.customerSnapshotTaxId,
        branch: doc.customerSnapshotBranch,
      },
      subtotal: doc.subtotal.toString(),
      vatRate: doc.vatRate.toString(),
      vatAmount: doc.vatAmount.toString(),
      totalAfterVat: doc.totalAfterVat.toString(),
      whtRate: doc.whtRate.toString(),
      whtAmount: doc.whtAmount.toString(),
      grandTotal: doc.grandTotal.toString(),
      netReceived: doc.netReceived.toString(),
      items: doc.items.map((item) => ({
        id: item.id,
        lineNumber: item.lineNumber,
        productId: item.productId,
        productCode: item.productCode,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        discount: item.discount.toString(),
        lineTotal: item.lineTotal.toString(),
        vatable: item.vatable,
      })),
      confirmedAt: doc.confirmedAt ? doc.confirmedAt.toISOString() : null,
      confirmedBy: doc.confirmedBy,
      voidedAt: doc.voidedAt ? doc.voidedAt.toISOString() : null,
      voidedBy: doc.voidedBy,
      voidReason: doc.voidReason,
      pdfPath: doc.pdfPath,
      pdfGeneratedAt: doc.pdfGeneratedAt ? doc.pdfGeneratedAt.toISOString() : null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      createdBy: doc.createdBy,
    };
  }
}

