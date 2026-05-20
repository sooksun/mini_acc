import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Mark a foreign-tax obligation (PP.36) as filed + remitted. Posts the journal
 * (Dr Input VAT / Cr Cash) and snapshots a VatRecord(INPUT) in the filing period.
 */
export class FileForeignTaxObligationDto {
  /** Filing/remittance date. Defaults to the 7th of the filing period. */
  @IsOptional()
  @IsDateString()
  filedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
