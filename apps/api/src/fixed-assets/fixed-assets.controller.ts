import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { FixedAssetsService } from './fixed-assets.service';
import { CreateFixedAssetDto } from './dto/create-asset.dto';
import { DisposeAssetDto } from './dto/dispose-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

@Controller('fixed-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FixedAssetsController {
  constructor(private assets: FixedAssetsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser, @Query() dto: ListAssetsDto) {
    return this.assets.list(user.companyId, dto);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assets.findOne(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('CREATE_FIXED_ASSET', {
    entityType: 'FixedAsset',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (req) => ({
      name: req.body?.name,
      category: req.body?.category,
      cost: req.body?.cost,
    }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFixedAssetDto) {
    return this.assets.create(user.companyId, user.id, dto);
  }

  @Post(':id/dispose')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('DISPOSE_FIXED_ASSET', {
    entityType: 'FixedAsset',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.reason,
  })
  dispose(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DisposeAssetDto,
  ) {
    return this.assets.dispose(user.companyId, user.id, id, dto);
  }

  @Post('depreciate-all')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('RUN_DEPRECIATION', {
    entityType: 'FixedAsset',
    getMetadata: (_req, res) => ({
      assetsUpdated: res?.assetsUpdated,
      asOf: res?.asOf,
    }),
  })
  depreciate(@CurrentUser() user: AuthUser) {
    return this.assets.runDepreciation(user.companyId, user.id);
  }
}
