import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { Roles, Public } from '../auth/decorators';
import { SkipTenant } from '../tenant/decorators';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { TelegramService } from './telegram.service';

class ApproveJoinDto {
  @ApiProperty({ example: '0042' })
  @IsString()
  @MinLength(1)
  tabNumber!: string;
}

class RejectJoinDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

class SetupWebhookDto {
  @ApiPropertyOptional({
    example: 'https://hr-hubapi-production.up.railway.app',
  })
  @IsOptional()
  @IsString()
  publicApiUrl?: string;
}

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('status')
  status(@CurrentTenant() tenantId: string | null) {
    return this.telegram.status(this.requireTenant(tenantId));
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('setup-webhook')
  setupWebhook(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: SetupWebhookDto,
  ) {
    return this.telegram.setupWebhook(this.requireTenant(tenantId), {
      publicApiUrl: dto.publicApiUrl,
    });
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('invites')
  createInvite(@CurrentTenant() tenantId: string | null) {
    return this.telegram.createInvite(this.requireTenant(tenantId));
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('join-requests')
  list(
    @CurrentTenant() tenantId: string | null,
    @Query('status') status?: string,
  ) {
    return this.telegram.listJoinRequests(this.requireTenant(tenantId), status);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('join-requests/:id/approve')
  approve(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveJoinDto,
  ) {
    return this.telegram.approveJoinRequest(this.requireTenant(tenantId), id, {
      tabNumber: dto.tabNumber,
      reviewedBy: user?.userId,
    });
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('join-requests/:id/reject')
  reject(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() _dto: RejectJoinDto,
  ) {
    return this.telegram.rejectJoinRequest(
      this.requireTenant(tenantId),
      id,
      user?.userId,
    );
  }

  /** Telegram Bot API webhook (set via Settings → Telegram → Webhook). */
  @Public()
  @SkipTenant()
  @Post('webhook')
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() body: unknown,
  ) {
    await this.telegram.assertWebhookSecret(secret);
    return this.telegram.handleWebhook(body as never);
  }
}
