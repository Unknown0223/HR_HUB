import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const TRACKING_STATES = [
  'tracking',
  'off_hours',
  'paused',
  'no_permission',
  'gps_off',
] as const;

export class TrackingRegisterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) platform?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() permissions?: Record<string, unknown>;
}

export class TrackingPointDto {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) lat!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) lng!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) accuracy?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() speed?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heading?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() altitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mock?: boolean;
  @ApiPropertyOptional({ description: 'Recorded while the phone had no working internet' })
  @IsOptional()
  @IsBoolean()
  offline?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) battery?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() charging?: boolean;
  @ApiProperty() @IsISO8601() recordedAt!: string;
}

export class TrackingPingsDto {
  @ApiProperty({ type: [TrackingPointDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TrackingPointDto)
  points!: TrackingPointDto[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) battery?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() charging?: boolean;
  @ApiPropertyOptional({ enum: TRACKING_STATES })
  @IsOptional()
  @IsIn(TRACKING_STATES as unknown as string[])
  state?: (typeof TRACKING_STATES)[number];
  @ApiPropertyOptional() @IsOptional() @IsObject() permissions?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) activeMockApp?: string;
}
