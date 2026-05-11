import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ProductType } from '@hj/shared-types';

export class UpdateProductDto {
  @IsOptional() @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional() @IsString() @MaxLength(32)
  code?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameTh?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(32)
  unit?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  unitPrice?: number;

  @IsOptional() @IsBoolean()
  vatable?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
