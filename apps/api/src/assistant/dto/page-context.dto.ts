import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AssistantFieldType, type AssistantSelectOption } from '@hj/shared-types';

const FIELD_TYPES = Object.values(AssistantFieldType);

export class AssistantSelectOptionDto {
  @IsString()
  @MaxLength(120)
  value!: string;

  @IsString()
  @MaxLength(200)
  label!: string;
}

export class AssistantFieldDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsIn(FIELD_TYPES)
  type!: AssistantFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AssistantSelectOptionDto)
  options?: AssistantSelectOption[];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  hint?: string;
}

export class AssistantPageContextDto {
  @IsString()
  @MaxLength(300)
  route!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => AssistantFieldDto)
  fields!: AssistantFieldDto[];

  // Free-form snapshot of the form's current values — the service whitelists
  // keys on the way back, so a plain object leaf is acceptable here.
  @IsObject()
  currentValues!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  listEmpty?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  screenText?: string;

  @IsOptional()
  @IsIn(['create', 'read', 'edit', 'delete'])
  mode?: 'create' | 'read' | 'edit' | 'delete';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  staticAdvice?: string;
}
