import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
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
   * Build the pack for a LOCKED period, persist it as an ExportBatch (PRD §18),
   * and stream the ZIP back for immediate download. The persisted copy can be
   * re-fetched later via GET :id/download.
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
    const { filename, buffer } = await this.pack.exportPack(
      user.companyId,
      dto.year,
      dto.month,
      user.id,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }

  /** Export history for the company (most recent first). */
  @Get('batches')
  @Roles('OWNER', 'ACCOUNTANT', 'ADMIN', 'VIEWER')
  listBatches(@CurrentUser() user: AuthUser) {
    return this.pack.listBatches(user.companyId);
  }

  /** Re-download a previously exported pack. */
  @Get(':id/download')
  @Roles('OWNER', 'ACCOUNTANT')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { filename, buffer } = await this.pack.downloadBatch(user.companyId, id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }
}
