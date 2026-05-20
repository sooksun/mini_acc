import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, Max, Min } from 'class-validator';
import { ForeignTaxKind, ForeignTaxStatus } from '@hj/shared-types';

export class ListForeignTaxObligationsDto {
  @IsOptional()
  @IsEnum(ForeignTaxStatus)
  status?: ForeignTaxStatus;

  @IsOptional()
  @IsEnum(ForeignTaxKind)
  kind?: ForeignTaxKind;

  /** Filter by filing period (the month the form is due). */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(12)
  month?: number;

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
