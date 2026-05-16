import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Role } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { JournalService } from '../journal/journal.service';
import { ACCOUNTS } from '../journal/accounts';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private journal: JournalService,
  ) {}

  async create(companyId: string, userId: string, dto: CreatePaymentDto) {
    const amount = new Prisma.Decimal(dto.amount);
    const whtAmount = dto.whtAmount ? new Prisma.Decimal(dto.whtAmount) : ZERO;

    if (amount.lte(0)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'AMOUNT_REQUIRED',
        message: 'amount ต้องมากกว่า 0',
      });
    }
    if (whtAmount.lt(0)) {
      throw new BadRequestException('whtAmount must be ≥ 0');
    }
    if (whtAmount.gte(amount)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'WHT_EXCEEDS_AMOUNT',
        message: 'whtAmount ต้องน้อยกว่ายอดรวม (เงินหักภาษี ณ ที่จ่ายเกินยอด)',
      });
    }

    const partner = await this.prisma.partner.findFirst({
      where: { id: dto.partnerId, companyId, isActive: true },
      select: { id: true, nameTh: true, taxId: true },
    });
    if (!partner) {
      throw new NotFoundException('Partner not found or inactive');
    }

    const paymentDate = new Date(dto.paymentDate);
    const periodYear = paymentDate.getFullYear();
    const periodMonth = paymentDate.getMonth() + 1;

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          companyId,
          direction: dto.direction,
          partnerId: dto.partnerId,
          paymentDate,
          amount,
          whtAmount,
          method: dto.method ?? 'CASH',
          reference: dto.reference?.trim() || null,
          bankAccount: dto.bankAccount?.trim() || null,
          note: dto.note?.trim() || null,
          status: 'COMPLETED',
          sourceType: dto.sourceType?.trim() || null,
          sourceId: dto.sourceId?.trim() || null,
          recordedBy: userId,
        },
      });

      // Auto-create the WHT record when amount > 0. recordType depends on
      // direction: paying a vendor (OUT) → we owe Revenue Dept (PAYABLE);
      // receiving from a customer (IN) → customer withheld and will issue us
      // a 50 ทวิ to claim back (RECEIVABLE).
      if (whtAmount.gt(0)) {
        await tx.withholdingTaxRecord.create({
          data: {
            companyId,
            recordType: dto.direction === 'OUT' ? 'PAYABLE' : 'RECEIVABLE',
            paymentId: payment.id,
            sourceType: dto.sourceType?.trim() || 'PAYMENT',
            sourceId: dto.sourceId?.trim() || payment.id,
            paidAt: paymentDate,
            partnerName: partner.nameTh,
            partnerTaxId: partner.taxId,
            baseAmount: amount,
            rate: amount.isZero()
              ? ZERO
              : whtAmount.div(amount).mul(100).toDecimalPlaces(2),
            whtAmount,
            certNumber: dto.whtCertNumber?.trim() || null,
            category: dto.whtCategory?.trim() || null,
            periodYear,
            periodMonth,
          },
        });
      }

      // Post journal in same tx so failure rolls back everything together.
      // OUT: paying vendor — Dr AP/Expense, Cr Cash, Cr WHT Payable (if any)
      // IN:  receiving from customer — Dr Cash, Dr WHT Receivable, Cr AR/Revenue
      const cashOut = amount.minus(whtAmount);
      const lines: Parameters<typeof this.journal.postWithTx>[1]['lines'] =
        dto.direction === 'OUT'
          ? [
              {
                accountCode: ACCOUNTS.AP.code,
                accountName: ACCOUNTS.AP.name,
                debit: amount,
                partnerId: partner.id,
                description: dto.reference ?? undefined,
              },
              {
                accountCode: ACCOUNTS.CASH.code,
                accountName: ACCOUNTS.CASH.name,
                credit: cashOut,
                partnerId: partner.id,
              },
              ...(whtAmount.gt(0)
                ? [
                    {
                      accountCode: ACCOUNTS.WHT_PAYABLE.code,
                      accountName: ACCOUNTS.WHT_PAYABLE.name,
                      credit: whtAmount,
                    },
                  ]
                : []),
            ]
          : [
              {
                accountCode: ACCOUNTS.CASH.code,
                accountName: ACCOUNTS.CASH.name,
                debit: cashOut,
                partnerId: partner.id,
              },
              ...(whtAmount.gt(0)
                ? [
                    {
                      accountCode: ACCOUNTS.WHT_RECEIVABLE.code,
                      accountName: ACCOUNTS.WHT_RECEIVABLE.name,
                      debit: whtAmount,
                    },
                  ]
                : []),
              {
                accountCode: ACCOUNTS.AR.code,
                accountName: ACCOUNTS.AR.name,
                credit: amount,
                partnerId: partner.id,
                description: dto.reference ?? undefined,
              },
            ];

      await this.journal.postWithTx(tx, {
        companyId,
        userId,
        entryDate: paymentDate,
        description:
          dto.direction === 'OUT'
            ? `จ่ายเงิน ${partner.nameTh}${dto.reference ? ' — ' + dto.reference : ''}`
            : `รับเงิน ${partner.nameTh}${dto.reference ? ' — ' + dto.reference : ''}`,
        sourceType: 'PAYMENT',
        sourceId: payment.id,
        lines,
      });

      return this.toDtoEntity(await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: this.include(),
      }));
    });
  }

  async list(companyId: string, dto: ListPaymentsDto) {
    const where: Prisma.PaymentWhereInput = {
      companyId,
      ...(dto.direction ? { direction: dto.direction } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.partnerId ? { partnerId: dto.partnerId } : {}),
      ...(dto.dateFrom || dto.dateTo
        ? {
            paymentDate: {
              ...(dto.dateFrom ? { gte: new Date(dto.dateFrom) } : {}),
              ...(dto.dateTo ? { lte: new Date(dto.dateTo) } : {}),
            },
          }
        : {}),
      ...(dto.search
        ? {
            OR: [
              { reference: { contains: dto.search } },
              { note: { contains: dto.search } },
              { partner: { nameTh: { contains: dto.search } } },
              { partner: { taxId: { contains: dto.search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: this.include(),
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        take: dto.take ?? 50,
        skip: dto.skip ?? 0,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items: items.map((p) => this.toDtoEntity(p)), total };
  }

  async findOne(companyId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, companyId },
      include: this.include(),
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.toDtoEntity(payment);
  }

  async voidPayment(
    companyId: string,
    userId: string,
    role: Role,
    id: string,
    dto: VoidPaymentDto,
  ) {
    if (role !== 'OWNER' && role !== 'ACCOUNTANT') {
      throw new BadRequestException({
        statusCode: 403,
        code: 'ROLE_NOT_ALLOWED',
        message: 'เฉพาะ OWNER / ACCOUNTANT เท่านั้นที่ void payment ได้',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id, companyId } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === 'VOIDED') {
        throw new ConflictException('Payment is already voided');
      }
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: dto.reason.trim(),
        },
        include: this.include(),
      });

      // Void the related journal entry too — keeps Dr=Cr invariant honest for
      // reports (voided journal is excluded from period totals).
      await tx.journalEntry.updateMany({
        where: {
          companyId,
          sourceType: 'PAYMENT',
          sourceId: id,
          status: 'POSTED',
        },
        data: {
          status: 'VOIDED',
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: `void payment: ${dto.reason.trim()}`,
        },
      });

      return this.toDtoEntity(updated);
    });
  }

  private include() {
    return {
      partner: {
        select: { id: true, nameTh: true, taxId: true, branch: true, type: true },
      },
      whtRecord: true,
    } satisfies Prisma.PaymentInclude;
  }

  private toDtoEntity(
    payment: Prisma.PaymentGetPayload<{ include: ReturnType<PaymentsService['include']> }>,
  ) {
    return {
      ...payment,
      amount: payment.amount.toString(),
      whtAmount: payment.whtAmount.toString(),
      paymentDate: payment.paymentDate.toISOString(),
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      whtRecord: payment.whtRecord
        ? {
            ...payment.whtRecord,
            baseAmount: payment.whtRecord.baseAmount.toString(),
            rate: payment.whtRecord.rate.toString(),
            whtAmount: payment.whtRecord.whtAmount.toString(),
            paidAt: payment.whtRecord.paidAt.toISOString(),
            createdAt: payment.whtRecord.createdAt.toISOString(),
          }
        : null,
    };
  }
}
