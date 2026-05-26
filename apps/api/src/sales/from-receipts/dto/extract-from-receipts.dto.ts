import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ExtractFromReceiptsDto {
  /**
   * Override the company default markup %. Arrives as a string in multipart, so
   * @Type coerces it (global ValidationPipe has transform: true). Omitted →
   * service falls back to Company.defaultMarkupPercent.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  markupPercent?: number;
}
