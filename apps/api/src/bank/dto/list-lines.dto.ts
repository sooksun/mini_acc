import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListBankLinesDto {
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /**
   * Filter to lines that need attention:
   *   - "unmatched": no matchedPaymentId
   *   - "matched": has matchedPaymentId
   *   - omitted: all
   */
  @IsOptional()
  @IsString()
  matchStatus?: 'unmatched' | 'matched';

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
