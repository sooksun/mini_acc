import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';
import { FixedAssetStatus } from '@hj/shared-types';

export class ListAssetsDto {
  @IsOptional()
  @IsEnum(FixedAssetStatus)
  status?: FixedAssetStatus;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;

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
