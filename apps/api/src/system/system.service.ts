import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesDocumentService } from '../sales/_shared/sales-document.service';

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesDoc: SalesDocumentService,
  ) {}

  /**
   * Backfill revenue journals for sales documents confirmed before the ledger
   * wiring existed. Safe to run repeatedly — see
   * SalesDocumentService.backfillRevenueJournals.
   */
  async backfillSalesJournals(companyId: string, userId: string) {
    const result = await this.salesDoc.backfillRevenueJournals(companyId, userId);
    await this.prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action: 'BACKFILL_SALES_JOURNALS',
        reason: 'ลงบัญชีย้อนหลังให้เอกสารขายที่ยืนยันก่อนระบบต่อ Journal',
        metadata: result as never,
      },
    });
    return { success: true, ...result };
  }

  async resetBaseline(companyId: string, userId: string) {
    // Capture counts before delete for audit summary
    const [salesDocs, expenseReceipts, payments, journalEntries, inventoryMovements] =
      await Promise.all([
        this.prisma.salesDocument.count({ where: { companyId } }),
        this.prisma.expenseReceipt.count({ where: { companyId } }),
        this.prisma.payment.count({ where: { companyId } }),
        this.prisma.journalEntry.count({ where: { companyId } }),
        this.prisma.inventoryMovement.count({ where: { companyId } }),
      ]);

    const deletedCounts = {
      salesDocuments: salesDocs,
      expenseReceipts,
      payments,
      journalEntries,
      inventoryMovements,
    };

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Collect IDs needed for child-only tables
        const salesDocIds = await tx.salesDocument
          .findMany({ where: { companyId }, select: { id: true } })
          .then((rows) => rows.map((r) => r.id));

        const journalIds = await tx.journalEntry
          .findMany({ where: { companyId }, select: { id: true } })
          .then((rows) => rows.map((r) => r.id));

        // 2. Delete leaf children (no direct companyId)
        if (salesDocIds.length) {
          await tx.salesDocumentItem.deleteMany({
            where: { salesDocumentId: { in: salesDocIds } },
          });
        }
        if (journalIds.length) {
          await tx.journalEntryLine.deleteMany({
            where: { journalEntryId: { in: journalIds } },
          });
        }

        // 3. WHT & bank lines before Payment (FK: SetNull)
        await tx.withholdingTaxRecord.deleteMany({ where: { companyId } });
        await tx.bankStatementLine.deleteMany({ where: { companyId } });

        // 4. Transactional data in FK-safe order
        await tx.journalEntry.deleteMany({ where: { companyId } });
        await tx.inventoryMovement.deleteMany({ where: { companyId } });
        await tx.vatRecord.deleteMany({ where: { companyId } });
        await tx.riskItem.deleteMany({ where: { companyId } });
        await tx.aiSuggestion.deleteMany({ where: { companyId } });
        await tx.accountingPeriod.deleteMany({ where: { companyId } });
        await tx.payment.deleteMany({ where: { companyId } });
        await tx.generatedPdf.deleteMany({ where: { companyId } });
        await tx.attachment.deleteMany({ where: { companyId } });

        // 5. Expense: record (child) before receipt (parent, onDelete:Restrict)
        //    FixedAsset.expenseRecordId becomes NULL via SetNull cascade
        await tx.expenseRecord.deleteMany({ where: { companyId } });
        await tx.fixedAsset.deleteMany({ where: { companyId } });
        await tx.expenseReceipt.deleteMany({ where: { companyId } });

        // 6. SalesDocument — clear self-reference before bulk delete
        await tx.$executeRaw`UPDATE SalesDocument SET parentDocumentId = NULL WHERE companyId = ${companyId}`;
        await tx.salesDocument.deleteMany({ where: { companyId } });

        // 7. Reset numbering counters and audit history
        await tx.documentNumberingCounter.deleteMany({ where: { companyId } });
        await tx.auditLog.deleteMany({ where: { companyId } });
      },
      { timeout: 60_000 },
    );

    // Write the reset record AFTER the main transaction (audit log was cleared above)
    await this.prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action: 'RESET_BASELINE',
        reason: 'ล้างข้อมูลทดสอบก่อนเริ่มใช้งานจริง',
        metadata: deletedCounts as never,
      },
    });

    return { success: true, deletedCounts };
  }
}
