import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@hj/shared-types';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(200)
  password!: string;

  @IsString()
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  initial?: string;

  @IsEnum(Role)
  role!: Role;
}
