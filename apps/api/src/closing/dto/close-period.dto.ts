import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ClosePeriodDto {
  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ReopenPeriodDto {
  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}
