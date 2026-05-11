import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ProductType } from '@hj/shared-types';

export class CreateProductDto {
  @IsEnum(ProductType)
  type!: ProductType;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsString()
  @MaxLength(200)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MaxLength(32)
  unit!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsBoolean()
  vatable?: boolean;
}
