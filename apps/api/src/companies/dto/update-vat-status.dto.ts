import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VatStatus } from '@hj/shared-types';

export class UpdateVatStatusDto {
  @IsEnum(VatStatus)
  status!: VatStatus;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
