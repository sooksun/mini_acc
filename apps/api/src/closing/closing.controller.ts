import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { ClosingService } from './closing.service';
import { ClosePeriodDto, ReopenPeriodDto } from './dto/close-period.dto';

@Controller('closing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClosingController {
  constructor(private closing: ClosingService) {}

  @Get('periods')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser) {
    return this.closing.listPeriods(user.companyId);
  }

  @Get(':year/:month/check')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  check(
    @CurrentUser() user: AuthUser,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.closing.checkPeriod(user.companyId, year, month);
  }

  @Post('close')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('CLOSE_PERIOD', {
    entityType: 'AccountingPeriod',
    getEntityId: (req) => `${req.body?.year}-${String(req.body?.month).padStart(2, '0')}`,
    getMetadata: (req) => ({ year: req.body?.year, month: req.body?.month }),
  })
  close(@CurrentUser() user: AuthUser, @Body() dto: ClosePeriodDto) {
    return this.closing.closePeriod(user.companyId, user.id, user.role, dto);
  }

  @Post('reopen')
  @Roles('OWNER')
  @AuditAction('REOPEN_PERIOD', {
    entityType: 'AccountingPeriod',
    getEntityId: (req) => `${req.body?.year}-${String(req.body?.month).padStart(2, '0')}`,
    getReason: (req) => req.body?.reason,
    getMetadata: (req) => ({ year: req.body?.year, month: req.body?.month }),
  })
  reopen(@CurrentUser() user: AuthUser, @Body() dto: ReopenPeriodDto) {
    return this.closing.reopenPeriod(user.companyId, user.id, user.role, dto);
  }
}
