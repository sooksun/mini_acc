import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CompanyDto, VatStatus } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateVatStatusDto } from './dto/update-vat-status.dto';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async getOwn(companyId: string): Promise<CompanyDto> {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw new NotFoundException('Company not found');
    return {
      id: c.id,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      taxId: c.taxId,
      address: c.address,
      phone: c.phone,
      email: c.email,
      brandShort: c.brandShort,
      tagline: c.tagline,
      registeredAt: c.registeredAt.toISOString(),
      vatEffectiveDate: c.vatEffectiveDate ? c.vatEffectiveDate.toISOString() : null,
      capital: c.capital ? c.capital.toString() : null,
      defaultMarkupPercent: c.defaultMarkupPercent.toNumber(),
    };
  }

  async update(companyId: string, dto: UpdateCompanyDto): Promise<CompanyDto> {
    await this.prisma.company.update({ where: { id: companyId }, data: dto });
    return this.getOwn(companyId);
  }

  async listVatHistory(companyId: string) {
    return this.prisma.companyVatStatus.findMany({
      where: { companyId },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async setVatStatus(companyId: string, dto: UpdateVatStatusDto) {
    const effectiveFrom = new Date(dto.effectiveFrom);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.companyVatStatus.updateMany({
        where: { companyId, effectiveTo: null },
        data: { effectiveTo: effectiveFrom },
      });

      const created = await tx.companyVatStatus.create({
        data: {
          companyId,
          status: dto.status,
          effectiveFrom,
          reason: dto.reason ?? null,
        },
      });

      const newVatEffectiveDate =
        dto.status === ('REGISTERED' satisfies VatStatus) ? effectiveFrom : null;

      await tx.company.update({
        where: { id: companyId },
        data: { vatEffectiveDate: newVatEffectiveDate },
      });

      return created;
    });
  }
}
