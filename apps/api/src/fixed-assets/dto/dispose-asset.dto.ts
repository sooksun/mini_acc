import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class DisposeAssetDto {
  @IsOptional()
  @IsDateString()
  disposedAt?: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}
