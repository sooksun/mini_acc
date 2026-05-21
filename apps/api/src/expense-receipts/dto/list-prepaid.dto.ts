import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, Max, Min } from 'class-validator';
import { PrepaidScheduleStatus } from '@hj/shared-types';

export class ListPrepaidDto {
  @IsOptional()
  @IsEnum(PrepaidScheduleStatus)
  status?: PrepaidScheduleStatus;

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
  @Max(1000)
  take?: number;
}
