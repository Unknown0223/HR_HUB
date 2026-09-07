import {
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles, Public } from '../auth/decorators';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { SkipTenant } from '../tenant/decorators';
import { AttendanceService } from './attendance.service';
import {
  PairingAuthContext,
  PairingTokenGuard,
} from './pairing-token.guard';
import {
  CreatePairingTokenDto,
  CreateProvisionSessionDto,
  DetectDeviceStateDto,
  OfficeLinkDevicePasswordDto,
  PatchProvisionProgressDto,
} from './dto';

const CurrentPairing = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PairingAuthContext => {
    const req = ctx.switchToHttp().getRequest<{ pairing?: PairingAuthContext }>();
    return req.pairing as PairingAuthContext;
  },
);

/**
 * Faza 1 provision endpoints: JWT admin + pairing-token auth.
 * Existing DeviceLinkGuard routes stay on OfficeLinkController.
 */
@ApiTags('office-link')
@Controller('attendance/office-link')
export class OfficeLinkProvisionController {
  constructor(private readonly attendance: AttendanceService) {}

  // ── JWT admin ──────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('pairing-token')
  createPairingToken(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePairingTokenDto,
  ) {
    return this.attendance.createPairingToken(
      this.attendance.requireTenant(tenantId),
      user.userId,
      dto.ttlSec,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('sessions')
  listSessions(@CurrentTenant() tenantId: string | null) {
    return this.attendance.listProvisionSessions(
      this.attendance.requireTenant(tenantId),
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('download')
  downloadExe(
    @Res({ passthrough: true }) res: Response,
    @Query('redirect') redirect?: string,
  ) {
    const info = this.attendance.getOfficeLinkDownload();
    if (redirect !== '0' && info.url) {
      res.redirect(302, info.url);
      return;
    }
    return info;
  }

  // ── Pairing token ──────────────────────────────────────────

  @Public()
  @SkipTenant()
  @UseGuards(PairingTokenGuard)
  @ApiHeader({ name: 'X-Pairing-Token', required: true })
  @Post('session')
  createSession(
    @CurrentPairing() pairing: PairingAuthContext,
    @Body() dto: CreateProvisionSessionDto,
  ) {
    return this.attendance.createOrRefreshProvisionSession(pairing, dto);
  }

  @Public()
  @SkipTenant()
  @UseGuards(PairingTokenGuard)
  @ApiHeader({ name: 'X-Pairing-Token', required: true })
  @Patch('session/:id/progress')
  patchProgress(
    @CurrentPairing() pairing: PairingAuthContext,
    @Param('id') id: string,
    @Body() dto: PatchProvisionProgressDto,
  ) {
    return this.attendance.patchProvisionProgress(pairing, id, dto);
  }

  @Public()
  @SkipTenant()
  @UseGuards(PairingTokenGuard)
  @ApiHeader({ name: 'X-Pairing-Token', required: true })
  @Post('device/detect')
  detectDevice(
    @CurrentPairing() pairing: PairingAuthContext,
    @Body() dto: DetectDeviceStateDto,
  ) {
    return this.attendance.recordDeviceDetect(pairing, dto);
  }

  @Public()
  @SkipTenant()
  @UseGuards(PairingTokenGuard)
  @ApiHeader({ name: 'X-Pairing-Token', required: true })
  @Post('device/password')
  setDevicePassword(
    @CurrentPairing() pairing: PairingAuthContext,
    @Body() dto: OfficeLinkDevicePasswordDto,
  ) {
    return this.attendance.officeLinkSetDevicePassword(pairing, dto);
  }
}
