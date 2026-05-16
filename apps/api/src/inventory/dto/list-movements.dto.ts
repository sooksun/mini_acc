import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';
import { InventoryMovementType } from '@hj/shared-types';

export class ListMovementsDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(0)
  skip?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(500)
  take?: number;
}
