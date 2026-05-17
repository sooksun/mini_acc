import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5MB — products list is small

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ListProductsDto) {
    return this.products.list(user.companyId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.findOne(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @AuditAction('CREATE_PRODUCT', {
    entityType: 'Product',
    getEntityId: (_req, res) => res?.id,
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.companyId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @AuditAction('UPDATE_PRODUCT', {
    entityType: 'Product',
    getEntityId: (req) => req.params['id'] as string,
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.companyId, id, dto);
  }

  @Get('import/template')
  @Roles('OWNER', 'ADMIN')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.products.buildImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="products-import-template.xlsx"',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }

  @Post('import')
  @Roles('OWNER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  @AuditAction('IMPORT_PRODUCTS', {
    entityType: 'Product',
    getMetadata: (_req, res) => ({
      totalRows: res?.totalRows,
      created: res?.created,
      errors: res?.errors,
    }),
  })
  async import(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('File required');
    if (
      !file.originalname.toLowerCase().endsWith('.xlsx') &&
      !file.originalname.toLowerCase().endsWith('.xls')
    ) {
      throw new BadRequestException('รองรับเฉพาะไฟล์ .xlsx');
    }
    return this.products.importFromExcel(user.companyId, file.buffer);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('OWNER')
  @AuditAction('DEACTIVATE_PRODUCT', {
    entityType: 'Product',
    getEntityId: (req) => req.params['id'] as string,
  })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.deactivate(user.companyId, id);
  }
}
