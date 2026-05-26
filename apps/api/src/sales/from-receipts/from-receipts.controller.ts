import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditAction } from '../../audit-log/audit-log.decorator';
import { FromReceiptsService } from './from-receipts.service';
import { ExtractFromReceiptsDto } from './dto/extract-from-receipts.dto';
import { CreateQuotationFromReceiptsDto } from './dto/create-from-receipts.dto';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
const MAX_FILES = 20;

type MulterFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/**
 * Build a quotation from uploaded purchase receipts (OWNER only — a buy-and-
 * resell shortcut). Two steps so the owner reviews AI output before anything is
 * written: POST /extract (advisory, no writes) → POST /quotation (creates new
 * catalog products + a DRAFT quotation, returns its id for the edit redirect).
 */
@Controller('sales/from-receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FromReceiptsController {
  constructor(private fromReceipts: FromReceiptsService) {}

  @Post('extract')
  @Roles('OWNER')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @AuditAction('AI_EXTRACT_DOCUMENT', {
    entityType: 'QuotationFromReceipts',
    getMetadata: (_req, res) => ({ items: res?.items?.length, mocked: res?.mocked }),
  })
  extract(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExtractFromReceiptsDto,
    @UploadedFiles() files?: MulterFile[],
  ) {
    return this.fromReceipts.extract(user.companyId, files, dto.markupPercent);
  }

  @Post('quotation')
  @Roles('OWNER')
  @AuditAction('CREATE_DOCUMENT', {
    entityType: 'SalesDocument:QUOTATION',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (_req, res) => ({
      type: 'QUOTATION',
      number: res?.number,
      source: 'FROM_RECEIPTS',
    }),
  })
  createQuotation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateQuotationFromReceiptsDto,
  ) {
    return this.fromReceipts.createQuotation(user.companyId, user.id, dto);
  }
}
