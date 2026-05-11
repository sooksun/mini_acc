import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
