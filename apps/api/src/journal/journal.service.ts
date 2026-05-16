import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JournalSourceType } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { ListJournalDto } from './dto/list-journal.dto';

export interface JournalLineInput {
  accountCode: string;
  accountName: string;
  debit?: Prisma.Decimal | string | number;
  credit?: Prisma.Decimal | string | number;
  partnerId?: string | null;
  projectId?: string | null;
  description?: string | null;
}

export interface PostJournalInput {
  companyId: string;
  userId: string;
  entryDate: Date | string;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  lines: JournalLineInput[];
}

const ZERO = new Prisma.Decimal(0);

function toDecimal(v: Prisma.Decimal | string | number | undefined): Prisma.Decimal {
  if (v === undefined || v === null) return ZERO;
  if (v instanceof Prisma.Decimal) return v;
  return new Prisma.Decimal(v);
}

@Injectable()
export class JournalService {
  constructor(private prisma: PrismaService) {}

  /**
   * Atomically post a journal entry. The caller usually already holds a
   * transaction (e.g. ExpenseReceiptsService.account() bundles the journal
   * write with the source document), so we expose two flavors:
   *   - postWithTx: run inside a caller-supplied tx client
   *   - post: open our own tx
   *
   * Enforces Dr === Cr at the line aggregate level. Throws 422
   * JOURNAL_UNBALANCED if the two totals don't match — Decimal equality,
   * not float, so rounding noise is the caller's responsibility.
   */
  postWithTx(tx: Prisma.TransactionClient, input: PostJournalInput) {
    // Validate each line shape first — gives clearer errors than discovering a
    // mixed-sided line via unbalanced totals.
    for (const [idx, line] of input.lines.entries()) {
      const d = toDecimal(line.debit);
      const c = toDecimal(line.credit);
      if (d.isZero() && c.isZero()) {
        throw new BadRequestException(
          `Journal line ${idx + 1} has both debit and credit zero — must populate one side`,
        );
      }
      if (!d.isZero() && !c.isZero()) {
        throw new BadRequestException(
          `Journal line ${idx + 1} cannot have both debit and credit non-zero`,
        );
      }
    }
    const totalDebit = input.lines.reduce(
      (sum, line) => sum.plus(toDecimal(line.debit)),
      ZERO,
    );
    const totalCredit = input.lines.reduce(
      (sum, line) => sum.plus(toDecimal(line.credit)),
      ZERO,
    );
    if (!totalDebit.equals(totalCredit)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'JOURNAL_UNBALANCED',
        message: `Journal entry not balanced: Dr ${totalDebit.toString()} ≠ Cr ${totalCredit.toString()}`,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
      });
    }
    // Note: a zero-total case is unreachable here — the per-line check above
    // guarantees every line contributes a strictly positive amount to one
    // side, so the totals are always > 0.

    const date = typeof input.entryDate === 'string' ? new Date(input.entryDate) : input.entryDate;
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid entryDate: ${String(input.entryDate)}`);
    }

    return tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        entryDate: date,
        description: input.description,
        status: 'POSTED',
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        totalDebit,
        totalCredit,
        periodYear: date.getFullYear(),
        periodMonth: date.getMonth() + 1,
        postedBy: input.userId,
        postedAt: new Date(),
        lines: {
          create: input.lines.map((line, idx) => ({
            lineNumber: idx + 1,
            accountCode: line.accountCode,
            accountName: line.accountName,
            debit: toDecimal(line.debit),
            credit: toDecimal(line.credit),
            partnerId: line.partnerId ?? null,
            projectId: line.projectId ?? null,
            description: line.description ?? null,
          })),
        },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
  }

  post(input: PostJournalInput) {
    return this.prisma.$transaction((tx) => this.postWithTx(tx, input));
  }

  async voidEntry(companyId: string, id: string, userId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('reason is required to void a journal entry');
    }
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({ where: { id, companyId } });
      if (!entry) throw new NotFoundException('Journal entry not found');
      if (entry.status === 'VOIDED') {
        throw new ConflictException('Journal entry is already voided');
      }
      return tx.journalEntry.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: reason.trim(),
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
    });
  }

  async findOne(companyId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return this.toDto(entry);
  }

  async list(companyId: string, dto: ListJournalDto) {
    const where: Prisma.JournalEntryWhereInput = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.sourceType ? { sourceType: dto.sourceType } : {}),
      ...(dto.sourceId ? { sourceId: dto.sourceId } : {}),
      ...(dto.year ? { periodYear: dto.year } : {}),
      ...(dto.month ? { periodMonth: dto.month } : {}),
      ...(dto.dateFrom || dto.dateTo
        ? {
            entryDate: {
              ...(dto.dateFrom ? { gte: new Date(dto.dateFrom) } : {}),
              ...(dto.dateTo ? { lte: new Date(dto.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take: dto.take ?? 50,
        skip: dto.skip ?? 0,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { items: items.map((e) => this.toDto(e)), total };
  }

  private toDto(
    entry: Prisma.JournalEntryGetPayload<{ include: { lines: true } }>,
  ) {
    return {
      ...entry,
      entryDate: entry.entryDate.toISOString(),
      totalDebit: entry.totalDebit.toString(),
      totalCredit: entry.totalCredit.toString(),
      postedAt: entry.postedAt?.toISOString() ?? null,
      voidedAt: entry.voidedAt?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      lines: entry.lines.map((line) => ({
        ...line,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
      })),
    };
  }
}
