import {
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
import { PayrollSheetKind, PayrollSheetPayType } from '@prisma/client';

export class SheetLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() debt?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() limitAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() accruedAdvance?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bank?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() settlementAccount?: string;
}

export class CreateSheetDto {
  @ApiProperty({ enum: PayrollSheetKind })
  @IsEnum(PayrollSheetKind)
  kind!: PayrollSheetKind;

  @ApiProperty() @IsDateString() month!: string;
  @ApiProperty() @IsDateString() issueDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PayrollSheetPayType) payType?: PayrollSheetPayType;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cashbox?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rounding?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enableLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SheetLineDto)
  lines?: SheetLineDto[];
}

export class UpdateSheetDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() month?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() issueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PayrollSheetPayType) payType?: PayrollSheetPayType;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cashbox?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rounding?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enableLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SheetLineDto)
  lines?: SheetLineDto[];
}

export class FillSheetDto {
  @ApiProperty({ enum: PayrollSheetKind })
  @IsEnum(PayrollSheetKind)
  kind!: PayrollSheetKind;

  @ApiProperty() @IsDateString() month!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forMonth?: boolean;
}

export class ImportSheetDto {
  @ApiProperty() @IsArray() rows!: Array<Record<string, unknown>>;
}

export class UpdateSheetSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() rounding?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() countPaidAdvances?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() generateNote?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() monthlyDayLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() percent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() deductionPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postedAccrualsOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postedDeductionsOnly?: boolean;
}
