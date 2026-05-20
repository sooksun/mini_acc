import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { DeliveryNotesService } from './delivery-notes.service';
import { CreateSalesDocumentDto } from './dto/create-sales-document.dto';
import { ListSalesDocumentsDto } from './dto/list-sales-documents.dto';
import { VoidDocumentDto } from './dto/void-document.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';

const ENTITY = 'SalesDocument:DELIVERY_NOTE';

@Controller('sales/delivery-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryNotesController {
  constructor(private deliveryNotes: DeliveryNotesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ListSalesDocumentsDto) {
    return this.deliveryNotes.list(user.companyId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deliveryNotes.findOne(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CREATE_DOCUMENT', {
    entityType: ENTITY,
    getEntityId: (_req, res) => res?.id,
    getMetadata: (_req, res) => ({ type: 'DELIVERY_NOTE', number: res?.number, grandTotal: res?.grandTotal }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesDocumentDto) {
    return this.deliveryNotes.create(user.companyId, user.id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CONFIRM_DOCUMENT', {
    entityType: ENTITY,
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (_req, res) => ({ number: res?.number }),
  })
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deliveryNotes.confirm(user.companyId, user.id, user.role, id);
  }

  @Post(':id/create-next')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CREATE_DOCUMENT', {
    entityType: ENTITY,
    getEntityId: (_req, res) => res?.id,
    getMetadata: (req, res) => ({ type: res?.type, number: res?.number, fromId: req.params['id'] }),
  })
  createNext(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deliveryNotes.createNext(user.companyId, user.id, id);
  }

  @Post(':id/void')
  @HttpCode(200)
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('VOID_DOCUMENT', {
    entityType: ENTITY,
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => (req.body as VoidDocumentDto)?.reason,
  })
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidDocumentDto) {
    return this.deliveryNotes.void(user.companyId, user.id, user.role, id, dto.reason);
  }
}
