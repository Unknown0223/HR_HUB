import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { MeLivenessDto, MeLocationIntegrityDto } from '../me/dto';

/** One employee in front of the manager's phone: liveness-checked face + GPS of the phone. */
export class TeamKioskPunchDto {
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

  @ApiProperty({ description: 'Liveness selfie JPEG (base64) used to identify the employee' })
  @IsString()
  @MaxLength(3_000_000)
  selfieBase64!: string;

  @ApiPropertyOptional({ description: 'Photo stored on the mark (base64); the selfie when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(6_000_000)
  photoBase64?: string;

  @ApiProperty({ type: MeLivenessDto })
  @ValidateNested()
  @Type(() => MeLivenessDto)
  liveness!: MeLivenessDto;

  @ApiPropertyOptional({ type: MeLocationIntegrityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MeLocationIntegrityDto)
  integrity?: MeLocationIntegrityDto;

  @ApiPropertyOptional({ description: 'Mandatory when the phone is outside the location radius' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
