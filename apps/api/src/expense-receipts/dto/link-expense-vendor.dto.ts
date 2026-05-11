import { IsString } from 'class-validator';

export class LinkExpenseVendorDto {
  @IsString()
  vendorId!: string;
}
