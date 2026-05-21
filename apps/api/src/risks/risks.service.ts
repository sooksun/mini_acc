import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RiskItemType, RiskLevel, RiskItemStatus } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ListRisksDto } from './dto/list-risks.dto';
import { ResolveRiskDto } from './dto/resolve-risk.dto';

export interface DetectedRisk {
  type: RiskItemType;
  level: RiskLevel;
  entityType?: string;
  entityId?: string;
  title: string;
  description?: string;
}

@Injectable()
export class RisksService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async list(companyId: string, dto: ListRisksDto) {
    const where: Prisma.RiskItemWhereInput = {
      companyId,
      ...(dto.status ? { status: dto.status } : { status: { not: 'DISMISSED' } }),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.level ? { level: dto.level } : {}),
      ...(dto.entityType ? { entityType: dto.entityType } : {}),
      ...(dto.entityId ? { entityId: dto.entityId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.riskItem.findMany({
        where,
        orderBy: [
          // Open + critical first; resolved/accepted sink to the bottom
          { status: 'asc' },
          { level: 'desc' },
          { detectedAt: 'desc' },
        ],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.riskItem.count({ where }),
    ]);
    return { items: items.map((r) => this.toDto(r)), total };
  }

  async findOne(companyId: string, id: string) {
    const risk = await this.prisma.riskItem.findFirst({ where: { id, companyId } });
    if (!risk) throw new NotFoundException('Risk item not found');
    return this.toDto(risk);
  }

  async resolve(companyId: string, userId: string, id: string, dto: ResolveRiskDto) {
    await this.requireOpen(companyId, id);
    const updated = await this.prisma.riskItem.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution: dto.resolution.trim(),
      },
    });
    return this.toDto(updated);
  }

  async accept(companyId: string, userId: string, id: string, dto: ResolveRiskDto) {
    await this.requireOpen(companyId, id);
    const updated = await this.prisma.riskItem.update({
      where: { id },
      data: {
        status: 'ACCEPTED_RISK',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution: dto.resolution.trim(),
      },
    });
    return this.toDto(updated);
  }

  async dismiss(companyId: string, userId: string, id: string, dto: ResolveRiskDto) {
    await this.requireOpen(companyId, id);
    const updated = await this.prisma.riskItem.update({
      where: { id },
      data: {
        status: 'DISMISSED',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution: dto.resolution.trim(),
      },
    });
    return this.toDto(updated);
  }

  /**
   * Run all auto-detectors and upsert RiskItem rows. Idempotent at the
   * (companyId, type, entityType, entityId) level — re-running on the same
   * data doesn't create duplicates.
   *
   * Re-detected risks that were previously RESOLVED/DISMISSED stay closed —
   * we trust the human's prior decision. Truly new findings become OPEN.
   */
  async scan(companyId: string): Promise<{ detected: DetectedRisk[]; created: number }> {
    const detected: DetectedRisk[] = [];

    // (1) TAX_INVOICE / RECEIPT_TAX_INVOICE confirmed but missing customer taxId
    const docsMissingTaxId = await this.prisma.salesDocument.findMany({
      where: {
        companyId,
        type: { in: ['TAX_INVOICE', 'RECEIPT_TAX_INVOICE'] },
        status: { in: ['USER_CONFIRMED', 'ACCOUNTED', 'PENDING_ACCOUNTANT', 'ACCOUNTANT_APPROVED', 'LOCKED'] },
        OR: [{ customerSnapshotTaxId: null }, { customerSnapshotTaxId: '' }],
      },
      select: { id: true, number: true, type: true, customerSnapshotName: true },
    });
    for (const doc of docsMissingTaxId) {
      detected.push({
        type: 'TAX_ID_MISSING',
        level: 'CRITICAL',
        entityType: 'SalesDocument',
        entityId: doc.id,
        title: `${doc.type === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบเสร็จ/ใบกำกับภาษี'} ${doc.number} ไม่มีเลขผู้เสียภาษีลูกค้า`,
        description: `ลูกค้า "${doc.customerSnapshotName}" — เอกสารภาษีต้องมีเลขผู้เสียภาษี 13 หลักของผู้ซื้อ`,
      });
    }

    // (2) Unbalanced journal entries (should never happen but defensive)
    const unbalanced = await this.prisma.$queryRaw<
      { id: string; entryDate: Date; totalDebit: string; totalCredit: string }[]
    >`
      SELECT id, entryDate, totalDebit, totalCredit
      FROM JournalEntry
      WHERE companyId = ${companyId}
        AND status = 'POSTED'
        AND totalDebit <> totalCredit
    `;
    for (const je of unbalanced) {
      detected.push({
        type: 'PDF_GENERATION_ERROR', // closest enum value; treat as system-integrity flag
        level: 'CRITICAL',
        entityType: 'JournalEntry',
        entityId: je.id,
        title: `Journal entry ${je.id} ไม่สมดุล: Dr ${je.totalDebit} ≠ Cr ${je.totalCredit}`,
      });
    }

    // (3) ExpenseReceipt that hit ACCOUNTED but no matching journal (orphan record)
    const orphanExpense = await this.prisma.$queryRaw<{ id: string; documentNumber: string | null }[]>`
      SELECT er.id, er.documentNumber
      FROM ExpenseRecord er
      WHERE er.companyId = ${companyId}
        AND er.status = 'RECORDED'
        AND NOT EXISTS (
          SELECT 1 FROM JournalEntry je
          WHERE je.companyId = er.companyId
            AND je.sourceType = 'EXPENSE_RECORD'
            AND je.sourceId = er.id
            AND je.status = 'POSTED'
        )
    `;
    for (const er of orphanExpense) {
      detected.push({
        type: 'MISSING_DOCUMENT',
        level: 'HIGH',
        entityType: 'ExpenseRecord',
        entityId: er.id,
        title: `รายจ่าย ${er.documentNumber ?? er.id} ไม่มี journal entry`,
        description: 'รายการลงรายจ่ายแล้วแต่ไม่พบ journal entry — ระบบ posting อาจมี bug',
      });
    }

    // (4) Duplicate sales document numbers — the (companyId, type, number)
    // unique key prevents same (type, number), so any real-numbered string that
    // appears more than once is a data-integrity anomaly worth flagging.
    const dupNumbers = await this.prisma.salesDocument.groupBy({
      by: ['number'],
      where: {
        companyId,
        status: { not: 'VOIDED' },
        number: { not: { startsWith: 'DRAFT-' } },
      },
      _count: { number: true },
      having: { number: { _count: { gt: 1 } } },
    });
    for (const dup of dupNumbers) {
      detected.push({
        type: 'DUPLICATE_DOCUMENT',
        level: 'CRITICAL',
        entityType: 'SalesDocumentNumber',
        entityId: dup.number,
        title: `เลขเอกสารขาย ${dup.number} ซ้ำ ${dup._count.number} ใบ`,
        description: 'เลขเอกสารต้องไม่ซ้ำ — ตรวจสอบและออกเลขใหม่/ยกเลิกใบที่ซ้ำ',
      });
    }

    // (5) Negative stock — the stock-out guard blocks OUT below zero, but
    // ADJUST / opening balances can still push a product negative.
    const stock = await this.inventory.stockSummary(companyId);
    for (const s of stock) {
      if (Number(s.onHand) < 0) {
        detected.push({
          type: 'STOCK_NEGATIVE',
          level: 'CRITICAL',
          entityType: 'Product',
          entityId: s.productId,
          title: `สินค้า ${s.nameTh} สต็อกติดลบ (${s.onHand} ${s.unit})`,
          description: 'สต็อกติดลบ — ตรวจสอบการเคลื่อนไหวสินค้า/ยอดยกมา',
        });
      }
    }

    // Upsert each detected risk. Look up existing by (type, entityType, entityId).
    // Existing row in any status: skip (human already saw it).
    let created = 0;
    for (const risk of detected) {
      const existing = await this.prisma.riskItem.findFirst({
        where: {
          companyId,
          type: risk.type,
          entityType: risk.entityType ?? null,
          entityId: risk.entityId ?? null,
        },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.riskItem.create({
        data: {
          companyId,
          type: risk.type,
          level: risk.level,
          status: 'OPEN',
          entityType: risk.entityType,
          entityId: risk.entityId,
          title: risk.title,
          description: risk.description,
        },
      });
      created++;
    }
    return { detected, created };
  }

  async countOpen(companyId: string, level?: RiskLevel): Promise<number> {
    return this.prisma.riskItem.count({
      where: {
        companyId,
        status: { in: ['OPEN', 'IN_REVIEW'] satisfies RiskItemStatus[] },
        ...(level ? { level } : {}),
      },
    });
  }

  private async requireOpen(companyId: string, id: string) {
    const risk = await this.prisma.riskItem.findFirst({ where: { id, companyId } });
    if (!risk) throw new NotFoundException('Risk item not found');
    if (risk.status === 'RESOLVED' || risk.status === 'DISMISSED') {
      throw new NotFoundException('Risk already closed');
    }
    return risk;
  }

  private toDto(r: {
    id: string;
    type: RiskItemType;
    level: RiskLevel;
    status: RiskItemStatus;
    entityType: string | null;
    entityId: string | null;
    title: string;
    description: string | null;
    detectedAt: Date;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    resolution: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...r,
      detectedAt: r.detectedAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
