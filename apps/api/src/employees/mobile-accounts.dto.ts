import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetMobileAccountDto {
  @ApiProperty({ example: 'ali.valiyev' })
  @IsString()
  @MaxLength(64)
  login!: string;

  /** Required for a new account; empty keeps the current password. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string | null;
}

export class IssueTemporaryPasswordsDto {
  /** `without` — only employees without an account; `all` — also reset existing ones. */
  @ApiProperty({ enum: ['without', 'all'] })
  @IsIn(['without', 'all'])
  scope!: 'without' | 'all';
}

export class SetMobileAccountStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
