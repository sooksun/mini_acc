import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser, DocumentType } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { PdfGenerationService } from './pdf-generation.service';
import { SLUG_TO_TYPE } from './pdf-templates/meta';

@Controller('sales-pdf/:type')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PdfController {
  constructor(private pdfGen: PdfGenerationService) {}

  @Get(':id/preview')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  async preview(
    @CurrentUser() user: AuthUser,
    @Param('type') typeSlug: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const type = this.resolveType(typeSlug);
    const buffer = await this.pdfGen.preview(type, user.companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="preview-${id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }

  @Post(':id/generate')
  @HttpCode(202)
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  async generate(
    @CurrentUser() user: AuthUser,
    @Param('type') typeSlug: string,
    @Param('id') id: string,
  ) {
    const type = this.resolveType(typeSlug);
    return this.pdfGen.enqueueGenerate(type, user.companyId, id, user.id);
  }

  @Get(':id/status')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  status(
    @CurrentUser() _user: AuthUser,
    @Param('type') typeSlug: string,
    @Param('id') _id: string,
    @Query('jobId') jobId: string,
  ) {
    this.resolveType(typeSlug); // validate slug
    if (!jobId) throw new NotFoundException('jobId required');
    return this.pdfGen.getJobStatus(jobId);
  }

  @Get(':id/download')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  @AuditAction('DOWNLOAD_PDF', {
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (req) => ({ type: req.params['type'] }),
  })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('type') typeSlug: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const type = this.resolveType(typeSlug);
    const { buffer, fileName } = await this.pdfGen.openStoredPdf(type, user.companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(buffer);
  }

  private resolveType(slug: string): DocumentType {
    const type = SLUG_TO_TYPE[slug];
    if (!type) throw new NotFoundException(`Unknown sales doc type: ${slug}`);
    return type;
  }
}
