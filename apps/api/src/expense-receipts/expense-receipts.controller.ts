import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { ExpenseReceiptsService } from './expense-receipts.service';
import { UploadExpenseReceiptDto } from './dto/upload-expense-receipt.dto';
import { UpdateExpenseReceiptDto } from './dto/update-expense-receipt.dto';
import { ListExpenseReceiptsDto } from './dto/list-expense-receipts.dto';
import { LinkExpenseVendorDto } from './dto/link-expense-vendor.dto';
import { ApproveExpenseVendorDto } from './dto/approve-expense-vendor.dto';
import { RejectExpenseReceiptDto } from './dto/reject-expense-receipt.dto';

// H8: read MAX_UPLOAD_MB from env so .env.example and FileInterceptor agree.
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;

@Controller('expense-receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpenseReceiptsController {
  constructor(private expenseReceipts: ExpenseReceiptsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ListExpenseReceiptsDto) {
    return this.expenseReceipts.list(user.companyId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expenseReceipts.findOne(user.companyId, id);
  }

  @Get(':id/file')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  @AuditAction('DOWNLOAD_EXPENSE_RECEIPT', {
    entityType: 'ExpenseReceipt',
    getEntityId: (req) => req.params['id'] as string,
  })
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, originalFileName, mimeType } =
      await this.expenseReceipts.readStoredFile(user.companyId, id);
    const safeName = originalFileName.replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.end(buffer);
  }

  @Post('upload')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @AuditAction('UPLOAD_EXPENSE_RECEIPT', {
    entityType: 'ExpenseReceipt',
    getEntityId: (_req, res) => res?.id,
    getMetadata: (_req, res) => ({
      status: res?.status,
      vendorId: res?.vendorId,
      proposedVendorTaxId: res?.proposedVendorTaxId,
    }),
  })
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadExpenseReceiptDto,
    @UploadedFile() file?: any,
  ) {
    return this.expenseReceipts.upload(user.companyId, user.id, dto, file);
  }

  @Post('ai-extract')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @AuditAction('AI_EXTRACT_DOCUMENT', {
    entityType: 'ExpenseReceipt',
    getMetadata: (_req, res) => ({
      sourceFile: res?.sourceFile?.name,
      mimeType: res?.sourceFile?.mimeType,
    }),
  })
  aiExtract(@UploadedFile() file?: any) {
    return this.expenseReceipts.aiExtract(file);
  }

  @Post(':id/link-vendor')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('LINK_EXPENSE_VENDOR', {
    entityType: 'ExpenseReceipt',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (req) => ({ vendorId: req.body?.vendorId }),
  })
  linkVendor(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LinkExpenseVendorDto,
  ) {
    return this.expenseReceipts.linkVendor(user.companyId, user.id, user.role, id, dto);
  }

  @Post(':id/approve-vendor')
  @Roles('OWNER', 'ADMIN')
  @AuditAction('APPROVE_EXPENSE_VENDOR', {
    entityType: 'ExpenseReceipt',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (req, res) => ({ vendorId: res?.vendorId, requestedVendorId: req.body?.vendorId }),
  })
  approveVendor(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveExpenseVendorDto,
  ) {
    return this.expenseReceipts.approveVendor(user.companyId, user.id, user.role, id, dto);
  }

  @Post(':id/account')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('RECORD_EXPENSE', {
    entityType: 'ExpenseReceipt',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (_req, res) => ({ expenseRecordId: res?.expenseRecord?.id, vendorId: res?.vendorId }),
  })
  account(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expenseReceipts.account(user.companyId, user.id, user.role, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('UPDATE_EXPENSE_RECEIPT', {
    entityType: 'ExpenseReceipt',
    getEntityId: (req) => req.params['id'] as string,
    getMetadata: (_req, res) => ({ status: res?.status, grandTotal: res?.grandTotal }),
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseReceiptDto,
  ) {
    return this.expenseReceipts.update(user.companyId, id, dto);
  }

  @Post(':id/reject')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @AuditAction('REJECT_EXPENSE_RECEIPT', {
    entityType: 'ExpenseReceipt',
    getEntityId: (req) => req.params['id'] as string,
    getReason: (req) => req.body?.reason,
  })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectExpenseReceiptDto,
  ) {
    return this.expenseReceipts.reject(user.companyId, user.id, user.role, id, dto);
  }
}
