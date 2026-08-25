import {
  Allow,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollAccrualKind } from '@prisma/client';

export class AccrualLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() accrued?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() toPay?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ndfl?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() inps?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() esp?: number;
}

export class AccrualDeductionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deductionTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deductionName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
}

export class CreateAccrualDocDto {
  @ApiProperty({ enum: PayrollAccrualKind })
  @IsEnum(PayrollAccrualKind)
  kind!: PayrollAccrualKind;

  @ApiProperty() @IsDateString() month!: string;
  @ApiProperty() @IsDateString() docDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mergeAccruals?: boolean;
  @ApiPropertyOptional() @IsOptional() @Allow() attachments?: unknown;

  @ApiPropertyOptional({ type: [AccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccrualLineDto)
  lines?: AccrualLineDto[];

  @ApiPropertyOptional({ type: [AccrualDeductionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccrualDeductionDto)
  deductions?: AccrualDeductionDto[];
}

export class UpdateAccrualDocDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() month?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mergeAccruals?: boolean;
  @ApiPropertyOptional() @IsOptional() @Allow() attachments?: unknown;

  @ApiPropertyOptional({ type: [AccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccrualLineDto)
  lines?: AccrualLineDto[];

  @ApiPropertyOptional({ type: [AccrualDeductionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccrualDeductionDto)
  deductions?: AccrualDeductionDto[];
}

export class FillAccrualDto {
  @ApiProperty({ enum: PayrollAccrualKind })
  @IsEnum(PayrollAccrualKind)
  kind!: PayrollAccrualKind;

  @ApiProperty() @IsDateString() month!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mergeAccruals?: boolean;
}

export class BulkAccrualIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
