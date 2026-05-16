import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MONEY = /^\d+(\.\d{1,2})?$/;
const stripCommas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/,/g, '').trim() : value;

export class CreateFixedAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsDateString()
  acquiredAt!: string;

  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY, { message: 'cost ต้องเป็นจำนวนเงิน > 0' })
  cost!: string;

  @IsOptional()
  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY, { message: 'salvageValue ต้องเป็นจำนวนเงิน ≥ 0' })
  salvageValue?: string;

  @IsInt()
  @Min(1, { message: 'usefulLifeMonths ต้องอย่างน้อย 1 เดือน' })
  @Max(1200, { message: 'usefulLifeMonths ต้องไม่เกิน 100 ปี (1200 เดือน)' })
  usefulLifeMonths!: number;

  @IsOptional()
  @IsString()
  expenseRecordId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
