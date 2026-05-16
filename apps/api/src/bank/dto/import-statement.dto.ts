import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BankStatementSide } from '@hj/shared-types';

const MONEY = /^-?\d+(\.\d{1,2})?$/;
const stripCommas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/,/g, '').trim() : value;

export class BankStatementLineInput {
  @IsDateString()
  postedAt!: string;

  @IsEnum(BankStatementSide)
  side!: BankStatementSide;

  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY, { message: 'amount ต้องเป็นจำนวนเงิน' })
  amount!: string;

  @IsOptional()
  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY)
  balance?: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class ImportBankStatementDto {
  @IsString()
  @MaxLength(100)
  bankAccount!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'ต้องมีอย่างน้อย 1 รายการ' })
  @ValidateNested({ each: true })
  @Transform(({ value }) => value)
  lines!: BankStatementLineInput[];
}
