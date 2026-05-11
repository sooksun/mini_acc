import { IsOptional, IsString, MaxLength } from 'class-validator';

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
  @IsString()
  @MaxLength(20)
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
