import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}

export class LoginDto {
  /** Email, `login@<tenant code>`, or a bare `login` (unique across all companies). */
  @ApiProperty({ example: 'admin@demo.local' })
  @IsString()
  @MinLength(3)
  email!: string;

  @ApiProperty({ example: 'Demo1234!' })
  @IsString()
  password!: string;
}

export class LoginIdentDto {
  /** Same identifiers as {@link LoginDto.email}. */
  @ApiProperty({ example: 'admin@demo.local' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  login!: string;
}

export class TelegramLoginPollDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  requestId!: string;
}

export class ResetPasswordDto extends LoginIdentDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\s*\d{6}\s*$/)
  code!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
