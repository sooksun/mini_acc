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

  /**
   * Parse an uploaded CSV bank statement and import it through the same
   * pipeline as the JSON import (so auto-match runs identically). Accepts a
   * header row with flexible Thai/English column names — each row needs a date,
   * a description, and either a `side`+`amount` pair or separate debit/credit
   * (ถอน/ฝาก) columns. Buddhist years (>2400) are converted to Gregorian.
   */
  async importCsv(companyId: string, userId: string, bankAccount: string, fileBuffer: Buffer) {
    if (!bankAccount?.trim()) {
      throw new BadRequestException('bankAccount is required');
    }
    const lines = this.parseCsvToLines(fileBuffer);
    if (lines.length === 0) {
      throw new BadRequestException({
        code: 'NO_ROWS',
        message: 'ไม่พบรายการในไฟล์ CSV — ตรวจสอบหัวคอลัมน์และข้อมูล',
      });
    }
    return this.importStatement(companyId, userId, { bankAccount: bankAccount.trim(), lines });
  }

  private parseCsvToLines(buffer: Buffer): BankStatementLineInput[] {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const rows = parseCsvText(text);
    if (rows.length < 2) return [];

    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const col = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));

    const iDate = col(['date', 'postedat', 'posted_at', 'วันที่', 'วันที่ทำรายการ', 'transaction date']);
    const iSide = col(['side', 'ประเภท']);
    const iAmount = col(['amount', 'จำนวนเงิน', 'จำนวน']);
    const iDebit = col(['debit', 'withdrawal', 'ถอน', 'เดบิต', 'เงินออก']);
    const iCredit = col(['credit', 'deposit', 'ฝาก', 'เครดิต', 'เงินเข้า']);
    const iBalance = col(['balance', 'คงเหลือ', 'ยอดคงเหลือ']);
    const iDesc = col(['description', 'รายละเอียด', 'รายการ', 'detail', 'memo']);
    const iRef = col(['reference', 'ref', 'อ้างอิง', 'เลขที่อ้างอิง']);

    if (iDate < 0 || iDesc < 0) {
      throw new BadRequestException({
        code: 'BAD_HEADER',
        message: 'CSV ต้องมีคอลัมน์วันที่ (date) และรายละเอียด (description)',
      });
    }
    const hasSideAmount = iSide >= 0 && iAmount >= 0;
    const hasDebitCredit = iDebit >= 0 || iCredit >= 0;
    if (!hasSideAmount && !hasDebitCredit) {
      throw new BadRequestException({
        code: 'BAD_HEADER',
        message: 'CSV ต้องมี side+amount หรือคอลัมน์ debit/credit (ถอน/ฝาก)',
      });
    }

    const out: BankStatementLineInput[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]!;
      const cell = (i: number) => (i >= 0 && i < row.length ? (row[i] ?? '').trim() : '');
      const rawDate = cell(iDate);
      const desc = cell(iDesc);
      if (!rawDate && !desc) continue;

      const postedAt = normalizeStatementDate(rawDate);
      if (!postedAt) {
        throw new BadRequestException({
          code: 'BAD_ROW',
          message: `แถว ${r + 1}: วันที่ "${rawDate}" ไม่ถูกต้อง (ใช้ YYYY-MM-DD หรือ DD/MM/YYYY)`,
        });
      }

      let side: 'DEBIT' | 'CREDIT';
      let amount: string;
      if (hasSideAmount && cell(iSide)) {
        const s = cell(iSide).toUpperCase();
        side = s.startsWith('D') || s.includes('ถอน') || s.includes('ออก') ? 'DEBIT' : 'CREDIT';
        amount = cell(iAmount).replace(/,/g, '');
      } else {
        const debit = cell(iDebit).replace(/,/g, '');
        const credit = cell(iCredit).replace(/,/g, '');
        if (Number(debit || '0') > 0) {
          side = 'DEBIT';
          amount = debit;
        } else if (Number(credit || '0') > 0) {
          side = 'CREDIT';
          amount = credit;
        } else {
          continue; // zero-value row
        }
      }
      amount = amount.replace(/^-/, '');
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
        throw new BadRequestException({
          code: 'BAD_ROW',
          message: `แถว ${r + 1}: จำนวนเงิน "${amount}" ไม่ถูกต้อง`,
        });
      }
      const balanceRaw = iBalance >= 0 ? cell(iBalance).replace(/,/g, '') : '';
      out.push({
        postedAt,
        side,
        amount,
        balance: balanceRaw && /^-?\d+(\.\d{1,2})?$/.test(balanceRaw) ? balanceRaw : undefined,
        description: desc || '(ไม่มีรายละเอียด)',
        reference: iRef >= 0 ? cell(iRef) || undefined : undefined,
      });
    }
    return out;
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

/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes
 * ("" inside quotes), commas inside quotes, and CRLF/LF line endings. Returns
 * rows of string cells, dropping fully blank rows.
 */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Accept YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY. Buddhist years
 *  (>2400) are converted to Gregorian. Returns ISO YYYY-MM-DD or null. */
function normalizeStatementDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return isoDate(adjustYear(Number(m[1])), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return isoDate(adjustYear(Number(m[3])), Number(m[2]), Number(m[1]));
  return null;
}

function adjustYear(y: number): number {
  return y > 2400 ? y - 543 : y;
}

function isoDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
