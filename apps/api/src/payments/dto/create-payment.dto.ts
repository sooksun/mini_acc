import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentDirection, PaymentMethod } from '@hj/shared-types';

const MONEY = /^\d+(\.\d{1,2})?$/;
const stripMoney = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/,/g, '').trim() : value;

export class CreatePaymentDto {
  @IsEnum(PaymentDirection)
  direction!: PaymentDirection;

  @IsString()
  partnerId!: string;

  @IsDateString()
  paymentDate!: string;

  @Transform(stripMoney)
  @IsString()
  @Matches(MONEY, { message: 'amount ต้องเป็นจำนวนเงิน ≥ 0' })
  amount!: string;

  @IsOptional()
  @Transform(stripMoney)
  @IsString()
  @Matches(MONEY, { message: 'whtAmount ต้องเป็นจำนวนเงิน ≥ 0' })
  whtAmount?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Polymorphic source link. Free-form for now until specific sources go through their own services. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  /** Optional WHT cert number from Form 50 ทวิ. Only used when whtAmount > 0. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  whtCertNumber?: string;

  /** WHT income category code (e.g. "1", "2", "3" per Revenue Code §40). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  whtCategory?: string;
}
