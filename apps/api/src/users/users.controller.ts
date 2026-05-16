import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  list(@CurrentUser() user: AuthUser) {
    return this.users.listByCompany(user.companyId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CREATE_USER', {
    entityType: 'User',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (req) => ({ role: req.body?.role, email: req.body?.email }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user.companyId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @AuditAction('UPDATE_USER', {
    entityType: 'User',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (req) => ({
      role: req.body?.role,
      isActive: req.body?.isActive,
      passwordReset: !!req.body?.password,
    }),
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user.companyId, id, user.id, dto);
  }
}
