import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IntegrationType, Role } from '@prisma/client';

export class UpdateOrgSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() orgName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locale?: string;
}

export class UpdateQuickstartDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  checked?: Record<string, boolean>;
}

export class CreateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiProperty() @IsString() @MinLength(6) password!: string;
  @ApiProperty() @IsString() fullName!: string;
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(6) password?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class CreateDictionaryDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ description: 'core | extra' })
  @IsOptional()
  @IsString()
  kind?: string;
}

export class CreateDictionaryItemDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({
    description:
      'Extra fields: cars {plate,vin}; coa {parentCode,accountKind,paymentKind,...}; cashboxes {responsible,locations,currencies,balance}; employment_sources {sourceType}; indicators {shortName,description,groupCode,groupName}; avg_salary {positionId,valueFrom,valueTo}; currencies {iso,unit,subunit,affixKind,rounding,rates}',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class UpdateDictionaryItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class ImportDictionaryItemsDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  items!: Array<{
    code?: string;
    name?: string;
    isActive?: boolean;
    sortOrder?: number;
    meta?: Record<string, unknown>;
  }>;
}

export class ImportPersonDocsDto {
  @ApiPropertyOptional({
    description:
      'CSV/TSV text (legacy): tabNumber, docType, docNumber, issuedAt, issuer',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'csv | tsv — default auto-detect' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  items?: Array<Record<string, string>>;

  @ApiPropertyOptional({ description: 'fio | code' })
  @IsOptional()
  @IsString()
  personKey?: string;
}

export class UpdatePersonDocsImportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  startRow?: number;

  @ApiPropertyOptional({ description: 'fio | code' })
  @IsOptional()
  @IsString()
  personKey?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  fields?: string[];
}

export class CreateIntegrationDto {
  @ApiProperty({ enum: IntegrationType })
  @IsEnum(IntegrationType)
  type!: IntegrationType;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() webhookUrl?: string;
  @ApiPropertyOptional() @IsOptional() config?: Record<string, unknown>;
}

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional({ description: 'Partial system flags / values' })
  @IsOptional()
  @IsObject()
  system?: Record<string, unknown>;
}

export class UpdatePayrollCalcDto {
  @ApiPropertyOptional({ description: 'Verifix payroll calculation settings body' })
  @IsOptional()
  @IsObject()
  payrollCalc?: Record<string, unknown>;
}

export class UpdateAccountSettingsDto {
  @ApiPropertyOptional({ description: 'Verifix account settings mappings' })
  @IsOptional()
  @IsObject()
  accountSettings?: Record<string, string>;
}
