import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('overview')
  overview(@CurrentTenant() tenantId: string | null) {
    return this.reports.overview(this.reports.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('attendance/t13')
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  t13(
    @CurrentTenant() tenantId: string | null,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.reports.attendanceT13(
      this.reports.requireTenant(tenantId),
      Number(year),
      Number(month),
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('attendance/t13.xlsx')
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  async t13Xlsx(
    @CurrentTenant() tenantId: string | null,
    @Query('year') year: string,
    @Query('month') month: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.attendanceT13Xlsx(
      this.reports.requireTenant(tenantId),
      Number(year),
      Number(month),
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('attendance/lateness')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  lateness(
    @CurrentTenant() tenantId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.lateness(
      this.reports.requireTenant(tenantId),
      from,
      to,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('attendance/lateness.xlsx')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async latenessXlsx(
    @CurrentTenant() tenantId: string | null,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.latenessXlsx(
      this.reports.requireTenant(tenantId),
      from,
      to,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('attendance/marks')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  marks(
    @CurrentTenant() tenantId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.markDetails(
      this.reports.requireTenant(tenantId),
      from,
      to,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('attendance/marks.xlsx')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async marksXlsx(
    @CurrentTenant() tenantId: string | null,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.markDetailsXlsx(
      this.reports.requireTenant(tenantId),
      from,
      to,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('hr/movement')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'groupBy', required: false, description: 'division | staff' })
  hrMovement(
    @CurrentTenant() tenantId: string | null,
    @Query('year') year?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    const gb = groupBy === 'staff' ? 'staff' : 'division';
    return this.reports.hrMovement(
      this.reports.requireTenant(tenantId),
      year ? Number(year) : undefined,
      gb,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('hr/movement.xlsx')
  @ApiQuery({ name: 'year', required: false })
  async hrMovementXlsx(
    @CurrentTenant() tenantId: string | null,
    @Query('year') year: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.hrMovementXlsx(
      this.reports.requireTenant(tenantId),
      year ? Number(year) : undefined,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('payroll/fot')
  @ApiQuery({ name: 'periodId', required: false })
  fot(
    @CurrentTenant() tenantId: string | null,
    @Query('periodId') periodId?: string,
  ) {
    return this.reports.fot(this.reports.requireTenant(tenantId), periodId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('payroll/fot.xlsx')
  @ApiQuery({ name: 'periodId', required: false })
  async fotXlsx(
    @CurrentTenant() tenantId: string | null,
    @Query('periodId') periodId: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.fotXlsx(
      this.reports.requireTenant(tenantId),
      periodId,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
