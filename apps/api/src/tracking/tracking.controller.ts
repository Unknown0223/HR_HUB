import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public, Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { ymdInTz } from '../attendance/attendance-day';
import { TrackingPingsDto, TrackingRegisterDto } from './dto';
import { TrackingService } from './tracking.service';

const TOKEN_HEADER = 'x-tracking-token';
const ALL_ROLES = [Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee];
const VIEWER_ROLES = [Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager];

@ApiTags('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(...ALL_ROLES)
  @Post('register')
  register(@CurrentUser() user: AuthUser, @Body() dto: TrackingRegisterDto) {
    return this.tracking.register(user, dto);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(...ALL_ROLES)
  @Post('revoke')
  @HttpCode(200)
  revoke(@CurrentUser() user: AuthUser) {
    return this.tracking.revoke(user);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(...ALL_ROLES)
  @Get('me')
  myStatus(@CurrentUser() user: AuthUser) {
    return this.tracking.myStatus(user);
  }

  @Public()
  @ApiHeader({ name: TOKEN_HEADER, required: true })
  @Get('window')
  window(@Headers(TOKEN_HEADER) token?: string) {
    return this.tracking.windowByToken(token);
  }

  @Public()
  @ApiHeader({ name: TOKEN_HEADER, required: true })
  @Post('pings')
  @HttpCode(200)
  pings(@Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: TrackingPingsDto) {
    return this.tracking.ingest(token, dto);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(...VIEWER_ROLES)
  @Get('live')
  live(@CurrentTenant() tenantId: string | null) {
    return this.tracking.live(this.requireTenant(tenantId));
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(...VIEWER_ROLES)
  @Get('employees/:employeeId/track')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'snap', required: false, description: '0 = raw GPS line without road snapping' })
  track(
    @CurrentTenant() tenantId: string | null,
    @Param('employeeId') employeeId: string,
    @Query('date') date?: string,
    @Query('snap') snap?: string,
  ) {
    const ymd = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ymdInTz(new Date());
    return this.tracking.employeeTrack(this.requireTenant(tenantId), employeeId, ymd, snap !== '0');
  }

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }
}
