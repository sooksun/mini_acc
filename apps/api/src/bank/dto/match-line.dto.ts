import { IsString } from 'class-validator';

export class MatchLineDto {
  @IsString()
  paymentId!: string;
}
