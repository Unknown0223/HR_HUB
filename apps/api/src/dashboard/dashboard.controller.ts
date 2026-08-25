import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('stats')
  stats(
    @CurrentTenant() tenantId: string | null,
    @Query('date') date?: string,
    @Query('divisionIds') divisionIds?: string | string[],
    @Query('positionIds') positionIds?: string | string[],
    @Query('scheduleIds') scheduleIds?: string | string[],
    @Query('gradeIds') gradeIds?: string | string[],
    @Query('locationIds') locationIds?: string | string[],
  ) {
    return this.dashboard.stats(this.dashboard.requireTenant(tenantId), {
      date,
      divisionIds,
      positionIds,
      scheduleIds,
      gradeIds,
      locationIds,
    });
  }
}
