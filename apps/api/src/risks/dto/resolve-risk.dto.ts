import { IsString, MaxLength } from 'class-validator';

export class ResolveRiskDto {
  @IsString()
  @MaxLength(2000)
  resolution!: string;
}
