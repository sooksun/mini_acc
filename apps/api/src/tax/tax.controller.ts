import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { TaxService } from './tax.service';
import { WhtPdfService } from './wht-pdf.service';
import { PeriodFilterDto } from './dto/period-filter.dto';
import type { PndForm } from './templates/wht-shared';

@Controller('tax')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxController {
  constructor(
    private tax: TaxService,
    private whtPdf: WhtPdfService,
  ) {}

  @Get('dashboard')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  dashboard(@CurrentUser() user: AuthUser, @Query() filter: PeriodFilterDto) {
    return this.tax.dashboard(user.companyId, filter);
  }

  @Get('vat-report')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  vatReport(@CurrentUser() user: AuthUser, @Query() filter: PeriodFilterDto) {
    return this.tax.vatReport(user.companyId, filter);
  }

  @Get('wht-report')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  whtReport(@CurrentUser() user: AuthUser, @Query() filter: PeriodFilterDto) {
    return this.tax.whtReport(user.companyId, filter);
  }

  /**
   * Per-period count split between ภ.ง.ด.3 (individual) and ภ.ง.ด.53 (juristic).
   * Frontend uses this to know which forms to offer + how many records each will have.
   */
  @Get('wht/pnd-summary/:year/:month/preview')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  pndSplitPreview(
    @CurrentUser() user: AuthUser,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.whtPdf.periodSplit(user.companyId, year, month);
  }

  /**
   * Generate the หนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) PDF for one WHT record.
   * Stream 3 pages: ต้นฉบับ + 2 สำเนา so the accountant can keep one and hand
   * the other 2 to the vendor for their own filing.
   */
  @Get('wht/certificate/:id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('GENERATE_WHT_CERTIFICATE', {
    entityType: 'WithholdingTaxRecord',
    getEntityId: (req) => req.params['id'] as string,
  })
  async certificate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.whtPdf.renderCertificate(user.companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.end(buffer);
  }

  /**
   * Generate the monthly ภ.ง.ด.3 or ภ.ง.ด.53 attachment PDF — what the
   * accountant submits to the Revenue Department alongside the cash transfer.
   */
  @Get('wht/pnd-summary/:year/:month/:form')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('GENERATE_PND_SUMMARY', {
    entityType: 'WithholdingTaxRecord',
    getEntityId: (req) =>
      `${req.params['form']}-${req.params['year']}-${String(req.params['month']).padStart(2, '0')}`,
    getMetadata: (req, res) => ({
      form: req.params['form'],
      year: Number(req.params['year']),
      month: Number(req.params['month']),
      recordCount: res?.recordCount,
    }),
  })
  async pndSummary(
    @CurrentUser() user: AuthUser,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Param('form') formParam: string,
    @Res() res: Response,
  ) {
    const form = formParam.toUpperCase();
    if (form !== 'PND3' && form !== 'PND53') {
      throw new BadRequestException('form must be PND3 or PND53');
    }
    const { buffer, fileName } = await this.whtPdf.renderPndSummary(
      user.companyId,
      year,
      month,
      form as PndForm,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.end(buffer);
  }
}
