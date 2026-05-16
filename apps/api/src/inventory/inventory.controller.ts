import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { InventoryService } from './inventory.service';
import { CreateInventoryMovementDto } from './dto/create-movement.dto';
import { ListMovementsDto } from './dto/list-movements.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get('movements')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser, @Query() dto: ListMovementsDto) {
    return this.inventory.list(user.companyId, dto);
  }

  @Get('stock-summary')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  summary(@CurrentUser() user: AuthUser) {
    return this.inventory.stockSummary(user.companyId);
  }

  @Get('stock-on-hand/:productId')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  async stockOnHand(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    const onHand = await this.inventory.stockOnHand(user.companyId, productId);
    return { productId, onHand: onHand.toString() };
  }

  @Post('movements')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('CREATE_INVENTORY_MOVEMENT', {
    entityType: 'InventoryMovement',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (req, res) => ({
      productId: req.body?.productId,
      type: req.body?.type,
      quantity: req.body?.quantity,
      referenceType: res?.referenceType,
    }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInventoryMovementDto) {
    return this.inventory.create(user.companyId, user.id, dto);
  }
}
