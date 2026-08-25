import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BonusAccrualLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
}

export class CreateBonusAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['fact', 'kpi']) kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiProperty() @IsDateString() docDate!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() factTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() factTypeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() considerPayroll?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [BonusAccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusAccrualLineDto)
  lines?: BonusAccrualLineDto[];
}

export class UpdateBonusAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['fact', 'kpi']) kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() factTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() factTypeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() considerPayroll?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [BonusAccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusAccrualLineDto)
  lines?: BonusAccrualLineDto[];
}

export class FillBonusAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['fact', 'kpi']) kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() factTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() factTypeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() considerPayroll?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
}
