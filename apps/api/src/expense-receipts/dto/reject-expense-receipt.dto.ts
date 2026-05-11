import { IsString, MaxLength } from 'class-validator';

export class RejectExpenseReceiptDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
