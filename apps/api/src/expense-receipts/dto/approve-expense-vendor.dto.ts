import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const THAI_TAX_ID = /^\d{13}$/;

const stripTaxIdSeparators = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

export class ApproveExpenseVendorDto {
  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameTh?: string;

  @IsOptional()
  @Transform(stripTaxIdSeparators)
  @IsString()
  @Matches(THAI_TAX_ID, { message: 'taxId ต้องเป็นเลขผู้เสียภาษีไทย 13 หลัก' })
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;
}
