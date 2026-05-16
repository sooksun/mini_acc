import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';
import { AiInboxService } from './ai-inbox.service';
import { AcceptSuggestionDto } from './dto/accept-suggestion.dto';
import { ListSuggestionsDto } from './dto/list-suggestions.dto';
import { RejectSuggestionDto } from './dto/reject-suggestion.dto';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;

@Controller('ai-inbox')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiInboxController {
  constructor(private inbox: AiInboxService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  list(@CurrentUser() user: AuthUser, @Query() dto: ListSuggestionsDto) {
    return this.inbox.list(user.companyId, dto);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inbox.findOne(user.companyId, id);
  }

  @Get(':id/file')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, originalFileName } = await this.inbox.readStagedFile(
      user.companyId,
      id,
    );
    const safeName = originalFileName.replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.end(buffer);
  }

  @Post('upload')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @AuditAction('AI_EXTRACT_DOCUMENT', {
    entityType: 'AiSuggestion',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (_req, res) => ({ confidence: res?.confidence, model: res?.model }),
  })
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: any) {
    return this.inbox.upload(user.companyId, user.id, file);
  }

  @Post(':id/accept')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('AI_ACCEPT_SUGGESTION', {
    entityType: 'AiSuggestion',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (_req, res) => ({ receiptId: res?.receipt?.id }),
  })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcceptSuggestionDto,
  ) {
    return this.inbox.accept(user.companyId, user.id, id, dto);
  }

  @Post(':id/reject')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('AI_REJECT_SUGGESTION', {
    entityType: 'AiSuggestion',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.reason,
  })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectSuggestionDto,
  ) {
    return this.inbox.reject(user.companyId, user.id, id, dto);
  }
}
