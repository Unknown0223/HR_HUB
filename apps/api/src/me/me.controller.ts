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
import {
  MeCreateAbsenceDto,
  MeCreateRequestDto,
  MeFacePunchDto,
  MeGpsPunchDto,
  MeQrPunchDto,
  MeReviewAbsenceDto,
  MeReviewRequestDto,
} from './dto';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('me')
@Roles(
  Role.platform_admin,
  Role.tenant_admin,
  Role.hr,
  Role.manager,
  Role.employee,
)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.me.getProfile(user);
  }

  @Get('attendance/today')
  today(@CurrentUser() user: AuthUser) {
    return this.me.todayAttendance(user);
  }

  @Get('marks')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  marks(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.me.listMarks(user, from, to);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthUser) {
    return this.me.listMyRequests(user);
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

  @Post('requests')
  createRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: MeCreateRequestDto,
  ) {
    return this.me.createRequest(user, dto);
  }

  @Get('inbox')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  inbox(@CurrentUser() user: AuthUser) {
    return this.me.inbox(user);
  }

  @Patch('inbox/requests/:id')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  reviewRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MeReviewRequestDto,
  ) {
    return this.me.reviewRequest(user, id, dto);
  }

  @Patch('inbox/absences/:id')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  reviewAbsence(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MeReviewAbsenceDto,
  ) {
    return this.me.reviewAbsence(user, id, dto);
  }

  @Post('punches/gps')
  punchGps(@CurrentUser() user: AuthUser, @Body() dto: MeGpsPunchDto) {
    return this.me.punchGps(user, dto);
  }

  @Post('punches/qr')
  punchQr(@CurrentUser() user: AuthUser, @Body() dto: MeQrPunchDto) {
    return this.me.punchQr(user, dto);
  }

  @Post('punches/face')
  punchFace(@CurrentUser() user: AuthUser, @Body() dto: MeFacePunchDto) {
    return this.me.punchFace(user, dto);
  }

  @Get('team/today')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  teamToday(@CurrentUser() user: AuthUser) {
    return this.me.teamToday(user);
  }

  @Get('notifications')
  @ApiQuery({ name: 'unreadOnly', required: false })
  notifications(
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.me.listNotifications(
      user,
      unreadOnly === '1' || unreadOnly === 'true',
    );
  }

  @Get('search')
  @ApiQuery({ name: 'q', required: true })
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  search(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.me.globalSearch(user, q ?? '');
  }

  @Patch('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.me.markAllNotificationsRead(user);
  }

  @Patch('notifications/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.markNotificationRead(user, id);
  }

  @Get('payroll/summary')
  payrollSummary(@CurrentUser() user: AuthUser) {
    return this.me.payrollSummary(user);
  }
}
