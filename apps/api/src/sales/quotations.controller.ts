import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { QuotationsService } from './quotations.service';
import { CreateSalesDocumentDto } from './dto/create-sales-document.dto';
import { ListSalesDocumentsDto } from './dto/list-sales-documents.dto';
import { VoidDocumentDto } from './dto/void-document.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';

@Controller('sales/quotations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotationsController {
  constructor(private quotations: QuotationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ListSalesDocumentsDto) {
    return this.quotations.list(user.companyId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotations.findOne(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CREATE_DOCUMENT', {
    entityType: 'SalesDocument:QUOTATION',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (_req, res) => ({
      type: 'QUOTATION',
      number: res?.number,
      grandTotal: res?.grandTotal,
    }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesDocumentDto) {
    return this.quotations.create(user.companyId, user.id, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @AuditAction('UPDATE_DOCUMENT', {
    entityType: 'SalesDocument:QUOTATION',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (req, res) => ({
      type: 'QUOTATION',
      number: res?.number,
      itemCount: req.body?.items?.length,
      grandTotal: res?.grandTotal,
    }),
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSalesDocumentDto,
  ) {
    return this.quotations.update(user.companyId, id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CONFIRM_DOCUMENT', {
    entityType: 'SalesDocument:QUOTATION',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (_req, res) => ({ number: res?.number }),
  })
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotations.confirm(user.companyId, user.id, user.role, id);
  }

  @Post(':id/create-next')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CREATE_DOCUMENT', {
    entityType: 'SalesDocument:QUOTATION',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (req, res) => ({ type: res?.type, number: res?.number, fromId: req.params['id'] }),
  })
  createNext(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotations.createNext(user.companyId, user.id, id);
  }

  @Post(':id/void')
  @HttpCode(200)
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('VOID_DOCUMENT', {
    entityType: 'SalesDocument:QUOTATION',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => (req.body as VoidDocumentDto)?.reason,
  })
  void(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VoidDocumentDto,
  ) {
    return this.quotations.void(user.companyId, user.id, user.role, id, dto.reason);
  }
}
