import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RiskItemStatus, RiskItemType, RiskLevel } from '@hj/shared-types';

export class ListRisksDto {
  @IsOptional()
  @IsEnum(RiskItemStatus)
  status?: RiskItemStatus;

  @IsOptional()
  @IsEnum(RiskItemType)
  type?: RiskItemType;

  @IsOptional()
  @IsEnum(RiskLevel)
  level?: RiskLevel;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

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
