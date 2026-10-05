import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { TeamService } from './team.service';
import { TeamKioskService } from './team-kiosk.service';
import { TeamKioskPunchDto } from './dto';

/** Open to every role: whether someone leads a team is decided by the org chart. */
@ApiTags('team')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('team')
@Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly kiosk: TeamKioskService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.team.list(user);
  }

  /** Device mode of the manager's phone; 403 TEAM_KIOSK_DISABLED without the access grant. */
  @Get('kiosk')
  kioskOverview(@CurrentUser() user: AuthUser) {
    return this.kiosk.overview(user);
  }

  @Post('kiosk/punch')
  kioskPunch(@CurrentUser() user: AuthUser, @Body() dto: TeamKioskPunchDto) {
    return this.kiosk.punch(user, dto);
  }

  @Get(':employeeId/timesheet')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  timesheet(
    @CurrentUser() user: AuthUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.team.timesheet(user, employeeId, Number(year) || undefined, Number(month) || undefined);
  }

  @Get(':employeeId/live')
  live(@CurrentUser() user: AuthUser, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.team.live(user, employeeId);
  }
}
