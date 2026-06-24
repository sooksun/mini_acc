import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccountingPeriodStatus, Role } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { RisksService } from '../risks/risks.service';
import { InventoryService } from '../inventory/inventory.service';
import { ClosePeriodDto, ReopenPeriodDto } from './dto/close-period.dto';
import {
  type CheckBlocker,
  criticalRiskBlocker,
  duplicateDocNumberBlocker,
  invoiceReceivedNoReceiptBlocker,
  journalUnbalancedBlocker,
  stockNegativeBlocker,
  unmatchedBankBlocker,
} from './closing-blockers.util';

export type { CheckBlocker };

@Injectable()
export class ClosingService {
  constructor(
    private prisma: PrismaService,
    private risks: RisksService,
    private inventory: InventoryService,
  ) {}

  /**
   * Run all PRD §17.4 hard blocks for a candidate close. Always succeeds;
   * caller inspects `blockers` and `canClose`. Period close is refused when
   * blockers is non-empty.
   */
  async checkPeriod(companyId: string, year: number, month: number) {
    this.validatePeriod(year, month);

    // Refresh risk detection — auto-detectors may have surfaced new findings
    // since last scan.
    await this.risks.scan(companyId);

    const period = await this.prisma.accountingPeriod.findUnique({
      where: { companyId_year_month: { companyId, year, month } },
    });

    const blockers: CheckBlocker[] = [];

    // (a) Journal entries unbalanced in this period
    const unbalancedJournals = await this.prisma.journalEntry.count({
      where: {
        companyId,
        periodYear: year,
        periodMonth: month,
        status: 'POSTED',
        // Decimal compare via raw filter: equal columns won't work easily
        // through findMany; use raw count for accuracy.
      },
    });
    if (unbalancedJournals > 0) {
      // Defensive: count entries where Dr != Cr explicitly using raw SQL
      const raw = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM JournalEntry
        WHERE companyId = ${companyId}
          AND periodYear = ${year}
          AND periodMonth = ${month}
          AND status = 'POSTED'
          AND totalDebit <> totalCredit
      `;
      const n = Number(raw[0]?.count ?? 0);
      const b = journalUnbalancedBlocker(n);
      if (b) blockers.push(b);
    }

    // (b) Critical risks still open
    const criticalOpen = await this.risks.countOpen(companyId, 'CRITICAL');
    const criticalB = criticalRiskBlocker(criticalOpen);
    if (criticalB) blockers.push(criticalB);

    // (c) Sales documents in period that are still DRAFT (numbering unallocated)
    const draftDocs = await this.prisma.salesDocument.count({
      where: {
        companyId,
        status: 'DRAFT',
        documentDate: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lt: new Date(Date.UTC(year, month, 1)),
        },
      },
    });
    if (draftDocs > 0) {
      blockers.push({
        code: 'DRAFT_SALES_DOCS',
        message: `เอกสารขายในงวดนี้ยังเป็นฉบับร่าง ${draftDocs} ใบ — ต้อง confirm หรือ void ก่อนปิดงวด`,
        count: draftDocs,
      });
    }

    // (d) Expense receipts in period still pending review/vendor approval
    const pendingExpenses = await this.prisma.expenseReceipt.count({
      where: {
        companyId,
        status: { in: ['UPLOADED', 'PENDING_VENDOR_APPROVAL', 'READY_TO_ACCOUNT'] },
        OR: [
          {
            documentDate: {
              gte: new Date(Date.UTC(year, month - 1, 1)),
              lt: new Date(Date.UTC(year, month, 1)),
            },
          },
          {
            paidAt: {
              gte: new Date(Date.UTC(year, month - 1, 1)),
              lt: new Date(Date.UTC(year, month, 1)),
            },
          },
        ],
      },
    });
    if (pendingExpenses > 0) {
      blockers.push({
        code: 'PENDING_EXPENSES',
        message: `ใบเสร็จรายจ่ายในงวดนี้ยังไม่ลงบัญชี ${pendingExpenses} ใบ`,
        count: pendingExpenses,
      });
    }

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    // (e) PRD §17.4 — duplicate sales document numbers in the period. The DB
    // unique key already prevents same (type, number), so this is an integrity
    // guard that catches anomalies (e.g. a manual data fix gone wrong).
    const dupNumberGroups = await this.prisma.salesDocument.groupBy({
      by: ['number'],
      where: {
        companyId,
        status: { not: 'VOIDED' },
        number: { not: { startsWith: 'DRAFT-' } },
        documentDate: { gte: periodStart, lt: periodEnd },
      },
      _count: { number: true },
      having: { number: { _count: { gt: 1 } } },
    });
    const dupB = duplicateDocNumberBlocker(dupNumberGroups.length);
    if (dupB) blockers.push(dupB);

    // (f) PRD §17.4 — negative stock. The stock-out guard blocks OUT movements,
    // but ADJUST / opening balances can still drive a product below zero.
    // Company-wide (stock isn't period-scoped).
    const stock = await this.inventory.stockSummary(companyId);
    const negativeStock = stock.filter((s) => Number(s.onHand) < 0);
    const stockB = stockNegativeBlocker(negativeStock.length);
    if (stockB) blockers.push(stockB);

    // (g) PRD §17.4 — unmatched bank statement lines in the period: money moved
    // through the bank with no reconciled payment.
    const unmatchedBank = await this.prisma.bankStatementLine.count({
      where: {
        companyId,
        matchedPaymentId: null,
        postedAt: { gte: periodStart, lt: periodEnd },
      },
    });
    const bankB = unmatchedBankBlocker(unmatchedBank);
    if (bankB) blockers.push(bankB);

    // (h) PRD §17.4 — invoice received (payment linked via Payment.sourceType/
    // sourceId, including /payments CreatePaymentModal) but no receipt issued.
    // Unpaid open receivables without a payment link do NOT block period close.
    const paidInvoiceIds = (
      await this.prisma.payment.findMany({
        where: {
          companyId,
          direction: 'IN',
          status: 'COMPLETED',
          sourceType: 'SALES_DOCUMENT',
          sourceId: { not: null },
        },
        select: { sourceId: true },
      })
    )
      .map((p) => p.sourceId)
      .filter((id): id is string => !!id);

    if (paidInvoiceIds.length > 0) {
      const receivedNoReceipt = await this.prisma.salesDocument.count({
        where: {
          companyId,
          id: { in: paidInvoiceIds },
          type: { in: ['INVOICE', 'TAX_INVOICE'] },
          status: { notIn: ['DRAFT', 'VOIDED'] },
          documentDate: { gte: periodStart, lt: periodEnd },
          childDocuments: {
            none: {
              type: { in: ['RECEIPT', 'RECEIPT_TAX_INVOICE'] },
              status: { notIn: ['DRAFT', 'VOIDED'] },
            },
          },
        },
      });
      const invB = invoiceReceivedNoReceiptBlocker(receivedNoReceipt);
      if (invB) blockers.push(invB);
    }

    // Period summary numbers
    const [salesSum, expenseSum, journalCount] = await this.prisma.$transaction([
      this.prisma.salesDocument.aggregate({
        where: {
          companyId,
          status: { in: ['USER_CONFIRMED', 'ACCOUNTED', 'PENDING_ACCOUNTANT', 'ACCOUNTANT_APPROVED', 'LOCKED'] },
          documentDate: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      this.prisma.expenseRecord.aggregate({
        where: {
          companyId,
          status: 'RECORDED',
          expenseDate: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      this.prisma.journalEntry.count({
        where: {
          companyId,
          periodYear: year,
          periodMonth: month,
          status: 'POSTED',
        },
      }),
    ]);

    return {
      period: { year, month },
      status: (period?.status ?? 'OPEN') as AccountingPeriodStatus,
      canClose: blockers.length === 0,
      blockers,
      summary: {
        salesCount: salesSum._count._all,
        salesTotal: (salesSum._sum.grandTotal ?? new Prisma.Decimal(0)).toString(),
        expenseCount: expenseSum._count._all,
        expenseTotal: (expenseSum._sum.grandTotal ?? new Prisma.Decimal(0)).toString(),
        journalEntries: journalCount,
        criticalRisks: criticalOpen,
      },
      closedAt: period?.closedAt?.toISOString() ?? null,
      closedBy: period?.closedBy ?? null,
      lockedAt: period?.lockedAt?.toISOString() ?? null,
      lockedBy: period?.lockedBy ?? null,
    };
  }

  async closePeriod(companyId: string, userId: string, role: Role, dto: ClosePeriodDto) {
    if (role !== 'OWNER' && role !== 'ACCOUNTANT') {
      throw new BadRequestException({
        statusCode: 403,
        code: 'ROLE_NOT_ALLOWED',
        message: 'เฉพาะ OWNER / ACCOUNTANT เท่านั้นที่ปิดงวดได้',
      });
    }

    const checkResult = await this.checkPeriod(companyId, dto.year, dto.month);
    if (!checkResult.canClose) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'PERIOD_HAS_BLOCKERS',
        message: 'ไม่สามารถปิดงวดได้ — มีรายการต้องแก้ก่อน',
        blockers: checkResult.blockers,
      });
    }

    const now = new Date();
    const periodStart = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const periodEnd = new Date(Date.UTC(dto.year, dto.month, 1));

    const period = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.accountingPeriod.upsert({
        where: { companyId_year_month: { companyId, year: dto.year, month: dto.month } },
        create: {
          companyId,
          year: dto.year,
          month: dto.month,
          status: 'LOCKED',
          closedAt: now,
          closedBy: userId,
          lockedAt: now,
          lockedBy: userId,
          note: dto.note?.trim() || null,
        },
        update: {
          status: 'LOCKED',
          closedAt: now,
          closedBy: userId,
          lockedAt: now,
          lockedBy: userId,
          note: dto.note?.trim() ?? undefined,
        },
      });

      // PRD §15.4 / §8 — closing locks the documents in the period so they
      // become immutable (corrections must go through void + adjustment). This
      // is a period-authority bulk lock, broader than the per-document
      // ACCOUNTANT_APPROVED→LOCKED transition; DRAFT (blocked above) and VOIDED
      // are left untouched.
      await tx.salesDocument.updateMany({
        where: {
          companyId,
          status: {
            in: ['USER_CONFIRMED', 'ACCOUNTED', 'PENDING_ACCOUNTANT', 'ACCOUNTANT_APPROVED'],
          },
          documentDate: { gte: periodStart, lt: periodEnd },
        },
        data: { status: 'LOCKED', lockedAt: now, lockedBy: userId },
      });

      return upserted;
    });

    return this.toDto(period);
  }

  async reopenPeriod(companyId: string, userId: string, role: Role, dto: ReopenPeriodDto) {
    if (role !== 'OWNER') {
      throw new BadRequestException({
        statusCode: 403,
        code: 'ROLE_NOT_ALLOWED',
        message: 'เฉพาะ OWNER เท่านั้นที่เปิดงวดที่ปิดแล้วได้',
      });
    }
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { companyId_year_month: { companyId, year: dto.year, month: dto.month } },
    });
    if (!period) throw new NotFoundException('Period not found');
    if (period.status === 'OPEN' || period.status === 'REOPENED') {
      throw new ConflictException('Period is already open');
    }
    const updated = await this.prisma.accountingPeriod.update({
      where: { id: period.id },
      data: {
        status: 'REOPENED',
        note: dto.reason.trim(),
      },
    });
    return this.toDto(updated);
  }

  async listPeriods(companyId: string) {
    const periods = await this.prisma.accountingPeriod.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return periods.map((p) => this.toDto(p));
  }

  private validatePeriod(year: number, month: number) {
    if (year < 2000 || year > 2200) {
      throw new BadRequestException(`Invalid year ${year}`);
    }
    if (month < 1 || month > 12) {
      throw new BadRequestException(`Invalid month ${month}`);
    }
  }

  private toDto(p: {
    id: string;
    year: number;
    month: number;
    status: AccountingPeriodStatus;
    closedAt: Date | null;
    closedBy: string | null;
    lockedAt: Date | null;
    lockedBy: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...p,
      closedAt: p.closedAt?.toISOString() ?? null,
      lockedAt: p.lockedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
