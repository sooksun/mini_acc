import { IsString, MinLength } from 'class-validator';

export class ReopenYearDto {
  @IsString()
  @MinLength(3, { message: 'ต้องระบุเหตุผลในการเปิดงวดปิดบัญชีใหม่' })
  reason!: string;
}
