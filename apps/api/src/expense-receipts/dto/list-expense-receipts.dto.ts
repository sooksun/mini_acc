import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';
import { ExpenseReceiptStatus } from '@hj/shared-types';

export class ListExpenseReceiptsDto {
  @IsOptional()
  @IsEnum(ExpenseReceiptStatus)
  status?: ExpenseReceiptStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeAccounted?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(0)
  skip?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(200)
  take?: number;
}
