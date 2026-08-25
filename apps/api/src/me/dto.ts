import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PunchDirection, RequestStatus, RequestType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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
 * Mobile Face ID punch — camera selfie (base64) or mock when hardware/ML is absent.
 * Set FACE_MOBILE_MOCK=0 to require a non-empty faceImageBase64.
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
    description: 'Force mock accept even without image (dev / emulator)',
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
