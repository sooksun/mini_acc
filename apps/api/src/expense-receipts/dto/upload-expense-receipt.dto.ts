import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadExpenseReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
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
  @IsString()
  subtotal?: string;

  @IsOptional()
  @IsString()
  vatAmount?: string;

  @IsOptional()
  @IsString()
  withholdingTaxAmount?: string;

  @IsOptional()
  @IsString()
  grandTotal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
