import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ManualLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() debitAccount!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() debitName?: string;
  @ApiProperty() @IsString() creditAccount!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() creditName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) quantity?: number;
  @ApiProperty() @IsNumber() @Type(() => Number) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) amountBase?: number;
}

export class CreateManualOpDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiProperty() @IsDateString() docDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ManualLineDto)
  lines?: ManualLineDto[];
}

export class UpdateManualOpDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ManualLineDto)
  lines?: ManualLineDto[];
}
