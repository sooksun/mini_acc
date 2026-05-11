import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SalesDocumentItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  productCode?: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @MaxLength(32)
  unit!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsBoolean()
  vatable?: boolean;
}
