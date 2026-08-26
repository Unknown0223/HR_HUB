import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentStatus, EmploymentType } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ example: '0001' })
  @IsString()
  @MinLength(1)
  tabNumber!: string;

  @ApiProperty({ example: 'Ali' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Karimov' })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  divisionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personId?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional({ description: 'DictionaryItem id from regions dictionary' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gradeId?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tabNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  divisionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personId?: string;

  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsDateString()
  hiredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsDateString()
  dismissedAt?: string;

  @ApiPropertyOptional({ description: 'Base monthly salary' })
  @IsOptional()
  @IsString()
  baseSalary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional({ description: 'DictionaryItem id from regions dictionary' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gradeId?: string;
}

export class UpdateEmployeeFlagsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  excludeFromStats?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  systemAccessClosed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marksBlocked?: boolean;
}

export class EmployeeLocationAttachItemDto {
  @ApiProperty()
  @IsString()
  locationId!: string;

  @ApiPropertyOptional({ enum: ['auto', 'manual'], default: 'auto' })
  @IsOptional()
  @IsString()
  attachmentType?: 'auto' | 'manual';
}

export class UpdateEmployeeLocationsDto {
  @ApiPropertyOptional({ type: [EmployeeLocationAttachItemDto] })
  @IsOptional()
  attach?: EmployeeLocationAttachItemDto[];

  @ApiPropertyOptional({ type: [String], description: 'Location IDs to detach' })
  @IsOptional()
  detach?: string[];
}

export class UpdateEmployeePersonalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() middleName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pinfl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inps?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateEmployeeContactsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phoneExtra?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emailCorp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() street?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() house?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() apartment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registeredAddress?: string;
}

export class CreateEmployeeBankAccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiProperty() @IsString() @MinLength(1) accountNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cardNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateEmployeeBankAccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cardNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateEmployeeBankCardDto {
  @ApiProperty() @IsString() @MinLength(1) cardNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}

export class UpdateEmployeeBankCardDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cardNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}

export class CreateEmployeePersonDocDto {
  @ApiProperty({ example: 'PASSPORT' })
  @IsString()
  @MinLength(1)
  docType!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() series?: string;
  @ApiProperty() @IsString() @MinLength(1) docNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuer?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() issuedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isValid?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileNames?: string[];
}

export class UpdateEmployeePersonDocDto {
  @ApiPropertyOptional() @IsOptional() @IsString() docType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() series?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() docNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuer?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() issuedAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isValid?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileNames?: string[];
}

export class CreateEmployeeRelativeDto {
  @ApiProperty() @IsString() @MinLength(1) fullName!: string;
  @ApiProperty() @IsString() @MinLength(1) relation!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() workplace?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dependent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isHidden?: boolean;
}

export class UpdateEmployeeRelativeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() birthDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() workplace?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dependent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isHidden?: boolean;
}

export class UpdateEmployeeMaritalStatusDto {
  @ApiPropertyOptional() @IsOptional() @IsString() maritalStatus?: string | null;
}

export class CreateEmployeeCertificateDto {
  @ApiProperty() @IsString() @MinLength(1) certType!: string;
  @ApiProperty() @IsString() @MinLength(1) certNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() certDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string;
  @ApiProperty() @IsString() @MinLength(1) title!: string;
}

export class UpdateEmployeeCertificateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() certType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() certDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
}

export class CreateEmployeeTenureDto {
  @ApiProperty() @IsString() @MinLength(1) tenureType!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() stillWorking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() countedFrom?: string;
}

export class UpdateEmployeeTenureDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenureType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() stillWorking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() countedFrom?: string | null;
}

export class CreateEmployeeWorkplaceDto {
  @ApiProperty() @IsString() @MinLength(1) organization!: string;
  @ApiProperty() @IsString() @MinLength(1) position!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateEmployeeWorkplaceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() organization?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() position?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreateEmployeeAwardDto {
  @ApiProperty() @IsString() @MinLength(1) awardType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() docTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() docNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() awardDate?: string;
}

export class UpdateEmployeeAwardDto {
  @ApiPropertyOptional() @IsOptional() @IsString() awardType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() docTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() docNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() awardDate?: string | null;
}

export class UpdateEmployeeFileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string | null;
}

export class CreateEmployeeInventoryDto {
  @ApiProperty() @IsString() @MinLength(1) inventoryType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inventoryNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufacturer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operationAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() purchaseDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateEmployeeInventoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() inventoryType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inventoryNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufacturer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operationAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() purchaseDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() locationName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateEmployeeCarDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsString() @MinLength(1) plateNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateEmployeeCarDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plateNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateEmployeeIdentificationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() pin?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() pinCode?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() rfidNumber?: string | null;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  fingerprints?: number[];
}

export class UpdateEmployeeExtraInfoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() altFirstName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() altLastName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() altMiddleName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() citizenship?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() extraCode?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notKeyEmployee?: boolean;
}

export class UpdateEmployeeUserSettingsDto {
  @ApiPropertyOptional({ description: 'Verifix-style user settings payload' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  /** Optional new password (not stored in profile extras). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string | null;
}

export class CreateEmployeeMarkBlockDto {
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateEmployeeMarkBlockDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
