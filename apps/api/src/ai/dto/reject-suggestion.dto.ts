import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectSuggestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
