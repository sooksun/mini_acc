import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser, @Query() dto: ListPaymentsDto) {
    return this.payments.list(user.companyId, dto);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.findOne(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('CREATE_PAYMENT', {
    entityType: 'Payment',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (req, res) => ({
      direction: req.body?.direction,
      amount: req.body?.amount,
      whtAmount: req.body?.whtAmount,
      hasWhtRecord: !!res?.whtRecord,
    }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.payments.create(user.companyId, user.id, dto);
  }

  @Post(':id/void')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('VOID_PAYMENT', {
    entityType: 'Payment',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.reason,
  })
  voidPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VoidPaymentDto,
  ) {
    return this.payments.voidPayment(user.companyId, user.id, user.role, id, dto);
  }
}
