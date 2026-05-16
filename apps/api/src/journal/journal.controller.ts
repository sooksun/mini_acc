import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { JournalService } from './journal.service';
import { ListJournalDto } from './dto/list-journal.dto';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto';

@Controller('journal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JournalController {
  constructor(private journal: JournalService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser, @Query() dto: ListJournalDto) {
    return this.journal.list(user.companyId, dto);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.journal.findOne(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('CREATE_JOURNAL', {
    entityType: 'JournalEntry',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (req) => ({
      sourceType: req.body?.sourceType,
      sourceId: req.body?.sourceId,
      lineCount: req.body?.lines?.length,
    }),
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: PostJournalEntryDto) {
    return this.journal.post({
      companyId: user.companyId,
      userId: user.id,
      entryDate: dto.entryDate,
      description: dto.description,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId ?? null,
      lines: dto.lines.map((line) => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: line.debit ?? 0,
        credit: line.credit ?? 0,
        partnerId: line.partnerId ?? null,
        projectId: line.projectId ?? null,
        description: line.description ?? null,
      })),
    });
  }

  @Post(':id/void')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('VOID_JOURNAL', {
    entityType: 'JournalEntry',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.reason,
  })
  voidEntry(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.journal.voidEntry(user.companyId, id, user.id, body.reason);
  }
}
