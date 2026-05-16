import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportBankStatementDto, BankStatementLineInput } from './dto/import-statement.dto';
import { ListBankLinesDto } from './dto/list-lines.dto';

const ZERO = new Prisma.Decimal(0);

/**
 * Match window: a payment is considered a candidate for a bank line if its
 * amount matches exactly AND the dates are within this many days. The bank
 * may post a payment one or two business days after the operator records it.
 */
const MATCH_DATE_WINDOW_DAYS = 5;

/**
 * Confidence scoring tiers for auto-matches (AC #5 + PRD §16.4):
 *   1.00 — same day, exact amount
 *   0.90 — within 2 days, exact amount
 *   0.70 — within 5 days, exact amount
 * No match below 0.70 — we'd rather leave the line unmatched than guess.
 */
const CONFIDENCE_SAME_DAY = new Prisma.Decimal('1.0000');
const CONFIDENCE_2DAY = new Prisma.Decimal('0.9000');
const CONFIDENCE_5DAY = new Prisma.Decimal('0.7000');

@Injectable()
export class BankService {
  private readonly logger = new Logger(BankService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Import a batch of statement lines under a single importBatchId so the
   * operator can identify which lines came from which upload. Every line
   * within the batch is then run through auto-match against existing
   * COMPLETED payments. Lines without a confident match stay unmatched
   * for manual handling.
   */
  async importStatement(companyId: string, userId: string, dto: ImportBankStatementDto) {
    const importBatchId = randomUUID();
    const bankAccount = dto.bankAccount.trim();

    if (!bankAccount) {
      throw new BadRequestException('bankAccount is required');
    }

    // Pre-fetch eligible payments for matching. We pull a wide window once
    // (min/max postedAt across the batch ± window) then match in memory —
    // cheaper than N+1 lookups against the DB.
    const dates = dto.lines.map((l) => new Date(l.postedAt));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())) - MATCH_DATE_WINDOW_DAYS * 86400_000);
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())) + MATCH_DATE_WINDOW_DAYS * 86400_000);

    const candidates = await this.prisma.payment.findMany({
      where: {
        companyId,
        status: 'COMPLETED',
        paymentDate: { gte: minDate, lte: maxDate },
        bankMatch: null, // not already matched
      },
      select: {
        id: true,
        direction: true,
        amount: true,
        whtAmount: true,
        paymentDate: true,
      },
    });

    let imported = 0;
    let autoMatched = 0;

    await this.prisma.$transaction(async (tx) => {
      const consumed = new Set<string>();
      for (const line of dto.lines) {
        const postedAt = new Date(line.postedAt);
        const amount = new Prisma.Decimal(line.amount);

        const match = this.findBestMatch(line, postedAt, amount, candidates, consumed);

        const created = await tx.bankStatementLine.create({
          data: {
            companyId,
            bankAccount,
            postedAt,
            side: line.side,
            amount,
            balance: line.balance ? new Prisma.Decimal(line.balance) : null,
            description: line.description,
            reference: line.reference?.trim() || null,
            importBatchId,
            ...(match
              ? {
                  matchedPaymentId: match.paymentId,
                  matchedAt: new Date(),
                  matchConfidence: match.confidence,
                }
              : {}),
          },
        });
        imported++;
        if (match) {
          consumed.add(match.paymentId);
          autoMatched++;
          this.logger.log(
            `Auto-matched bank line ${created.id} → payment ${match.paymentId} (confidence ${match.confidence.toString()})`,
          );
        }
      }
    });

    return {
      importBatchId,
      imported,
      autoMatched,
      unmatched: imported - autoMatched,
    };
  }

  async list(companyId: string, dto: ListBankLinesDto) {
    const where: Prisma.BankStatementLineWhereInput = {
      companyId,
      ...(dto.bankAccount ? { bankAccount: dto.bankAccount } : {}),
      ...(dto.matchStatus === 'matched' ? { matchedPaymentId: { not: null } } : {}),
      ...(dto.matchStatus === 'unmatched' ? { matchedPaymentId: null } : {}),
      ...(dto.dateFrom || dto.dateTo
        ? {
            postedAt: {
              ...(dto.dateFrom ? { gte: new Date(dto.dateFrom) } : {}),
              ...(dto.dateTo ? { lte: new Date(dto.dateTo) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankStatementLine.findMany({
        where,
        include: {
          matchedPayment: {
            include: { partner: { select: { id: true, nameTh: true, taxId: true } } },
          },
        },
        orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }],
        take: dto.take ?? 200,
        skip: dto.skip ?? 0,
      }),
      this.prisma.bankStatementLine.count({ where }),
    ]);
    return { items: items.map((l) => this.toDto(l)), total };
  }

  async findOne(companyId: string, id: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id, companyId },
      include: {
        matchedPayment: {
          include: { partner: { select: { id: true, nameTh: true, taxId: true } } },
        },
      },
    });
    if (!line) throw new NotFoundException('Bank line not found');
    return this.toDto(line);
  }

  async matchLine(companyId: string, _userId: string, id: string, paymentId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id, companyId },
    });
    if (!line) throw new NotFoundException('Bank line not found');
    if (line.matchedPaymentId) {
      throw new ConflictException({
        statusCode: 409,
        code: 'LINE_ALREADY_MATCHED',
        message: `Line already matched to payment ${line.matchedPaymentId}`,
      });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, companyId, status: 'COMPLETED' },
      include: { bankMatch: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found or not COMPLETED');
    }
    if (payment.bankMatch) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PAYMENT_ALREADY_MATCHED',
        message: 'Payment is already matched to another bank line',
      });
    }

    const updated = await this.prisma.bankStatementLine.update({
      where: { id },
      data: {
        matchedPaymentId: paymentId,
        matchedAt: new Date(),
        matchConfidence: new Prisma.Decimal('1.0000'), // manual = absolute confidence
      },
      include: {
        matchedPayment: {
          include: { partner: { select: { id: true, nameTh: true, taxId: true } } },
        },
      },
    });
    return this.toDto(updated);
  }

  async unmatchLine(companyId: string, id: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id, companyId },
    });
    if (!line) throw new NotFoundException('Bank line not found');
    if (!line.matchedPaymentId) {
      throw new ConflictException('Line is not matched');
    }
    const updated = await this.prisma.bankStatementLine.update({
      where: { id },
      data: {
        matchedPaymentId: null,
        matchedAt: null,
        matchConfidence: null,
      },
      include: {
        matchedPayment: {
          include: { partner: { select: { id: true, nameTh: true, taxId: true } } },
        },
      },
    });
    return this.toDto(updated);
  }

  /**
   * For an unmatched line, return candidate payments ranked by closeness of
   * amount + date. Used by the UI when the operator wants to manually pick.
   */
  async candidatesForLine(companyId: string, id: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id, companyId },
    });
    if (!line) throw new NotFoundException('Bank line not found');

    const window = MATCH_DATE_WINDOW_DAYS * 86400_000;
    const candidates = await this.prisma.payment.findMany({
      where: {
        companyId,
        status: 'COMPLETED',
        bankMatch: null,
        paymentDate: {
          gte: new Date(line.postedAt.getTime() - window),
          lte: new Date(line.postedAt.getTime() + window),
        },
      },
      include: { partner: { select: { id: true, nameTh: true, taxId: true } } },
      orderBy: { paymentDate: 'desc' },
      take: 50,
    });

    return candidates.map((p) => ({
      id: p.id,
      direction: p.direction,
      partner: p.partner,
      amount: p.amount.toString(),
      whtAmount: p.whtAmount.toString(),
      paymentDate: p.paymentDate.toISOString(),
      reference: p.reference,
      // Convenience: would this be an exact match for the line?
      amountMatch: p.amount.equals(line.amount),
      daysOff: Math.abs(
        Math.round((p.paymentDate.getTime() - line.postedAt.getTime()) / 86400_000),
      ),
    }));
  }

  // -------------------------------------------------------------------------
  // Internal — match scoring
  // -------------------------------------------------------------------------

  private findBestMatch(
    _line: BankStatementLineInput,
    postedAt: Date,
    amount: Prisma.Decimal,
    candidates: {
      id: string;
      direction: 'IN' | 'OUT';
      amount: Prisma.Decimal;
      whtAmount: Prisma.Decimal;
      paymentDate: Date;
    }[],
    consumed: Set<string>,
  ): { paymentId: string; confidence: Prisma.Decimal } | null {
    let best: { paymentId: string; confidence: Prisma.Decimal; daysOff: number } | null = null;
    for (const p of candidates) {
      if (consumed.has(p.id)) continue;

      // Either gross amount or cash-out (amount − wht) can match the bank line.
      // Bank usually sees the net cash moved.
      const cashAmount = p.amount.minus(p.whtAmount);
      const amountMatches = p.amount.equals(amount) || cashAmount.equals(amount);
      if (!amountMatches) continue;

      const daysOff = Math.abs(
        Math.round((p.paymentDate.getTime() - postedAt.getTime()) / 86400_000),
      );
      if (daysOff > MATCH_DATE_WINDOW_DAYS) continue;

      let confidence: Prisma.Decimal;
      if (daysOff === 0) confidence = CONFIDENCE_SAME_DAY;
      else if (daysOff <= 2) confidence = CONFIDENCE_2DAY;
      else confidence = CONFIDENCE_5DAY;

      // Prefer tighter date proximity when multiple candidates match.
      if (!best || daysOff < best.daysOff) {
        best = { paymentId: p.id, confidence, daysOff };
      }
    }
    if (!best) return null;
    return { paymentId: best.paymentId, confidence: best.confidence };
  }

  private toDto(
    line: Prisma.BankStatementLineGetPayload<{
      include: {
        matchedPayment: {
          include: { partner: { select: { id: true; nameTh: true; taxId: true } } };
        };
      };
    }>,
  ) {
    return {
      ...line,
      postedAt: line.postedAt.toISOString(),
      amount: line.amount.toString(),
      balance: line.balance?.toString() ?? null,
      matchedAt: line.matchedAt?.toISOString() ?? null,
      matchConfidence: line.matchConfidence?.toString() ?? null,
      createdAt: line.createdAt.toISOString(),
      updatedAt: line.updatedAt.toISOString(),
      matchedPayment: line.matchedPayment
        ? {
            ...line.matchedPayment,
            paymentDate: line.matchedPayment.paymentDate.toISOString(),
            amount: line.matchedPayment.amount.toString(),
            whtAmount: line.matchedPayment.whtAmount.toString(),
            voidedAt: line.matchedPayment.voidedAt?.toISOString() ?? null,
            createdAt: line.matchedPayment.createdAt.toISOString(),
            updatedAt: line.matchedPayment.updatedAt.toISOString(),
          }
        : null,
    };
  }
}
