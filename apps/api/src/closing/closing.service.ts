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
import { ClosePeriodDto, ReopenPeriodDto } from './dto/close-period.dto';

export interface CheckBlocker {
  code: string;
  message: string;
  count?: number;
}

@Injectable()
export class ClosingService {
  constructor(
    private prisma: PrismaService,
    private risks: RisksService,
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
      if (n > 0) {
        blockers.push({
          code: 'JOURNAL_UNBALANCED',
          message: `Journal ${n} รายการในงวดยังไม่สมดุล`,
          count: n,
        });
      }
    }

    // (b) Critical risks still open
    const criticalOpen = await this.risks.countOpen(companyId, 'CRITICAL');
    if (criticalOpen > 0) {
      blockers.push({
        code: 'CRITICAL_RISK_OPEN',
        message: `มีความเสี่ยงระดับ CRITICAL ${criticalOpen} รายการที่ยังไม่จัดการ`,
        count: criticalOpen,
      });
    }

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

    const period = await this.prisma.accountingPeriod.upsert({
      where: { companyId_year_month: { companyId, year: dto.year, month: dto.month } },
      create: {
        companyId,
        year: dto.year,
        month: dto.month,
        status: 'LOCKED',
        closedAt: new Date(),
        closedBy: userId,
        lockedAt: new Date(),
        lockedBy: userId,
        note: dto.note?.trim() || null,
      },
      update: {
        status: 'LOCKED',
        closedAt: new Date(),
        closedBy: userId,
        lockedAt: new Date(),
        lockedBy: userId,
        note: dto.note?.trim() ?? undefined,
      },
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
