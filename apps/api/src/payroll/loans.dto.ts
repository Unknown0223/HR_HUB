import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLoanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiProperty() @IsDateString() loanDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contractNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() contractDate?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() principal!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() remaining?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() monthlyPayment?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateLoanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() loanDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contractNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() contractDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() principal?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() remaining?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() monthlyPayment?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
