import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';
import { AiSuggestionStatus, AiSuggestionType } from '@hj/shared-types';

export class ListSuggestionsDto {
  @IsOptional()
  @IsEnum(AiSuggestionStatus)
  status?: AiSuggestionStatus;

  @IsOptional()
  @IsEnum(AiSuggestionType)
  type?: AiSuggestionType;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(0)
  skip?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(200)
  take?: number;
}
