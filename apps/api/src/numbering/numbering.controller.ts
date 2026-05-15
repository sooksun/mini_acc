import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser, DocumentType } from '@hj/shared-types';
import { NumberingService } from './numbering.service';
import { PeekNumberDto } from './dto/peek.dto';
import { UpdateNumberingRuleDto } from './dto/update-rule.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { PrismaService } from '../prisma/prisma.service';

const VALID_TYPES = new Set<DocumentType>([
  'QUOTATION',
  'INVOICE',
  'DELIVERY_NOTE',
  'RECEIPT',
  'TAX_INVOICE',
  'RECEIPT_TAX_INVOICE',
]);

@Controller('numbering')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NumberingController {
  constructor(
    private numbering: NumberingService,
    private prisma: PrismaService,
  ) {}

  @Get('rules')
  async rules(@CurrentUser() user: AuthUser) {
    const rules = await this.prisma.documentNumberingRule.findMany({
      where: { companyId: user.companyId },
      orderBy: { type: 'asc' },
    });
    const counters = await this.prisma.documentNumberingCounter.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ type: 'asc' }, { beYear: 'desc' }],
    });
    return rules.map((r) => ({
      ...r,
      counters: counters.filter((c) => c.type === r.type),
    }));
  }

  @Patch('rules/:type')
  @Roles('OWNER', 'ADMIN')
  @AuditAction('UPDATE_DOCUMENT_NUMBERING_RULE', {
    entityType: 'DocumentNumberingRule',
    getEntityId: (req) => req.params['type'] as string,
    getMetadata: (req) => ({
      prefix: req.body?.prefix,
      padding: req.body?.padding,
      resetPolicy: req.body?.resetPolicy,
    }),
  })
  async updateRule(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: UpdateNumberingRuleDto,
  ) {
    if (!VALID_TYPES.has(type as DocumentType)) {
      throw new NotFoundException(`Unknown document type: ${type}`);
    }
    const rule = await this.prisma.documentNumberingRule.findUnique({
      where: { companyId_type: { companyId: user.companyId, type: type as DocumentType } },
    });
    if (!rule) {
      throw new NotFoundException(`No numbering rule for type ${type}`);
    }
    return this.prisma.documentNumberingRule.update({
      where: { id: rule.id },
      data: {
        prefix: dto.prefix ?? rule.prefix,
        padding: dto.padding ?? rule.padding,
        resetPolicy: dto.resetPolicy ?? rule.resetPolicy,
      },
    });
  }

  @Post('peek')
  async peek(@CurrentUser() user: AuthUser, @Body() dto: PeekNumberDto) {
    const number = await this.numbering.peek(user.companyId, dto.type, dto.documentDate);
    return { number };
  }
}
