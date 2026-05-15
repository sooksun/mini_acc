import { randomUUID } from 'node:crypto';
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

    // Race-safe via single atomic INSERT ... ON DUPLICATE KEY UPDATE on the
    // (companyId, type, beYear) unique key. MySQL serializes the unique-key
    // collision check regardless of isolation level, so concurrent transactions
    // queue at the row lock instead of racing through SELECT-then-INSERT.
    //
    // Trick to read the new currentValue back atomically:
    //   - INSERT path: row inserted with currentValue=1; affectedRows = 1.
    //   - UPDATE path: LAST_INSERT_ID(currentValue + 1) sets the session's
    //     last_insert_id to the new value; affectedRows = 2.
    //
    // Prisma's `upsert(create, update)` is NOT race-safe on MySQL because the
    // create path runs as a plain INSERT (not INSERT ... ON DUPLICATE KEY UPDATE),
    // producing P2002 when two transactions both see "no row". INSERT IGNORE
    // also fails because the row inserted by one transaction is not yet visible
    // to another's later UPDATE under REPEATABLE READ.
    const affectedRows = await tx.$executeRaw`
      INSERT INTO DocumentNumberingCounter (id, companyId, type, beYear, currentValue, updatedAt)
      VALUES (${randomUUID()}, ${companyId}, ${type}, ${beYear}, 1, NOW(3))
      ON DUPLICATE KEY UPDATE
        currentValue = LAST_INSERT_ID(currentValue + 1),
        updatedAt = NOW(3)
    `;

    let counterValue: number;
    if (affectedRows === 1) {
      // First row for this (companyId, type, beYear) — currentValue is 1.
      counterValue = 1;
    } else {
      // Existing row was incremented; LAST_INSERT_ID() now holds the new value.
      const result = await tx.$queryRaw<[{ value: bigint | number }]>`
        SELECT LAST_INSERT_ID() AS value
      `;
      counterValue = Number(result[0].value);
    }

    return {
      number: this.format(rule.prefix, beYear, counterValue, rule.padding),
      counterValue,
      beYear,
    };
  }

  private format(prefix: string, beYear: number, value: number, padding: number): string {
    return `${prefix}-${beYear}-${String(value).padStart(padding, '0')}`;
  }
}
