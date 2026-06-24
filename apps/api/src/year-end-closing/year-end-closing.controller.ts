import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { YearEndClosingService } from './year-end-closing.service';
import { ReopenYearDto } from './dto/reopen-year.dto';

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequestException({ code: 'BAD_YEAR', year });
  }
}

@Controller('year-end-closing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class YearEndClosingController {
  constructor(private readonly closing: YearEndClosingService) {}

  /** Preview + whether the fiscal year is already closed. */
  @Get(':year/status')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  status(@CurrentUser() user: AuthUser, @Param('year', ParseIntPipe) year: number) {
    assertYear(year);
    return this.closing.status(user.companyId, year);
  }

  /** Post the year-end closing entry (revenue/expense → retained earnings). */
  @Post(':year/close')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('CLOSE_YEAR', {
    entityType: 'YearEndClosing',
    getEntityId: (req) => String(req.params.year),
    getMetadata: (_req, res) => ({ netProfit: res?.netProfit, closingEntryId: res?.closingEntryId }),
  })
  close(@CurrentUser() user: AuthUser, @Param('year', ParseIntPipe) year: number) {
    assertYear(year);
    return this.closing.close(user.companyId, user.id, year);
  }

  /** Void the closing entry to reopen the year (requires a reason). */
  @Post(':year/reopen')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('REOPEN_YEAR', {
    entityType: 'YearEndClosing',
    getEntityId: (req) => String(req.params.year),
    getReason: (req) => req.body?.reason,
  })
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: ReopenYearDto,
  ) {
    assertYear(year);
    return this.closing.reopen(user.companyId, user.id, year, dto.reason);
  }
}
