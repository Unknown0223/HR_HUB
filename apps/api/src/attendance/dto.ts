import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  IsDateString,
  IsIn,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PunchDirection } from '@prisma/client';

export class CreateLocationDto {
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() geoRadiusM?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: 'Verifix location extras JSON' })
  @IsOptional()
  meta?: Record<string, unknown>;
}

export class UpdateScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() graceMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({
    description: 'ordinary | hourly | advanced | multi_shift | advanced_multi_shift',
  })
  @IsOptional()
  @IsString()
  kind?: string;
  @ApiPropertyOptional({ description: 'Verifix schedule settings JSON' })
  @IsOptional()
  settings?: Record<string, unknown>;
}

export class CreateScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() graceMinutes?: number;
  @ApiPropertyOptional({
    description: 'ordinary | hourly | advanced | multi_shift | advanced_multi_shift',
  })
  @IsOptional()
  @IsString()
  kind?: string;
  @ApiPropertyOptional() @IsOptional() settings?: Record<string, unknown>;
}

export class CreateProductionCalendarDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsInt() year!: number;
  @ApiPropertyOptional({ description: 'Weekend weekday numbers 0-6' })
  @IsOptional()
  weekendDays?: number[];
  @ApiPropertyOptional() @IsOptional() @IsString() preHolidayHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() holidayHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dailyAttendance?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dailyLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  days?: Array<{
    day: string;
    dayType?: string;
    name?: string;
    replacementDay?: string;
    hours?: number;
  }>;
}

export class UpdateProductionCalendarDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() year?: number;
  @ApiPropertyOptional() @IsOptional() weekendDays?: number[];
  @ApiPropertyOptional() @IsOptional() @IsString() preHolidayHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() holidayHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dailyAttendance?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dailyLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  days?: Array<{
    day: string;
    dayType?: string;
    name?: string;
    replacementDay?: string;
    hours?: number;
  }>;
}

export class UpdateQrCodeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateDeviceDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() serialNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional({ default: 'mock' }) @IsOptional() @IsString() adapterType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() host?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() port?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() username?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gatewayRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: 'Verifix device settings JSON' })
  @IsOptional()
  meta?: Record<string, unknown>;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() adapterType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() host?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() port?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() username?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() meta?: Record<string, unknown>;
}

export class DeviceIgnoreDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class ChangeDevicePasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 16 })
  @IsString()
  @MinLength(8, { message: 'Пароль должен быть от 8 до 16 символов' })
  @MaxLength(16, { message: 'Пароль должен быть от 8 до 16 символов' })
  newPassword!: string;
}

export class SyncDevicePasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 16 })
  @IsString()
  @MinLength(8, { message: 'Пароль должен быть от 8 до 16 символов' })
  @MaxLength(16, { message: 'Пароль должен быть от 8 до 16 символов' })
  password!: string;
}

export class RemoteDeviceCommandDto {
  @ApiProperty({
    enum: ['heartbeat', 'sync', 'sync_clock', 'pull_events', 'open_door', 'reboot'],
  })
  @IsIn(['heartbeat', 'sync', 'sync_clock', 'pull_events', 'open_door', 'reboot'])
  action!: 'heartbeat' | 'sync' | 'sync_clock' | 'pull_events' | 'open_door' | 'reboot';
}

export class ApplyMarkSettingsDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-08-05' })
  @IsDateString()
  to!: string;
}

export class IngestPunchDto {
  @ApiProperty() @IsString() tenantId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gatewayRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeExternalId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiProperty({ enum: PunchDirection }) @IsEnum(PunchDirection) direction!: PunchDirection;
  @ApiProperty() @IsDateString() occurredAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() raw?: Record<string, unknown>;
  /** Terminal capture JPEG (base64, no data: prefix). */
  @ApiPropertyOptional() @IsOptional() @IsString() photoBase64?: string;
}

export class AssignScheduleDto {
  @ApiProperty() @IsString() employeeId!: string;
}

export class CreateQrCodeDto {
  @ApiProperty() @IsString() label!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}

export class QrPunchDto {
  @ApiProperty() @IsString() qrCode!: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty({ enum: PunchDirection }) @IsEnum(PunchDirection) direction!: PunchDirection;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
}

export class GpsPunchDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsNumber() latitude!: number;
  @ApiProperty() @IsNumber() longitude!: number;
  @ApiProperty({ enum: PunchDirection }) @IsEnum(PunchDirection) direction!: PunchDirection;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
}

export class CreateManualMarkDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsDateString() occurredAt!: string;
  @ApiPropertyOptional({ enum: PunchDirection })
  @IsOptional()
  @IsEnum(PunchDirection)
  direction?: PunchDirection;
  /** mark | in | out | break_out | break_in */
  @ApiPropertyOptional() @IsOptional() @IsString() markType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() identificationType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isValid?: boolean;
}

export class UpdateMarkDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isValid?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() markType?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() occurredAt?: string;
}

export class BulkMarksDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];

  /** delete | set_valid | set_invalid | set_type */
  @ApiProperty({ example: 'set_valid' })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ example: 'in' })
  @IsOptional()
  @IsString()
  markType?: string;
}

export class CopyMarksPreviewDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds!: string[];

  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() to!: string;
}

export class CopyMarksDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds!: string[];

  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() to!: string;
  /** target period start (same length as from..to) */
  @ApiProperty() @IsDateString() targetFrom!: string;
}

export class LocationTrackingQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() geoRadiusM?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationTypeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() meta?: Record<string, unknown>;
}
