import { IsDateString, IsEnum } from 'class-validator';
import { DocumentType } from '@hj/shared-types';

export class PeekNumberDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsDateString()
  documentDate!: string;
}
