import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Recognize prepaid expense up to (and including) this period. */
export class RunPrepaidDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
