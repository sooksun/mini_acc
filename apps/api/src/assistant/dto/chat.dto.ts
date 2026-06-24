import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AssistantPageContextDto } from './page-context.dto';

export class AssistantChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class AssistantChatDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AssistantPageContextDto)
  context!: AssistantPageContextDto;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssistantChatMessageDto)
  messages!: AssistantChatMessageDto[];
}
