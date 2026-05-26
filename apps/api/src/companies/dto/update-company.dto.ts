import { IsEmail, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional() @IsString() @MaxLength(200)
  nameTh?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(50)
  phone?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(8)
  brandShort?: string;

  @IsOptional() @IsString() @MaxLength(200)
  tagline?: string;

  // ค่า markup % เริ่มต้นสำหรับสร้างใบเสนอราคาจากใบเสร็จซื้อ (0–999.99)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999.99)
  defaultMarkupPercent?: number;
}
