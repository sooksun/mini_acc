import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { AccountantPackService } from './accountant-pack.service';
import { ExportPackDto } from './dto/export-pack.dto';

@Controller('accountant-pack')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountantPackController {
  constructor(private pack: AccountantPackService) {}

  /**
   * Stream the ZIP directly into the HTTP response. We don't store the file
   * on disk — every export is fresh from the current data (which, since the
   * period is LOCKED, can't have changed since the last call). If we ever
   * need download history, persist the byte count via ExportBatch.
   */
  @Post('export')
  @Roles('OWNER', 'ACCOUNTANT')
  @AuditAction('EXPORT_ACCOUNTANT_PACK', {
    entityType: 'AccountingPeriod',
    getEntityId: (req) => `${req.body?.year}-${String(req.body?.month).padStart(2, '0')}`,
    getMetadata: (req) => ({ year: req.body?.year, month: req.body?.month }),
  })
  async export(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExportPackDto,
    @Res() res: Response,
  ) {
    const { filename, stream } = await this.pack.exportPack(user.companyId, dto.year, dto.month);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }
}
