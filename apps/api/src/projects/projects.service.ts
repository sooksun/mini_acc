import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import type { DocumentStatus } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListProjectsDto } from './dto/list-projects.dto';

const CONFIRMED_SALES_STATUSES: DocumentStatus[] = [
  'USER_CONFIRMED',
  'ACCOUNTED',
  'PENDING_ACCOUNTANT',
  'ACCOUNTANT_APPROVED',
  'LOCKED',
];

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateProjectDto) {
    if (dto.code) {
      const existing = await this.prisma.project.findFirst({
        where: { companyId, code: dto.code },
        select: { id: true },
      });
      if (existing) throw new ConflictException(`Code ${dto.code} already in use`);
    }
    const customerId = await this.resolveCustomer(companyId, dto.customerId);

    const project = await this.prisma.project.create({
      data: {
        companyId,
        code: dto.code ?? null,
        name: dto.name,
        customerId,
        status: dto.status ?? 'ACTIVE',
        description: dto.description ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        budget: dto.budget ?? null,
        note: dto.note ?? null,
      },
      include: this.include(),
    });
    return this.toDto(project);
  }

  async list(companyId: string, dto: ListProjectsDto) {
    const where: Prisma.ProjectWhereInput = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.search
        ? {
            OR: [
              { name: { contains: dto.search } },
              { code: { contains: dto.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: this.include(),
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items: items.map((p) => this.toDto(p)), total };
  }

  async findOne(companyId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, companyId },
      include: this.include(),
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.toDto(project);
  }

  async update(companyId: string, id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Project not found');

    if (dto.code) {
      const conflict = await this.prisma.project.findFirst({
        where: { companyId, code: dto.code, NOT: { id } },
        select: { id: true },
      });
      if (conflict) throw new ConflictException(`Code ${dto.code} already in use`);
    }
    const customerId =
      dto.customerId === undefined
        ? undefined
        : await this.resolveCustomer(companyId, dto.customerId ?? undefined);

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        customerId,
        status: dto.status,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        budget: dto.budget,
        note: dto.note,
      },
      include: this.include(),
    });
    return this.toDto(project);
  }

  /**
   * Project profitability: revenue from sales documents tagged with this
   * project (recognised the same way as the P&L — INVOICE/TAX_INVOICE always,
   * standalone RECEIPT/RECEIPT_TAX_INVOICE) minus cost from expense records
   * tagged with this project. Amounts are ex-VAT (subtotal); gross figures
   * carry VAT for cash-flow context.
   */
  /**
   * Ex-VAT revenue and cost per project — same recognition rules as profit().
   * Used by the risk scanner (batch) and profit() (single project).
   */
  async profitTotalsBatch(
    companyId: string,
    projectIds: string[],
  ): Promise<Map<string, { revenue: number; cost: number }>> {
    if (projectIds.length === 0) return new Map();

    const [invoiceRevs, receiptRevs, projCosts] = await Promise.all([
      this.prisma.salesDocument.groupBy({
        by: ['projectId'],
        where: {
          companyId,
          projectId: { in: projectIds },
          type: { in: ['INVOICE', 'TAX_INVOICE'] as DocumentType[] },
          status: { in: CONFIRMED_SALES_STATUSES },
        },
        _sum: { subtotal: true },
      }),
      this.prisma.salesDocument.groupBy({
        by: ['projectId'],
        where: {
          companyId,
          projectId: { in: projectIds },
          type: { in: ['RECEIPT', 'RECEIPT_TAX_INVOICE'] as DocumentType[] },
          parentDocumentId: null,
          status: { in: CONFIRMED_SALES_STATUSES },
        },
        _sum: { subtotal: true },
      }),
      this.prisma.expenseRecord.groupBy({
        by: ['projectId'],
        where: { companyId, projectId: { in: projectIds }, status: 'RECORDED' },
        _sum: { subtotal: true },
      }),
    ]);

    const totals = new Map<string, { revenue: number; cost: number }>();
    for (const id of projectIds) {
      totals.set(id, { revenue: 0, cost: 0 });
    }
    for (const row of [...invoiceRevs, ...receiptRevs]) {
      if (!row.projectId) continue;
      const cur = totals.get(row.projectId)!;
      cur.revenue += Number(row._sum?.subtotal ?? 0);
    }
    for (const row of projCosts) {
      if (!row.projectId) continue;
      const cur = totals.get(row.projectId)!;
      cur.cost += Number(row._sum?.subtotal ?? 0);
    }
    return totals;
  }

  async profit(companyId: string, id: string) {
    const project = await this.findOne(companyId, id);

    const [sales, expenses] = await this.prisma.$transaction([
      this.prisma.salesDocument.findMany({
        where: {
          companyId,
          projectId: id,
          status: { in: CONFIRMED_SALES_STATUSES },
          OR: [
            { type: { in: ['INVOICE', 'TAX_INVOICE'] } },
            { type: { in: ['RECEIPT', 'RECEIPT_TAX_INVOICE'] }, parentDocumentId: null },
          ],
        },
        select: { subtotal: true, grandTotal: true },
      }),
      this.prisma.expenseRecord.findMany({
        where: { companyId, projectId: id, status: 'RECORDED' },
        select: { subtotal: true, grandTotal: true },
      }),
    ]);

    const revenue = sales.reduce((s, d) => s.plus(d.subtotal), ZERO);
    const revenueGross = sales.reduce((s, d) => s.plus(d.grandTotal), ZERO);
    const cost = expenses.reduce((s, e) => s.plus(e.subtotal), ZERO);
    const costGross = expenses.reduce((s, e) => s.plus(e.grandTotal), ZERO);
    const profit = revenue.minus(cost);
    const marginPercent = revenue.gt(0)
      ? profit.div(revenue).mul(100).toDecimalPlaces(2).toNumber()
      : 0;
    const budget = project.budget ? new Prisma.Decimal(project.budget) : null;

    return {
      projectId: id,
      revenue: revenue.toNumber(),
      revenueGross: revenueGross.toNumber(),
      cost: cost.toNumber(),
      costGross: costGross.toNumber(),
      profit: profit.toNumber(),
      marginPercent,
      budget: budget ? budget.toNumber() : null,
      budgetUsedPercent: budget && budget.gt(0)
        ? costGross.div(budget).mul(100).toDecimalPlaces(2).toNumber()
        : null,
      salesCount: sales.length,
      expenseCount: expenses.length,
    };
  }

  private async resolveCustomer(
    companyId: string,
    customerId: string | undefined,
  ): Promise<string | null> {
    if (!customerId) return null;
    const customer = await this.prisma.partner.findFirst({
      where: {
        id: customerId,
        companyId,
        OR: [{ type: 'CUSTOMER' }, { type: 'BOTH' }],
      },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found or not a customer');
    return customer.id;
  }

  private include() {
    return {
      customer: { select: { id: true, nameTh: true } },
    } satisfies Prisma.ProjectInclude;
  }

  private toDto(
    p: Prisma.ProjectGetPayload<{ include: ReturnType<ProjectsService['include']> }>,
  ) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      customerId: p.customerId,
      customerName: p.customer?.nameTh ?? null,
      status: p.status,
      description: p.description,
      startDate: p.startDate?.toISOString() ?? null,
      endDate: p.endDate?.toISOString() ?? null,
      budget: p.budget?.toString() ?? null,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
