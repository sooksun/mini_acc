import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { JournalSourceType } from '@hj/shared-types';

const MONEY = /^-?\d+(\.\d{1,2})?$/;

export class JournalEntryLineDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'accountCode ต้องเป็นเลข 4 หลัก' })
  accountCode!: string;

  @IsString()
  @MaxLength(120)
  accountName!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'debit ต้องเป็นจำนวนเงิน' })
  debit?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'credit ต้องเป็นจำนวนเงิน' })
  credit?: string;

  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class PostJournalEntryDto {
  @IsDateString()
  entryDate!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsEnum(JournalSourceType)
  sourceType!: JournalSourceType;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'Journal ต้องมีอย่างน้อย 2 บรรทัด' })
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines!: JournalEntryLineDto[];
}
