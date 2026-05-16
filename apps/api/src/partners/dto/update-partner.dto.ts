import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PartnerType, VendorCategory } from '@hj/shared-types';
import { PartnerContactDto } from './partner-contact.dto';

export class UpdatePartnerDto {
  @IsOptional() @IsEnum(PartnerType)
  type?: PartnerType;

  @IsOptional()
  @IsEnum(VendorCategory)
  vendorCategory?: VendorCategory;

  @IsOptional() @IsString() @MaxLength(32)
  code?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameTh?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(20)
  taxId?: string;

  @IsOptional() @IsString() @MaxLength(50)
  branch?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  address?: string;

  @IsOptional() @IsString() @MaxLength(50)
  phone?: string;

  @IsOptional() @IsEmail() @MaxLength(120)
  email?: string;

  @IsOptional() @IsString() @MaxLength(200)
  website?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PartnerContactDto)
  contacts?: PartnerContactDto[];
}
