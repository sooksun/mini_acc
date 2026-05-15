import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class UpdateNumberingRuleDto {
  /**
   * Document number prefix (e.g. "QT", "INV"). Letters/digits only, 1-8 chars
   * to match the schema column.
   */
  @IsOptional()
  @Matches(/^[A-Z0-9]{1,8}$/, {
    message: 'prefix ต้องเป็นอักษรภาษาอังกฤษพิมพ์ใหญ่หรือเลข 1-8 ตัว',
  })
  prefix?: string;

  /** Zero-padding width for the running number (e.g. 4 → "0001"). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  padding?: number;

  /** Reset cadence. YEARLY = new counter every BE year; NEVER = lifetime. */
  @IsOptional()
  @IsEnum({ YEARLY: 'YEARLY', NEVER: 'NEVER' })
  resetPolicy?: 'YEARLY' | 'NEVER';
}
