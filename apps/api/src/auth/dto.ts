import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'demo' })
  @IsString()
  tenantCode!: string;

  @ApiProperty({ example: 'Demo Company LLC' })
  @IsString()
  tenantName!: string;

  @ApiProperty({ example: 'admin@demo.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin Demo' })
  @IsString()
  fullName!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ enum: Role, default: Role.tenant_admin })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@demo.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Demo1234!' })
  @IsString()
  password!: string;
}
