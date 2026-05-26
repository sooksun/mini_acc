import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ProductType } from '@hj/shared-types';

const PRODUCT_TYPES: ProductType[] = ['GOOD', 'SERVICE', 'MATERIAL', 'ASSET'];

export class FromReceiptItemDto {
  /** EXISTING → reuse productId; NEW → create a catalog product from these fields. */
  @IsIn(['EXISTING', 'NEW'])
  decision!: 'EXISTING' | 'NEW';

  /** Required when decision = EXISTING. */
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MaxLength(200)
  nameTh!: string;

  @IsString()
  @MaxLength(32)
  unit!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity!: number;

  /** Final SELL unit price (markup already applied; owner may have edited it). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  /** Product type for a NEW catalog product. Defaults to GOOD. */
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: ProductType;

  @IsOptional()
  @IsBoolean()
  vatable?: boolean;
}

export class CreateQuotationFromReceiptsDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsDateString()
  documentDate!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  whtRate?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FromReceiptItemDto)
  items!: FromReceiptItemDto[];
}
