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
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { ListPartnersDto } from './dto/list-partners.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';

@Controller('partners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PartnersController {
  constructor(private partners: PartnersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ListPartnersDto) {
    return this.partners.list(user.companyId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.partners.findOne(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CREATE_PARTNER', {
    entityType: 'Partner',
    getEntityId: (_req, res) => res?.id,
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePartnerDto) {
    return this.partners.create(user.companyId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @AuditAction('UPDATE_PARTNER', {
    entityType: 'Partner',
    getEntityId: (req) => req.params['id'] as string,
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partners.update(user.companyId, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('OWNER')
  @AuditAction('DEACTIVATE_PARTNER', {
    entityType: 'Partner',
    getEntityId: (req) => req.params['id'] as string,
  })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.partners.deactivate(user.companyId, id);
  }
}
