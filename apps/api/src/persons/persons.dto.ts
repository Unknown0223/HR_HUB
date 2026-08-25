import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePersonDto {
  @ApiProperty() @IsString() firstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() middleName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pinfl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passport?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inps?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressResidence?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressRegistration?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useForFaceRecognition?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isKeyPerson?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() accessAllEmployees?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isBlacklisted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPinned?: boolean;
}

export class UpdatePersonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() middleName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pinfl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passport?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inps?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() addressResidence?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressRegistration?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useForFaceRecognition?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isKeyPerson?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() accessAllEmployees?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isBlacklisted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPinned?: boolean;
}

export class BulkIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class BulkStatusDto extends BulkIdsDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class BulkPinDto extends BulkIdsDto {
  @ApiProperty()
  @IsBoolean()
  isPinned!: boolean;
}
