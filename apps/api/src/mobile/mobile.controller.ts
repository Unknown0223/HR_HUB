import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  MeCreateAbsenceDto,
  MeCreateRequestDto,
  MeFacePunchDto,
  MeGpsPunchDto,
  MeQrPunchDto,
} from '../me/dto';
import { MeService } from '../me/me.service';
import { MobileService } from './mobile.service';

/**
 * Versioned mobile facade over the existing /api/me contracts.
 *
 * Auth is identical to web: Bearer JWT + X-Tenant-Id. Aggregates (`home`,
 * `calendar`) exist so a phone screen renders from a single request.
 */
@ApiTags('mobile')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('mobile/v1')
@Roles(
  Role.platform_admin,
  Role.tenant_admin,
  Role.hr,
  Role.manager,
  Role.employee,
)
export class MobileController {
  constructor(
    private readonly me: MeService,
    private readonly mobile: MobileService,
  ) {}

  @Get('health')
  health(@CurrentTenant() tenantId: string | null) {
    return {
      ok: true,
      product: 'HR HUB',
      api: 'mobile/v1',
      tenantBound: !!tenantId,
      client: '/m (responsive PWA shell)',
    };
  }

  @Get('home')
  home(@CurrentUser() user: AuthUser) {
    return this.mobile.home(user);
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.me.getProfile(user);
  }

  @Get('attendance/today')
  today(@CurrentUser() user: AuthUser) {
    return this.me.todayAttendance(user);
  }

  @Get('attendance/marks')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  marks(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.me.listMarks(user, from, to);
  }

  @Get('attendance/calendar')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  calendar(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.mobile.calendar(
      user,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  /** Tabel (timesheet): kunlik status + oy belgilari + xulosa. */
  @Get('attendance/tabel')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  tabel(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.mobile.tabel(
      user,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Post('punches/qr')
  punchQr(@CurrentUser() user: AuthUser, @Body() dto: MeQrPunchDto) {
    return this.me.punchQr(user, dto);
  }

  @Post('punches/gps')
  punchGps(@CurrentUser() user: AuthUser, @Body() dto: MeGpsPunchDto) {
    return this.me.punchGps(user, dto);
  }

  @Post('punches/face')
  punchFace(@CurrentUser() user: AuthUser, @Body() dto: MeFacePunchDto) {
    return this.me.punchFace(user, dto);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthUser) {
    return this.me.listMyRequests(user);
  }

  @Post('requests')
  createRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: MeCreateRequestDto,
  ) {
    return this.me.createRequest(user, dto);
  }

  @Get('absence-types')
  absenceTypes(@CurrentUser() user: AuthUser) {
    return this.me.listAbsenceTypes(user);
  }

  @Post('absences')
  createAbsence(
    @CurrentUser() user: AuthUser,
    @Body() dto: MeCreateAbsenceDto,
  ) {
    return this.me.createAbsence(user, dto);
  }

  @Get('team/today')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  teamToday(@CurrentUser() user: AuthUser) {
    return this.me.teamToday(user);
  }

  @Get('payroll/summary')
  payrollSummary(@CurrentUser() user: AuthUser) {
    return this.me.payrollSummary(user);
  }

  @Get('news')
  @ApiQuery({ name: 'limit', required: false })
  news(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.mobile.news(user, limit ? Number(limit) : undefined);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthUser) {
    return this.me.listNotifications(user, false);
  }

  @Patch('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.me.markAllNotificationsRead(user);
  }

  @Patch('notifications/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.markNotificationRead(user, id);
  }
}
