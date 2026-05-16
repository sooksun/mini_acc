import { IsInt, Max, Min } from 'class-validator';

export class ExportPackDto {
  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
