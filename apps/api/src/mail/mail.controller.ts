import { BadRequestException, Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { MailService } from './mail.service';

class SmtpSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) host?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() secure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) user?: string;
  @ApiPropertyOptional({ description: 'Empty keeps the stored password' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  password?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) from?: string;
}

class SmtpTestDto {
  @ApiProperty() @IsEmail() to!: string;
}

@ApiTags('mail')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('mail/settings')
export class MailController {
  constructor(private readonly mail: MailService) {}

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Get()
  get(@CurrentTenant() tenantId: string | null) {
    return this.mail.settings(this.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Put()
  save(@CurrentTenant() tenantId: string | null, @Body() dto: SmtpSettingsDto) {
    return this.mail.saveSettings(this.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('test')
  test(@CurrentTenant() tenantId: string | null, @Body() dto: SmtpTestDto) {
    return this.mail.sendTest(this.requireTenant(tenantId), dto.to);
  }
}
