import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Payload from Google Form → Apps Script → HR HUB.
 * Field names are stable English keys; form titles can be RU/UZ.
 */
export class EmployeeFormIngestDto {
  @ApiProperty({ example: 'demo', description: 'Tenant code' })
  @IsString()
  @MinLength(1)
  tenantCode!: string;

  @ApiPropertyOptional({
    description: 'Tab number; auto-generated if empty',
  })
  @IsOptional()
  @IsString()
  tabNumber?: string;

  @ApiProperty({ example: 'Karimov' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiProperty({ example: 'Ali' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telegramUsername?: string;

  @ApiPropertyOptional({ description: '14-digit PINFL' })
  @IsOptional()
  @IsString()
  pinfl?: string;

  @ApiPropertyOptional({ example: '1995-03-12' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'M', 'F', 'erkak', 'ayol'] })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ example: 'AA' })
  @IsOptional()
  @IsString()
  passportSeries?: string;

  @ApiPropertyOptional({ example: '1234567' })
  @IsOptional()
  @IsString()
  passportNumber?: string;

  @ApiPropertyOptional({ enum: ['PASSPORT', 'ID_CARD', 'Pasport', 'ID karta'] })
  @IsOptional()
  @IsString()
  passportDocType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportIssuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  passportIssuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  passportExpiresAt?: string;

  @ApiPropertyOptional({
    description: 'Division code or name (resolved on server)',
  })
  @IsOptional()
  @IsString()
  divisionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  divisionName?: string;

  @ApiPropertyOptional({
    description: 'Position code or name (resolved on server)',
  })
  @IsOptional()
  @IsString()
  positionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionName?: string;

  @ApiPropertyOptional({ enum: ['staff', 'gph', 'Shtat', 'GPH'] })
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiPropertyOptional({ example: '2026-09-16' })
  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @ApiPropertyOptional({
    description: 'Face terminal employeeNo / external PIN',
  })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Optional note from form' })
  @IsOptional()
  @IsString()
  note?: string;

  /** Face ID photo from Google Form file upload (raw base64, no data: prefix). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  facePhotoBase64?: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  facePhotoContentType?: string;

  /** Passport / ID card scan from Google Form file upload. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportPhotoBase64?: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  passportPhotoContentType?: string;

  /** Google Drive / public image URL — server fetches when base64 empty. */
  @ApiPropertyOptional({
    example: 'https://drive.google.com/open?id=FILE_ID',
  })
  @IsOptional()
  @IsString()
  facePhotoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportPhotoUrl?: string;

  /** Idempotency / Google response id */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  googleResponseId?: string;

  /** Existing employee (photo backfill) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['google_form', 'manual', 'apps_script'])
  source?: 'google_form' | 'manual' | 'apps_script';
}
