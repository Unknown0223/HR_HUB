import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AccessReasonDto {
  @ApiProperty({ description: 'Why the change is made (stored in the audit log)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class GrantAccessDto extends AccessReasonDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: 'org_custom' })
  @IsString()
  @MaxLength(64)
  accessType!: string;

  @ApiPropertyOptional({ description: 'Division id or profile flag key; ignored for global types' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  resource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class BulkAccessDto extends AccessReasonDto {
  @ApiProperty({ enum: ['grant', 'revoke'] })
  @IsIn(['grant', 'revoke'])
  action!: 'grant' | 'revoke';

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  accessType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  resource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
