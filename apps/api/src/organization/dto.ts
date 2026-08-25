import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateDivisionDto {
  @ApiProperty({ example: 'HQ' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Head Office' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ description: 'Руководитель подразделения (employeeId)' })
  @IsOptional()
  @IsString()
  managerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  divisionGroupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @ApiPropertyOptional({ description: 'Режим работы (work schedule id)' })
  @IsOptional()
  @IsString()
  scheduleId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  openedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalEntity?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdByLabel?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDivisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  divisionGroupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  openedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalEntity?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedByLabel?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePositionDto {
  @ApiProperty({ example: 'DEV' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Developer' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionGroupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: 'Роль' })
  @IsOptional()
  @IsString()
  role?: string | null;

  @ApiPropertyOptional({ description: 'Счет затрат' })
  @IsOptional()
  @IsString()
  costAccount?: string | null;

  @ApiPropertyOptional({ description: 'Классификатор mehnat' })
  @IsOptional()
  @IsString()
  laborClassifier?: string | null;

  @ApiPropertyOptional({ description: 'Псевдонимы [{grade, alias}]' })
  @IsOptional()
  aliases?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdByLabel?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePositionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionGroupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costAccount?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  laborClassifier?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  aliases?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
