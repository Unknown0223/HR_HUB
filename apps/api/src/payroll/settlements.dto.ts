import {
  Allow,
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

export class SettlementLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountPairId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pairName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subconto?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() firstAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() secondAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
}

export class CreateSettlementDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) pairIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SettlementLineDto)
  lines?: SettlementLineDto[];
}

export class UpdateSettlementDto extends CreateSettlementDto {}

export class RefreshSettlementDto {
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) pairIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() subconto?: string;
}

export class HistoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() settlementId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
}

export class CreateAccountPairDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() firstAccount!: string;
  @ApiProperty() @IsString() secondAccount!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) subcontos?: string[];
}

export class UpdateAccountPairDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() firstAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @Allow() subcontos?: string[];
}

export class BulkPairIdsDto {
  @ApiProperty() @IsArray() @IsString({ each: true }) ids!: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
