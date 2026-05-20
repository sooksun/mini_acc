import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// 13 Thai digits, no separators. We strip dashes/spaces in the Transform so users
// can paste "0573-5670-01472" or "0573 567 001472" and still pass validation.
const THAI_TAX_ID = /^\d{13}$/;
// Plain decimal string: optional sign, integer part, optional 1-2 decimal places.
// We strip commas so frontend can send formatted input like "1,234.56".
const MONEY = /^-?\d+(\.\d{1,2})?$/;
// FX rate: positive decimal up to 6 places (e.g. "36.512000"). No sign/comma.
const FX_RATE = /^\d+(\.\d{1,6})?$/;
// Percent rate: positive decimal up to 2 places (e.g. "7", "7.00").
const PERCENT = /^\d+(\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const COUNTRY = /^[A-Z]{2}$/;

const stripTaxIdSeparators = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

const stripMoneySeparators = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/,/g, '').trim() : value;

// Multipart form sends everything as strings, JSON may send real booleans.
// Coerce "true"/"1" → true, "false"/"0"/"" → false; keep undefined undefined so
// @IsOptional short-circuits omitted fields.
const toBool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
};

const toUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

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

  // ---- Foreign expense (PP.36 / PND.54) ----------------------------------
  // Domestic receipts omit all of these; defaults in the service keep them
  // backward-compatible (isForeign=false, currency=THB, fxRate=1).
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isForeign?: boolean;

  @IsOptional()
  @Transform(toUpper)
  @IsIn(['GOODS', 'SERVICE'], { message: 'expenseNature ต้องเป็น GOODS หรือ SERVICE' })
  expenseNature?: 'GOODS' | 'SERVICE';

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  usedInThailand?: boolean;

  @IsOptional()
  @Transform(toUpper)
  @Matches(CURRENCY, { message: 'currency ต้องเป็นรหัสสกุลเงิน 3 ตัวอักษร เช่น USD' })
  currency?: string;

  @IsOptional()
  @Transform(stripMoneySeparators)
  @IsString()
  @Matches(FX_RATE, { message: 'fxRate ต้องเป็นอัตราแลกเปลี่ยนบวก เช่น 36.512000' })
  fxRate?: string;

  @IsOptional()
  @Transform(stripMoneySeparators)
  @IsString()
  @Matches(MONEY, { message: 'foreignSubtotal ต้องเป็นจำนวนเงิน เช่น 106.65' })
  foreignSubtotal?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  reverseChargeVat?: boolean;

  @IsOptional()
  @Transform(stripMoneySeparators)
  @IsString()
  @Matches(PERCENT, { message: 'reverseChargeVatRate ต้องเป็นอัตราภาษี เช่น 7' })
  reverseChargeVatRate?: string;

  @IsOptional()
  @Transform(toUpper)
  @Matches(COUNTRY, { message: 'dtaCountry ต้องเป็นรหัสประเทศ 2 ตัวอักษร เช่น US' })
  dtaCountry?: string;
}
