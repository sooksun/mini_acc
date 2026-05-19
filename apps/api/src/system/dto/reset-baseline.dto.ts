import { IsIn, IsString } from 'class-validator';

export class ResetBaselineDto {
  @IsString()
  @IsIn(['RESET'])
  confirmText!: string;
}
