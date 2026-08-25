import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SalesAccrualLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['personal', 'division']) salesKind?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() percent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salesAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
}

export class CreateSalesAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiProperty() @IsDateString() docDate!: string;
  @ApiProperty() @IsDateString() periodFrom!: string;
  @ApiProperty() @IsDateString() periodTo!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['cash', 'bank']) paymentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['personal', 'division']) salesKind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cashbox?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rounding?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [SalesAccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesAccrualLineDto)
  lines?: SalesAccrualLineDto[];
}

export class UpdateSalesAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() periodFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() periodTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['cash', 'bank']) paymentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['personal', 'division']) salesKind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cashbox?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rounding?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [SalesAccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesAccrualLineDto)
  lines?: SalesAccrualLineDto[];
}

export class CalculateSalesAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsString() rounding?: string;
  @ApiPropertyOptional({ type: [SalesAccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesAccrualLineDto)
  lines?: SalesAccrualLineDto[];
}

export class FillSalesAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['personal', 'division']) salesKind?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
}

export class SalesRateRowDto {
  @ApiProperty() @IsString() positionId!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() personalPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() divisionPercent?: number;
}

export class SaveSalesRatesDto {
  @ApiProperty({ type: [SalesRateRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesRateRowDto)
  rows!: SalesRateRowDto[];
}
