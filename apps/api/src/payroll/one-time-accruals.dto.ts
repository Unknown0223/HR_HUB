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

export class OneTimeLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() lineDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class OneTimeAttachmentDto {
  @ApiProperty() @IsString() name!: string;
}

export class CreateOneTimeAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['accrual', 'deduction']) kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiProperty() @IsDateString() docDate!: string;
  @ApiProperty() @IsDateString() month!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() basis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['value', 'percent', 'formula']) calcType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() percent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() formula?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useOneForAll?: boolean;
  @ApiPropertyOptional({ type: [OneTimeAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimeAttachmentDto)
  attachments?: OneTimeAttachmentDto[];
  @ApiPropertyOptional({ type: [OneTimeLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimeLineDto)
  lines?: OneTimeLineDto[];
}

export class UpdateOneTimeAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['accrual', 'deduction']) kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() month?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() basis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['value', 'percent', 'formula']) calcType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() percent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() formula?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useOneForAll?: boolean;
  @ApiPropertyOptional({ type: [OneTimeAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimeAttachmentDto)
  attachments?: OneTimeAttachmentDto[];
  @ApiPropertyOptional({ type: [OneTimeLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimeLineDto)
  lines?: OneTimeLineDto[];
}

export class FillOneTimeAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['accrual', 'deduction']) kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() lineDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useOneForAll?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() initiators?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
}

export class CalculateOneTimeAccrualDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['value', 'percent', 'formula']) calcType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() percent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() formula?: string;
  @ApiPropertyOptional({ type: [OneTimeLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimeLineDto)
  lines?: OneTimeLineDto[];
}
