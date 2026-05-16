import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const MONEY = /^-?\d+(\.\d{1,2})?$/;
const stripCommas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
const stripTaxId = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

/**
 * Operator's corrected version of the AI extract. All fields override the
 * suggestion's payload; missing fields fall back to the AI's value or null.
 * The accept materializes into an ExpenseReceipt — so the shape mirrors
 * UploadExpenseReceiptDto for the relevant fields.
 */
export class AcceptSuggestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @IsOptional()
  @Transform(stripTaxId)
  @IsString()
  @Matches(/^\d{13}$/, { message: 'vendorTaxId ต้องเป็น 13 หลัก' })
  vendorTaxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY)
  subtotal?: string;

  @IsOptional()
  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY)
  vatAmount?: string;

  @IsOptional()
  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY)
  withholdingTaxAmount?: string;

  @IsOptional()
  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY)
  grandTotal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
