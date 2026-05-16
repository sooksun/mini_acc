import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PeriodFilterDto } from './dto/period-filter.dto';

@Injectable()
export class TaxService {
  constructor(private prisma: PrismaService) {}

  /**
   * High-level dashboard numbers for the period (defaults to current month
   * if neither year nor month given). The frontend uses these for the StatCard
   * row at the top of /tax.
   */
  async dashboard(companyId: string, filter: PeriodFilterDto) {
    const { year, month } = this.resolvePeriod(filter);
    const vatScope: Prisma.VatRecordWhereInput = {
      companyId,
      periodYear: year,
      ...(month ? { periodMonth: month } : {}),
    };
    const whtScope: Prisma.WithholdingTaxRecordWhereInput = {
      companyId,
      periodYear: year,
      ...(month ? { periodMonth: month } : {}),
    };

    const [outputAgg, inputAgg, payableAgg, receivableAgg, outCount, inCount] =
      await this.prisma.$transaction([
        this.prisma.vatRecord.aggregate({
          where: { ...vatScope, recordType: 'OUTPUT' },
          _sum: { baseAmount: true, vatAmount: true },
          _count: { _all: true },
        }),
        this.prisma.vatRecord.aggregate({
          where: { ...vatScope, recordType: 'INPUT' },
          _sum: { baseAmount: true, vatAmount: true },
          _count: { _all: true },
        }),
        this.prisma.withholdingTaxRecord.aggregate({
          where: { ...whtScope, recordType: 'PAYABLE' },
          _sum: { whtAmount: true, baseAmount: true },
          _count: { _all: true },
        }),
        this.prisma.withholdingTaxRecord.aggregate({
          where: { ...whtScope, recordType: 'RECEIVABLE' },
          _sum: { whtAmount: true, baseAmount: true },
          _count: { _all: true },
        }),
        this.prisma.vatRecord.count({ where: { ...vatScope, recordType: 'OUTPUT' } }),
        this.prisma.vatRecord.count({ where: { ...vatScope, recordType: 'INPUT' } }),
      ]);

    const outputVat = outputAgg._sum.vatAmount ?? new Prisma.Decimal(0);
    const inputVat = inputAgg._sum.vatAmount ?? new Prisma.Decimal(0);
    const vatNet = outputVat.minus(inputVat);

    return {
      period: { year, month: month ?? null },
      vat: {
        output: {
          base: (outputAgg._sum.baseAmount ?? new Prisma.Decimal(0)).toString(),
          vat: outputVat.toString(),
          count: outCount,
        },
        input: {
          base: (inputAgg._sum.baseAmount ?? new Prisma.Decimal(0)).toString(),
          vat: inputVat.toString(),
          count: inCount,
        },
        net: vatNet.toString(),
        netLabel: vatNet.gt(0) ? 'ภาษีที่ต้องชำระ' : vatNet.lt(0) ? 'ภาษีขอคืน' : 'สมดุล',
      },
      wht: {
        payable: {
          base: (payableAgg._sum.baseAmount ?? new Prisma.Decimal(0)).toString(),
          amount: (payableAgg._sum.whtAmount ?? new Prisma.Decimal(0)).toString(),
          count: payableAgg._count._all,
        },
        receivable: {
          base: (receivableAgg._sum.baseAmount ?? new Prisma.Decimal(0)).toString(),
          amount: (receivableAgg._sum.whtAmount ?? new Prisma.Decimal(0)).toString(),
          count: receivableAgg._count._all,
        },
      },
    };
  }

  /**
   * Detailed VAT register. Returns all VatRecord rows in the period grouped
   * by record type. Sorted by document date so it lines up with the period
   * summary on /tax.
   */
  async vatReport(companyId: string, filter: PeriodFilterDto) {
    const { year, month } = this.resolvePeriod(filter);
    const where: Prisma.VatRecordWhereInput = {
      companyId,
      periodYear: year,
      ...(month ? { periodMonth: month } : {}),
    };
    const records = await this.prisma.vatRecord.findMany({
      where,
      orderBy: [{ recordType: 'asc' }, { documentDate: 'asc' }],
    });
    return {
      period: { year, month: month ?? null },
      items: records.map((r) => ({
        ...r,
        documentDate: r.documentDate.toISOString(),
        baseAmount: r.baseAmount.toString(),
        vatRate: r.vatRate.toString(),
        vatAmount: r.vatAmount.toString(),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async whtReport(companyId: string, filter: PeriodFilterDto) {
    const { year, month } = this.resolvePeriod(filter);
    const where: Prisma.WithholdingTaxRecordWhereInput = {
      companyId,
      periodYear: year,
      ...(month ? { periodMonth: month } : {}),
    };
    const records = await this.prisma.withholdingTaxRecord.findMany({
      where,
      orderBy: [{ recordType: 'asc' }, { paidAt: 'asc' }],
    });
    return {
      period: { year, month: month ?? null },
      items: records.map((r) => ({
        ...r,
        paidAt: r.paidAt.toISOString(),
        baseAmount: r.baseAmount.toString(),
        rate: r.rate.toString(),
        whtAmount: r.whtAmount.toString(),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Resolve filter to a concrete (year, month?) tuple. Default = current
   * Bangkok year + month if neither given. If only year given, return year
   * with no month filter (whole-year view).
   */
  private resolvePeriod(filter: PeriodFilterDto): { year: number; month?: number } {
    if (filter.year && filter.month) {
      return { year: filter.year, month: filter.month };
    }
    if (filter.year && !filter.month) {
      return { year: filter.year };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}
