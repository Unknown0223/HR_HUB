import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PunchDirection, RequestStatus, RequestType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const LIVENESS_DIRECTIONS = [
  'left',
  'right',
  'up',
  'down',
  'up_left',
  'up_right',
  'down_left',
  'down_right',
] as const;

/** Device-side location integrity signals (mock provider / fake GPS apps). */
export class MeLocationIntegrityDto {
  @ApiPropertyOptional({ description: 'Any fix reported as mocked by Android' })
  @IsOptional()
  @IsBoolean()
  mockLocation?: boolean;

  @ApiPropertyOptional({ description: 'App selected as mock location provider' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  activeMockApp?: string;

  @ApiPropertyOptional({ description: 'Installed apps holding ACCESS_MOCK_LOCATION' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  mockApps?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;
}

export class MeLivenessDto {
  @ApiProperty()
  @IsBoolean()
  passed!: boolean;

  @ApiProperty({ enum: LIVENESS_DIRECTIONS, isArray: true })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(8)
  @IsIn(LIVENESS_DIRECTIONS, { each: true })
  steps!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMs?: number;
}

/** Phone check-in / check-out: liveness + selfie/back-camera photo report + GPS. */
export class MeMobilePunchDto {
  @ApiProperty({ enum: ['IN', 'OUT'] })
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @ApiProperty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({ description: 'GPS accuracy in meters' })
  @IsNumber()
  @Min(0)
  accuracy!: number;

  @ApiProperty({ description: 'Composite JPEG (back camera + selfie inset), base64' })
  @IsString()
  photoBase64!: string;

  @ApiPropertyOptional({ description: 'Liveness selfie JPEG (base64) for face match against the profile photo' })
  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  selfieBase64?: string;

  @ApiProperty({ type: MeLivenessDto })
  @ValidateNested()
  @Type(() => MeLivenessDto)
  liveness!: MeLivenessDto;

  @ApiPropertyOptional({ type: MeLocationIntegrityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MeLocationIntegrityDto)
  integrity?: MeLocationIntegrityDto;

  @ApiPropertyOptional({ description: 'Mandatory when outside the location radius' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/** Selfie the phone's own face pre-check rejected; the server confirms or overrides. */
export class MeFaceVerifyDto {
  @ApiProperty({ enum: ['IN', 'OUT'] })
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @ApiProperty({ description: 'Liveness selfie JPEG (base64)' })
  @IsString()
  @MaxLength(3_000_000)
  selfieBase64!: string;
}

export class MeMockLocationReportDto {
  @ApiProperty({ type: MeLocationIntegrityDto })
  @ValidateNested()
  @Type(() => MeLocationIntegrityDto)
  integrity!: MeLocationIntegrityDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class MeGpsPunchDto {
  @ApiProperty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ description: 'GPS accuracy in meters' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @ApiPropertyOptional({ enum: PunchDirection })
  @IsOptional()
  @IsEnum(PunchDirection)
  direction?: PunchDirection;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Mandatory when the punch is outside the location radius',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class MeGpsCheckDto {
  @ApiProperty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class MeQrPunchDto {
  @ApiProperty()
  @IsString()
  qrCode!: string;

  @ApiPropertyOptional({ enum: PunchDirection })
  @IsOptional()
  @IsEnum(PunchDirection)
  direction?: PunchDirection;
}

/**
 * Demo Face ID punch — no face comparison; the endpoint only works when FACE_MOBILE_MOCK=1.
 */
export class MeFacePunchDto {
  @ApiPropertyOptional({
    description: 'JPEG/PNG selfie as base64 (data-URL prefix allowed)',
  })
  @IsOptional()
  @IsString()
  faceImageBase64?: string;

  @ApiPropertyOptional({ enum: PunchDirection })
  @IsOptional()
  @IsEnum(PunchDirection)
  direction?: PunchDirection;

  @ApiPropertyOptional({
    description: 'Deprecated, ignored',
  })
  @IsOptional()
  @IsBoolean()
  mock?: boolean;
}

export class MeCreateAbsenceDto {
  @ApiProperty()
  @IsString()
  absenceTypeId!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  /** Part-day absence: HH:mm, together with `endTime` on a single date. */
  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional({ example: '16:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class MeCreateRequestDto {
  @ApiProperty({ enum: RequestType })
  @IsEnum(RequestType)
  type!: RequestType;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class MeReviewRequestDto {
  @ApiProperty({ enum: [RequestStatus.approved, RequestStatus.rejected] })
  @IsEnum(RequestStatus)
  status!: RequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class MeReviewAbsenceDto {
  @ApiProperty({
    enum: [
      RequestStatus.approved,
      RequestStatus.rejected,
      RequestStatus.cancelled,
    ],
  })
  @IsEnum(RequestStatus)
  status!: RequestStatus;
}
