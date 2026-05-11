import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateProductDto) {
    if (dto.code) {
      const existing = await this.prisma.product.findFirst({
        where: { companyId, code: dto.code },
        select: { id: true },
      });
      if (existing) throw new ConflictException(`Code ${dto.code} already in use`);
    }

    return this.prisma.product.create({
      data: {
        companyId,
        type: dto.type,
        code: dto.code,
        nameTh: dto.nameTh,
        nameEn: dto.nameEn,
        description: dto.description,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        vatable: dto.vatable ?? true,
      },
    });
  }

  async list(companyId: string, dto: ListProductsDto) {
    const where: Prisma.ProductWhereInput = {
      companyId,
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.search
        ? {
            OR: [
              { nameTh: { contains: dto.search } },
              { nameEn: { contains: dto.search } },
              { code: { contains: dto.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { nameTh: 'asc' }],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(companyId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(companyId, id);

    if (dto.code) {
      const conflict = await this.prisma.product.findFirst({
        where: { companyId, code: dto.code, NOT: { id } },
        select: { id: true },
      });
      if (conflict) throw new ConflictException(`Code ${dto.code} already in use`);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        type: dto.type,
        code: dto.code,
        nameTh: dto.nameTh,
        nameEn: dto.nameEn,
        description: dto.description,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        vatable: dto.vatable,
        isActive: dto.isActive,
      },
    });
  }

  async deactivate(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
