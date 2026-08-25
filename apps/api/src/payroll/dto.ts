import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollLineType } from '@prisma/client';

export class CreatePolicyDto {
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latePenaltyPerMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() absencePenalty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtimeBonusPerHour?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() baseSalaryDefault?: number;
}

export class CreatePeriodDto {
  @ApiProperty() @IsInt() @Min(2020) @Max(2100) year!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(12) month!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateManualLineDto {
  @ApiProperty() @IsString() periodId!: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty({ enum: PayrollLineType }) @IsEnum(PayrollLineType) type!: PayrollLineType;
  @ApiProperty() @IsNumber() amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreateAdvanceDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsNumber() amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() periodId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paidAt?: string;
  @ApiPropertyOptional({ enum: ['draft', 'paid', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: 'draft' | 'paid' | 'cancelled';
}

export class CalculatePeriodDto {
  @ApiPropertyOptional() @IsOptional() @IsString() policyId?: string;
}

export class FinePolicyRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() timeFrom?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() timeTo?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() repeatFrom?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() repeatTo?: number;
  @ApiProperty() @IsString() type!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() value?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() periodicityMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onlyInsidePeriod?: boolean;
}

export class FinePolicyRulesDto {
  @ApiPropertyOptional({ type: [FinePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinePolicyRuleDto)
  late?: FinePolicyRuleDto[];

  @ApiPropertyOptional({ type: [FinePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinePolicyRuleDto)
  early?: FinePolicyRuleDto[];

  @ApiPropertyOptional({ type: [FinePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinePolicyRuleDto)
  absence?: FinePolicyRuleDto[];

  @ApiPropertyOptional({ type: [FinePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinePolicyRuleDto)
  missed_day?: FinePolicyRuleDto[];

  @ApiPropertyOptional({ type: [FinePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinePolicyRuleDto)
  missed_mark?: FinePolicyRuleDto[];
}

export class CreateFinePolicyDto {
  @ApiProperty({ enum: ['company', 'division', 'position', 'employee'] })
  @IsString()
  scope!: string;

  @ApiProperty({ description: 'ISO date or YYYY-MM of the policy month' })
  @IsString()
  month!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: FinePolicyRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FinePolicyRulesDto)
  rules?: FinePolicyRulesDto;
}

export class UpdateFinePolicyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() month?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: FinePolicyRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FinePolicyRulesDto)
  rules?: FinePolicyRulesDto;
}

export class BulkFinePolicyIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class AllowancePolicyRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() coefficient?: number;
}

export class CreateAllowancePolicyDto {
  @ApiProperty({ enum: ['company', 'division', 'schedule'] })
  @IsString()
  scope!: string;

  @ApiProperty()
  @IsString()
  month!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scheduleId?: string;

  @ApiPropertyOptional({ type: [AllowancePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowancePolicyRuleDto)
  rules?: AllowancePolicyRuleDto[];
}

export class UpdateAllowancePolicyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() month?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scheduleId?: string;

  @ApiPropertyOptional({ type: [AllowancePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowancePolicyRuleDto)
  rules?: AllowancePolicyRuleDto[];
}

export class TimesheetSheetLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tabNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scheduleName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() plannedDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() plannedHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() workedDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() workedHours?: number;
  @ApiPropertyOptional() @IsOptional() days?: Record<string, Record<string, number>>;
}

export class CreateTimesheetSheetDto {
  @ApiProperty() @IsDateString() docDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiProperty() @IsString() month!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() periodType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;

  @ApiPropertyOptional({ type: [TimesheetSheetLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimesheetSheetLineDto)
  lines?: TimesheetSheetLineDto[];
}

export class UpdateTimesheetSheetDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() month?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() periodType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;

  @ApiPropertyOptional({ type: [TimesheetSheetLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimesheetSheetLineDto)
  lines?: TimesheetSheetLineDto[];
}

export class FillTimesheetDto {
  @ApiProperty() @IsString() month!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  employeeIds?: string[];
}

export class TimesheetSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allTimeTypes?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  timeTypeIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showPlannedDays?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showPlannedHours?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showWorkedHours?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showWorkedDays?: boolean;
}
