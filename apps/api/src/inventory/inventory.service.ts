import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InventoryMovementType } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryMovementDto } from './dto/create-movement.dto';
import { ListMovementsDto } from './dto/list-movements.dto';

const ZERO = new Prisma.Decimal(0);

/** Types that add to stock vs subtract. ADJUST is treated as positive — if
 *  operator needs negative correction, use OUT with a note explaining. */
const STOCK_IN: InventoryMovementType[] = ['IN', 'RETURN_IN', 'OPENING_BALANCE', 'ADJUST'];
const STOCK_OUT: InventoryMovementType[] = ['OUT', 'RETURN_OUT'];

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, userId: string, dto: CreateInventoryMovementDto) {
    const quantity = new Prisma.Decimal(dto.quantity);
    if (quantity.lte(0)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'QUANTITY_REQUIRED',
        message: 'quantity ต้องมากกว่า 0',
      });
    }

    // Verify product belongs to the same tenant
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, companyId, isActive: true },
      select: { id: true, nameTh: true, unit: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found or inactive');
    }

    const movementDate = new Date(dto.movementDate);
    const unitCost = dto.unitCost ? new Prisma.Decimal(dto.unitCost) : null;
    const totalCost = unitCost ? unitCost.mul(quantity) : null;

    // Stock-out guard (PRD §22.3 #7). Lock the product row to serialize
    // concurrent OUT movements against the same product — otherwise two
    // simultaneous OUTs could both pass the check and drive stock negative.
    return this.prisma.$transaction(async (tx) => {
      if (STOCK_OUT.includes(dto.type)) {
        await tx.$executeRaw`SELECT id FROM Product WHERE id = ${dto.productId} FOR UPDATE`;
        const currentStock = await this.computeStockOnHand(tx, companyId, dto.productId);
        if (currentStock.lt(quantity)) {
          throw new UnprocessableEntityException({
            statusCode: 422,
            code: 'STOCK_NEGATIVE',
            message: `สต็อกไม่พอ: ${product.nameTh} ปัจจุบัน ${currentStock.toString()} ${product.unit} ต้องการ ${quantity.toString()} ${product.unit}`,
            currentStock: currentStock.toString(),
            requested: quantity.toString(),
          });
        }
      }

      const created = await tx.inventoryMovement.create({
        data: {
          companyId,
          productId: dto.productId,
          type: dto.type,
          quantity,
          movementDate,
          unitCost,
          totalCost,
          referenceType: dto.referenceType?.trim() || null,
          referenceId: dto.referenceId?.trim() || null,
          note: dto.note?.trim() || null,
          recordedBy: userId,
        },
        include: { product: { select: { id: true, code: true, nameTh: true, unit: true } } },
      });

      return this.toDto(created);
    });
  }

  async list(companyId: string, dto: ListMovementsDto) {
    const where: Prisma.InventoryMovementWhereInput = {
      companyId,
      ...(dto.productId ? { productId: dto.productId } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.dateFrom || dto.dateTo
        ? {
            movementDate: {
              ...(dto.dateFrom ? { gte: new Date(dto.dateFrom) } : {}),
              ...(dto.dateTo ? { lte: new Date(dto.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        include: { product: { select: { id: true, code: true, nameTh: true, unit: true } } },
        orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return { items: items.map((m) => this.toDto(m)), total };
  }

  async stockOnHand(companyId: string, productId: string): Promise<Prisma.Decimal> {
    return this.computeStockOnHand(this.prisma, companyId, productId);
  }

  async stockSummary(companyId: string) {
    // One row per product with its current on-hand quantity. We sum IN-type
    // movements then subtract OUT-type movements via two grouped aggregates,
    // then merge by productId in JS — cleaner than a single CASE-aggregated
    // raw SQL and stays portable across DB engines.
    const products = await this.prisma.product.findMany({
      where: { companyId, isActive: true, type: { in: ['GOOD', 'MATERIAL'] } },
      orderBy: { nameTh: 'asc' },
      select: {
        id: true,
        code: true,
        nameTh: true,
        unit: true,
        type: true,
        unitPrice: true,
      },
    });
    if (products.length === 0) return [];

    const productIds = products.map((p) => p.id);
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'type'],
      where: { companyId, productId: { in: productIds } },
      _sum: { quantity: true },
    });

    return products.map((p) => {
      const onHand = movements
        .filter((m) => m.productId === p.id)
        .reduce((sum, m) => {
          const q = m._sum.quantity ?? ZERO;
          if (STOCK_IN.includes(m.type)) return sum.plus(q);
          if (STOCK_OUT.includes(m.type)) return sum.minus(q);
          return sum;
        }, ZERO);
      return {
        productId: p.id,
        code: p.code,
        nameTh: p.nameTh,
        unit: p.unit,
        type: p.type,
        unitPrice: p.unitPrice.toString(),
        onHand: onHand.toString(),
        stockValue: onHand.mul(p.unitPrice).toDecimalPlaces(2).toString(),
      };
    });
  }

  /** Run the actual aggregate inside the caller's tx (or prisma client). */
  private async computeStockOnHand(
    client: PrismaService | Prisma.TransactionClient,
    companyId: string,
    productId: string,
  ): Promise<Prisma.Decimal> {
    const grouped = await client.inventoryMovement.groupBy({
      by: ['type'],
      where: { companyId, productId },
      _sum: { quantity: true },
    });
    return grouped.reduce((sum, g) => {
      const q = g._sum.quantity ?? ZERO;
      if (STOCK_IN.includes(g.type)) return sum.plus(q);
      if (STOCK_OUT.includes(g.type)) return sum.minus(q);
      return sum;
    }, ZERO);
  }

  private toDto(
    m: Prisma.InventoryMovementGetPayload<{
      include: { product: { select: { id: true; code: true; nameTh: true; unit: true } } };
    }>,
  ) {
    return {
      ...m,
      quantity: m.quantity.toString(),
      unitCost: m.unitCost?.toString() ?? null,
      totalCost: m.totalCost?.toString() ?? null,
      movementDate: m.movementDate.toISOString(),
      createdAt: m.createdAt.toISOString(),
    };
  }
}
