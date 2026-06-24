import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FixedAssetStatus } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ACCOUNTS } from '../journal/accounts';
import { CreateFixedAssetDto } from './dto/create-asset.dto';
import { DisposeAssetDto } from './dto/dispose-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class FixedAssetsService {
  constructor(
    private prisma: PrismaService,
    private journal: JournalService,
  ) {}

  async create(companyId: string, _userId: string, dto: CreateFixedAssetDto) {
    const cost = new Prisma.Decimal(dto.cost);
    const salvageValue = dto.salvageValue ? new Prisma.Decimal(dto.salvageValue) : ZERO;
    if (cost.lte(0)) {
      throw new BadRequestException('cost ต้องมากกว่า 0');
    }
    if (salvageValue.gte(cost)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'SALVAGE_EXCEEDS_COST',
        message: 'salvageValue ต้องน้อยกว่า cost',
      });
    }

    try {
      const created = await this.prisma.fixedAsset.create({
        data: {
          companyId,
          code: dto.code?.trim() || null,
          name: dto.name.trim(),
          category: dto.category.trim(),
          status: 'ACTIVE',
          acquiredAt: new Date(dto.acquiredAt),
          cost,
          salvageValue,
          usefulLifeMonths: dto.usefulLifeMonths,
          accumulatedDepr: ZERO,
          bookValue: cost,
          expenseRecordId: dto.expenseRecordId?.trim() || null,
          projectId: dto.projectId?.trim() || null,
        },
      });
      return this.toDto(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          code: 'ASSET_CODE_TAKEN',
          message: 'asset code นี้ถูกใช้แล้ว',
        });
      }
      throw err;
    }
  }

  async list(companyId: string, dto: ListAssetsDto) {
    const where: Prisma.FixedAssetWhereInput = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.category ? { category: dto.category } : {}),
      ...(dto.search
        ? {
            OR: [
              { name: { contains: dto.search } },
              { code: { contains: dto.search } },
              { category: { contains: dto.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fixedAsset.findMany({
        where,
        orderBy: [{ status: 'asc' }, { acquiredAt: 'desc' }],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.fixedAsset.count({ where }),
    ]);
    return { items: items.map((a) => this.toDto(a)), total };
  }

  async findOne(companyId: string, id: string) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, companyId } });
    if (!asset) throw new NotFoundException('Fixed asset not found');
    return this.toDto(asset);
  }

  async dispose(companyId: string, _userId: string, id: string, dto: DisposeAssetDto) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, companyId } });
    if (!asset) throw new NotFoundException('Fixed asset not found');
    if (asset.status !== 'ACTIVE') {
      throw new ConflictException({
        statusCode: 409,
        code: 'ASSET_NOT_ACTIVE',
        message: `Cannot dispose asset with status ${asset.status}`,
      });
    }
    const disposedAt = dto.disposedAt ? new Date(dto.disposedAt) : new Date();
    const updated = await this.prisma.fixedAsset.update({
      where: { id },
      data: {
        status: 'DISPOSED',
        disposedAt,
        disposalReason: dto.reason.trim(),
      },
    });
    return this.toDto(updated);
  }

  /**
   * Roll forward depreciation up to (and including) the given period. Uses
   * straight-line: monthly = (cost − salvage) / usefulLifeMonths. Idempotent —
   * re-running the same period doesn't double-charge because we compute the
   * target accumulated value from `monthsElapsed`, not delta from previous run.
   *
   * Posts the period's depreciation to the journal so it reaches the P&L and
   * the balance sheet: Dr ค่าเสื่อมราคา (5500) / Cr ค่าเสื่อมราคาสะสม (1490) for
   * the aggregate delta. The asset-row updates and the journal entry share one
   * transaction — they commit together or not at all. No delta → no entry, so
   * an idempotent re-run posts nothing.
   */
  async runDepreciation(companyId: string, userId: string, asOf: Date = new Date()) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: { companyId, status: 'ACTIVE' },
    });

    // Compute deltas first (pure), then commit asset rows + journal atomically.
    const charges: { id: string; newAccum: Prisma.Decimal; newBookValue: Prisma.Decimal; delta: Prisma.Decimal }[] = [];
    let totalDepreciation = ZERO;
    for (const asset of assets) {
      const newAccum = this.computeAccumulated(asset, asOf);
      if (newAccum.equals(asset.accumulatedDepr)) continue;
      const delta = newAccum.minus(asset.accumulatedDepr);
      charges.push({ id: asset.id, newAccum, newBookValue: asset.cost.minus(newAccum), delta });
      totalDepreciation = totalDepreciation.plus(delta);
    }

    if (charges.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const c of charges) {
          await tx.fixedAsset.update({
            where: { id: c.id },
            data: { accumulatedDepr: c.newAccum, bookValue: c.newBookValue },
          });
        }
        // Only post when the aggregate delta is non-zero (rounding could in
        // theory net to zero across assets, though each charge is > 0 here).
        if (totalDepreciation.greaterThan(ZERO)) {
          await this.journal.postWithTx(tx, {
            companyId,
            userId,
            entryDate: asOf,
            description: `ค่าเสื่อมราคา ณ ${asOf.toISOString().slice(0, 10)}`,
            sourceType: 'FIXED_ASSET',
            lines: [
              {
                accountCode: ACCOUNTS.DEPRECIATION_EXPENSE.code,
                accountName: ACCOUNTS.DEPRECIATION_EXPENSE.name,
                debit: totalDepreciation,
              },
              {
                accountCode: ACCOUNTS.ACCUM_DEPRECIATION.code,
                accountName: ACCOUNTS.ACCUM_DEPRECIATION.name,
                credit: totalDepreciation,
              },
            ],
          });
        }
      });
    }

    return {
      asOf: asOf.toISOString(),
      assetsUpdated: charges.length,
      totalDepreciation: totalDepreciation.toString(),
    };
  }

  private computeAccumulated(
    asset: { cost: Prisma.Decimal; salvageValue: Prisma.Decimal; usefulLifeMonths: number; acquiredAt: Date },
    asOf: Date,
  ): Prisma.Decimal {
    const depreciable = asset.cost.minus(asset.salvageValue);
    const monthly = depreciable.div(asset.usefulLifeMonths).toDecimalPlaces(2);
    const monthsElapsed = Math.max(
      0,
      Math.min(asset.usefulLifeMonths, monthsBetween(asset.acquiredAt, asOf)),
    );
    // Cap at (cost − salvage). Monthly rounding to 2dp can push the
    // multiplicative product just past the depreciable amount; the cap keeps
    // bookValue from dipping below salvageValue.
    const raw = monthly.mul(monthsElapsed).toDecimalPlaces(2);
    return raw.gt(depreciable) ? depreciable : raw;
  }

  private toDto(asset: {
    id: string;
    code: string | null;
    name: string;
    category: string;
    status: FixedAssetStatus;
    acquiredAt: Date;
    cost: Prisma.Decimal;
    salvageValue: Prisma.Decimal;
    usefulLifeMonths: number;
    accumulatedDepr: Prisma.Decimal;
    bookValue: Prisma.Decimal;
    disposedAt: Date | null;
    disposalReason: string | null;
    expenseRecordId: string | null;
    projectId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const monthly = asset.cost
      .minus(asset.salvageValue)
      .div(asset.usefulLifeMonths)
      .toDecimalPlaces(2);
    return {
      ...asset,
      cost: asset.cost.toString(),
      salvageValue: asset.salvageValue.toString(),
      accumulatedDepr: asset.accumulatedDepr.toString(),
      bookValue: asset.bookValue.toString(),
      monthlyDepreciation: monthly.toString(),
      monthsElapsed: monthsBetween(asset.acquiredAt, new Date()),
      acquiredAt: asset.acquiredAt.toISOString(),
      disposedAt: asset.disposedAt?.toISOString() ?? null,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }
}

/** Number of complete months elapsed between two dates (Gregorian). */
function monthsBetween(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) return 0;
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  let total = years * 12 + months;
  if (to.getDate() < from.getDate()) total -= 1;
  return Math.max(0, total);
}
