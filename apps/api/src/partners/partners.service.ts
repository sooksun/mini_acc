import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { ListPartnersDto } from './dto/list-partners.dto';

@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreatePartnerDto) {
    if (dto.code) {
      const existing = await this.prisma.partner.findFirst({
        where: { companyId, code: dto.code },
        select: { id: true },
      });
      if (existing) throw new ConflictException(`Code ${dto.code} already in use`);
    }

    return this.prisma.partner.create({
      data: {
        companyId,
        type: dto.type,
        code: dto.code,
        nameTh: dto.nameTh,
        nameEn: dto.nameEn,
        taxId: dto.taxId,
        branch: dto.branch,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        note: dto.note,
        contacts:
          dto.contacts && dto.contacts.length > 0
            ? {
                create: dto.contacts.map((c) => ({
                  name: c.name,
                  position: c.position ?? null,
                  phone: c.phone ?? null,
                  email: c.email ?? null,
                  isPrimary: c.isPrimary ?? false,
                })),
              }
            : undefined,
      },
      include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
    });
  }

  async list(companyId: string, dto: ListPartnersDto) {
    const where: Prisma.PartnerWhereInput = {
      companyId,
      ...this.typeFilter(dto.type),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.search
        ? {
            OR: [
              { nameTh: { contains: dto.search } },
              { nameEn: { contains: dto.search } },
              { code: { contains: dto.search } },
              { taxId: { contains: dto.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where,
        include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
        orderBy: [{ isActive: 'desc' }, { nameTh: 'asc' }],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.partner.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(companyId: string, id: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, companyId },
      include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    return partner;
  }

  async update(companyId: string, id: string, dto: UpdatePartnerDto) {
    await this.findOne(companyId, id);

    if (dto.code) {
      const conflict = await this.prisma.partner.findFirst({
        where: { companyId, code: dto.code, NOT: { id } },
        select: { id: true },
      });
      if (conflict) throw new ConflictException(`Code ${dto.code} already in use`);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.partner.update({
        where: { id },
        data: {
          type: dto.type,
          code: dto.code,
          nameTh: dto.nameTh,
          nameEn: dto.nameEn,
          taxId: dto.taxId,
          branch: dto.branch,
          address: dto.address,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          note: dto.note,
          isActive: dto.isActive,
        },
      });

      if (dto.contacts !== undefined) {
        await tx.partnerContact.deleteMany({ where: { partnerId: id } });
        if (dto.contacts.length > 0) {
          await tx.partnerContact.createMany({
            data: dto.contacts.map((c) => ({
              partnerId: id,
              name: c.name,
              position: c.position ?? null,
              phone: c.phone ?? null,
              email: c.email ?? null,
              isPrimary: c.isPrimary ?? false,
            })),
          });
        }
      }

      return tx.partner.findUniqueOrThrow({
        where: { id },
        include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
      });
    });
  }

  async deactivate(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.partner.update({
      where: { id },
      data: { isActive: false },
      include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
    });
  }

  private typeFilter(type?: string): Prisma.PartnerWhereInput {
    if (!type) return {};
    if (type === 'BOTH') return { type: 'BOTH' };
    return { OR: [{ type: type as Prisma.EnumPartnerTypeFilter['equals'] }, { type: 'BOTH' }] };
  }
}
