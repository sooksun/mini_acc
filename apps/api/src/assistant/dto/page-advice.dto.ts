import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { AssistantPageContextDto } from './page-context.dto';

export class PageAdviceDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AssistantPageContextDto)
  context!: AssistantPageContextDto;
}
