import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// 13 Thai digits, no separators. We strip dashes/spaces in the Transform so users
// can paste "0573-5670-01472" or "0573 567 001472" and still pass validation.
const THAI_TAX_ID = /^\d{13}$/;
// Plain decimal string: optional sign, integer part, optional 1-2 decimal places.
// We strip commas so frontend can send formatted input like "1,234.56".
const MONEY = /^-?\d+(\.\d{1,2})?$/;

const stripTaxIdSeparators = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

const stripMoneySeparators = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/,/g, '').trim() : value;

export class UploadExpenseReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @IsOptional()
  @Transform(stripTaxIdSeparators)
  @IsString()
  @Matches(THAI_TAX_ID, { message: 'vendorTaxId ต้องเป็นเลขผู้เสียภาษีไทย 13 หลัก' })
  vendorTaxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendorBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vendorAddress?: string;

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
  @Transform(stripMoneySeparators)
  @IsString()
  @Matches(MONEY, { message: 'subtotal ต้องเป็นจำนวนเงิน เช่น 1234.56' })
  subtotal?: string;

  @IsOptional()
  @Transform(stripMoneySeparators)
  @IsString()
  @Matches(MONEY, { message: 'vatAmount ต้องเป็นจำนวนเงิน เช่น 84.00' })
  vatAmount?: string;

  @IsOptional()
  @Transform(stripMoneySeparators)
  @IsString()
  @Matches(MONEY, { message: 'withholdingTaxAmount ต้องเป็นจำนวนเงิน เช่น 12.00' })
  withholdingTaxAmount?: string;

  @IsOptional()
  @Transform(stripMoneySeparators)
  @IsString()
  @Matches(MONEY, { message: 'grandTotal ต้องเป็นจำนวนเงิน เช่น 1306.56' })
  grandTotal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
