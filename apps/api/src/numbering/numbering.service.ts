import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DocumentType } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { getBuddhistYear } from './be-year';

@Injectable()
export class NumberingService {
  constructor(private prisma: PrismaService) {}

  async peek(companyId: string, type: DocumentType, documentDate: Date | string): Promise<string> {
    const beYear = getBuddhistYear(documentDate);
    const rule = await this.prisma.documentNumberingRule.findUnique({
      where: { companyId_type: { companyId, type } },
    });
    if (!rule) {
      throw new NotFoundException(`No numbering rule for type ${type}`);
    }
    const counter = await this.prisma.documentNumberingCounter.findUnique({
      where: { companyId_type_beYear: { companyId, type, beYear } },
    });
    const next = (counter?.currentValue ?? 0) + 1;
    return this.format(rule.prefix, beYear, next, rule.padding);
  }

  async allocate(
    companyId: string,
    type: DocumentType,
    documentDate: Date | string,
    tx: Prisma.TransactionClient,
  ): Promise<{ number: string; counterValue: number; beYear: number }> {
    const beYear = getBuddhistYear(documentDate);
    const rule = await tx.documentNumberingRule.findUnique({
      where: { companyId_type: { companyId, type } },
    });
    if (!rule) {
      throw new NotFoundException(`No numbering rule for type ${type}`);
    }

    const updated = await tx.documentNumberingCounter.upsert({
      where: { companyId_type_beYear: { companyId, type, beYear } },
      create: { companyId, type, beYear, currentValue: 1 },
      update: { currentValue: { increment: 1 } },
    });

    return {
      number: this.format(rule.prefix, beYear, updated.currentValue, rule.padding),
      counterValue: updated.currentValue,
      beYear,
    };
  }

  private format(prefix: string, beYear: number, value: number, padding: number): string {
    return `${prefix}-${beYear}-${String(value).padStart(padding, '0')}`;
  }
}
