import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { InventoryMovementType } from '@hj/shared-types';

const QTY = /^\d+(\.\d{1,4})?$/;
const MONEY = /^\d+(\.\d{1,2})?$/;
const stripCommas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/,/g, '').trim() : value;

export class CreateInventoryMovementDto {
  @IsString()
  productId!: string;

  @IsEnum(InventoryMovementType)
  type!: InventoryMovementType;

  @Transform(stripCommas)
  @IsString()
  @Matches(QTY, { message: 'quantity ต้องเป็นจำนวน ≥ 0 ทศนิยมไม่เกิน 4 หลัก' })
  quantity!: string;

  @IsDateString()
  movementDate!: string;

  @IsOptional()
  @Transform(stripCommas)
  @IsString()
  @Matches(MONEY, { message: 'unitCost ต้องเป็นจำนวนเงิน' })
  unitCost?: string;

  /** Optional polymorphic link, e.g. ('SALES_DOCUMENT', salesDocId) */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  referenceType?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
