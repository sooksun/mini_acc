import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, SalesDocument, SalesDocumentItem } from '@prisma/client';
import type { DocumentType, Role } from '@hj/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { getBuddhistYear } from '../../numbering/be-year';
import { validateTransition } from '../../lifecycle/validate-transition';
import { VatService } from '../../tax/vat.service';
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
  ) {}

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
        projectId: null,
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

      return this.toDto(updated);
    });
  }

  async findOne(type: DocumentType, companyId: string, id: string) {
    const doc = await this.prisma.salesDocument.findFirst({
      where: { id, companyId, type },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return this.toDto(doc);
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

  toDto(doc: SalesDocument & { items: SalesDocumentItem[] }) {
    return {
      id: doc.id,
      type: doc.type,
      number: doc.number,
      beYear: doc.beYear,
      status: doc.status,
      customerId: doc.customerId,
      projectId: doc.projectId,
      parentDocumentId: doc.parentDocumentId,
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

