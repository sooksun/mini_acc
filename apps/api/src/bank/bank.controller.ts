import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { BankService } from './bank.service';
import { ImportBankStatementDto } from './dto/import-statement.dto';
import { ListBankLinesDto } from './dto/list-lines.dto';
import { MatchLineDto } from './dto/match-line.dto';

@Controller('bank')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankController {
  constructor(private bank: BankService) {}

  @Get('lines')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser, @Query() dto: ListBankLinesDto) {
    return this.bank.list(user.companyId, dto);
  }

  @Get('lines/:id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bank.findOne(user.companyId, id);
  }

  @Get('lines/:id/candidates')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  candidates(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bank.candidatesForLine(user.companyId, id);
  }

  @Post('import')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('IMPORT_BANK_STATEMENT', {
    entityType: 'BankStatementLine',
    getEntityId: (_req, res) => res?.importBatchId,
    getMetadata: (_req, res) => ({
      imported: res?.imported,
      autoMatched: res?.autoMatched,
      unmatched: res?.unmatched,
    }),
  })
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportBankStatementDto) {
    return this.bank.importStatement(user.companyId, user.id, dto);
  }

  @Post('lines/:id/match')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('MATCH_BANK_LINE', {
    entityType: 'BankStatementLine',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (req) => ({ paymentId: req.body?.paymentId }),
  })
  match(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MatchLineDto,
  ) {
    return this.bank.matchLine(user.companyId, user.id, id, dto.paymentId);
  }

  @Post('lines/:id/unmatch')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('UNMATCH_BANK_LINE', {
    entityType: 'BankStatementLine',
    getEntityId: (req) => req.params['id'] as string,
  })
  unmatch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bank.unmatchLine(user.companyId, id);
  }
}
