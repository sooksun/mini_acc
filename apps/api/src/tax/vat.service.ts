import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { VatRecordType } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordVatInput {
  companyId: string;
  recordType: VatRecordType;
  sourceType: string;
  sourceId: string;
  documentDate: Date;
  documentNumber: string | null;
  partnerName: string;
  partnerTaxId: string | null;
  baseAmount: Prisma.Decimal | string | number;
  vatRate: Prisma.Decimal | string | number;
  vatAmount: Prisma.Decimal | string | number;
}

@Injectable()
export class VatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create an immutable VatRecord snapshot for a source document.
   *
   * Called from inside the source document's transaction so the record is
   * atomic with the document itself. The (companyId, sourceType, sourceId)
   * unique index makes re-calling on the same source idempotent-with-conflict
   * — confirm()/account() each fire once per doc lifecycle, so a duplicate
   * implies a code bug, not user error.
   */
  recordWithTx(tx: Prisma.TransactionClient, input: RecordVatInput) {
    return tx.vatRecord.create({
      data: {
        companyId: input.companyId,
        recordType: input.recordType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        documentDate: input.documentDate,
        documentNumber: input.documentNumber,
        partnerName: input.partnerName,
        partnerTaxId: input.partnerTaxId,
        baseAmount: new Prisma.Decimal(input.baseAmount.toString()),
        vatRate: new Prisma.Decimal(input.vatRate.toString()),
        vatAmount: new Prisma.Decimal(input.vatAmount.toString()),
        periodYear: input.documentDate.getFullYear(),
        periodMonth: input.documentDate.getMonth() + 1,
      },
    });
  }

  record(input: RecordVatInput) {
    return this.prisma.$transaction((tx) => this.recordWithTx(tx, input));
  }
}
