import { IsString, MaxLength } from 'class-validator';

export class VoidPaymentDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
