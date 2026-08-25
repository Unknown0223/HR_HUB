import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TravelExpenseLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateTravelExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiProperty() @IsDateString() docDate!: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsString() tripId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() advance?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() calcForSalary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [TravelExpenseLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelExpenseLineDto)
  lines?: TravelExpenseLineDto[];
}

export class UpdateTravelExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tripId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() advance?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() calcForSalary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [TravelExpenseLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelExpenseLineDto)
  lines?: TravelExpenseLineDto[];
}
