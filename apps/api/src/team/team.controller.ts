import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { TeamService } from './team.service';

/** Open to every role: whether someone leads a team is decided by the org chart. */
@ApiTags('team')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('team')
@Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.team.list(user);
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
