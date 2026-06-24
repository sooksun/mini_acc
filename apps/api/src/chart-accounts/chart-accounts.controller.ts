import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccountType } from '@prisma/client';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { ChartAccountsService } from './chart-accounts.service';
import { CreateChartAccountDto } from './dto/create-chart-account.dto';
import { UpdateChartAccountDto } from './dto/update-chart-account.dto';

@Controller('chart-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChartAccountsController {
  constructor(private readonly chart: ChartAccountsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(
    @CurrentUser() user: AuthUser,
    @Query('activeOnly') activeOnly?: string,
    @Query('type') type?: AccountType,
  ) {
    return this.chart.list(user.companyId, {
      activeOnly: activeOnly === 'true' || activeOnly === '1',
      type: type && type in AccountType ? type : undefined,
    });
  }

  @Post()
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('CREATE_CHART_ACCOUNT', {
    entityType: 'ChartAccount',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (_req, res) => ({ code: res?.code, name: res?.name, type: res?.type }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChartAccountDto) {
    return this.chart.create(user.companyId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('UPDATE_CHART_ACCOUNT', {
    entityType: 'ChartAccount',
    getEntityId: (req) => String(req.params.id),
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateChartAccountDto,
  ) {
    return this.chart.update(user.companyId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('DELETE_CHART_ACCOUNT', {
    entityType: 'ChartAccount',
    getEntityId: (req) => String(req.params.id),
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chart.remove(user.companyId, id);
  }
}
