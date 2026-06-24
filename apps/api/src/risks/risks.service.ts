import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RiskItemType, RiskLevel, RiskItemStatus } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProjectsService } from '../projects/projects.service';
import { ListRisksDto } from './dto/list-risks.dto';
import { ResolveRiskDto } from './dto/resolve-risk.dto';
import type { DetectedRisk } from './detected-risk';
import { persistNewRisks } from './detectors/persist-new-risks';
import { runRiskDetectors } from './detectors';

export type { DetectedRisk };

@Injectable()
export class RisksService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private projects: ProjectsService,
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
    const detected = await runRiskDetectors({
      companyId,
      prisma: this.prisma,
      inventory: this.inventory,
      projects: this.projects,
    });
    const created = await persistNewRisks(this.prisma, companyId, detected);
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
