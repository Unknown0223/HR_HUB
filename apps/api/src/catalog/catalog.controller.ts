import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { sendExcelAttachment } from '../common/excel';
import { excelImportMulterOptions } from '../common/excel-import';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('resources')
  resources() {
    return this.catalog.listResources();
  }

  // —— Analytics / reports (before :resource to avoid conflict) ——

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/division-stats')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionGroupId', required: false })
  @ApiQuery({ name: 'scheduleId', required: false })
  @ApiQuery({ name: 'q', required: false })
  divisionStats(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionGroupId') divisionGroupId?: string,
    @Query('scheduleId') scheduleId?: string,
    @Query('q') q?: string,
  ) {
    return this.catalog.divisionWorkDashboard(this.catalog.requireTenant(t), {
      from,
      to,
      divisionGroupId,
      scheduleId,
      q,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/year-summary')
  yearSummary(@CurrentTenant() t: string | null, @Query('year') year?: string) {
    return this.catalog.yearSummary(
      this.catalog.requireTenant(t),
      year ? Number(year) : new Date().getFullYear(),
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/year-summary-dashboard')
  @ApiQuery({ name: 'year', required: false })
  yearSummaryDashboard(
    @CurrentTenant() t: string | null,
    @Query('year') year?: string,
  ) {
    return this.catalog.yearSummaryDashboard(
      this.catalog.requireTenant(t),
      year ? Number(year) : undefined,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/staffing')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  staffing(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionId') divisionId?: string,
    @Query('positionId') positionId?: string,
  ) {
    return this.catalog.staffingReport(this.catalog.requireTenant(t), {
      date,
      divisionId,
      positionId,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/gender')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'reportType', required: false })
  @ApiQuery({ name: 'ranges', required: false })
  @ApiQuery({ name: 'gradeId', required: false })
  @ApiQuery({ name: 'educationType', required: false })
  gender(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionId') divisionId?: string,
    @Query('reportType') reportType?: string,
    @Query('ranges') ranges?: string,
    @Query('gradeId') gradeId?: string,
    @Query('educationType') educationType?: string,
  ) {
    return this.catalog.genderReport(this.catalog.requireTenant(t), {
      date,
      divisionId,
      reportType,
      ranges,
      gradeId,
      educationType,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/movement-divisions')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  movementDivisions(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionId') divisionId?: string,
    @Query('divisionIds') divisionIds?: string,
  ) {
    return this.catalog.movementDivisionsReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds: divisionIds || divisionId,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/movement-staff')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'kinds', required: false })
  @ApiQuery({ name: 'divisionGroupId', required: false })
  @ApiQuery({ name: 'positionGroupId', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  movementStaff(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kinds') kinds?: string,
    @Query('divisionGroupId') divisionGroupId?: string,
    @Query('positionGroupId') positionGroupId?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
  ) {
    return this.catalog.movementStaffReport(this.catalog.requireTenant(t), {
      from,
      to,
      kinds,
      divisionGroupId,
      positionGroupId,
      divisionIds,
      positionIds,
      employeeIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/dismissals-by-reason')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'keyEmployee', required: false })
  @ApiQuery({ name: 'basisType', required: false })
  dismissalsByReason(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('keyEmployee') keyEmployee?: string,
    @Query('basisType') basisType?: string,
  ) {
    return this.catalog.dismissalsByReason(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      keyEmployee,
      basisType,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/dismissals-by-division')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  dismissalsByDivision(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.catalog.dismissalsByDivision(this.catalog.requireTenant(t), { from, to });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/dismissal-dashboard')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  dismissalDashboard(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.catalog.dismissalDashboard(
      this.catalog.requireTenant(t),
      from,
      to,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/personnel-changes')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'groupBy', required: false })
  personnelChanges(
    @CurrentTenant() t: string | null,
    @Query('year') year?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.catalog.personnelChangesDashboard(this.catalog.requireTenant(t), {
      year: year ? Number(year) : undefined,
      groupBy: groupBy === 'position' ? 'position' : 'division',
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/grades')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'filterByDept', required: false })
  grades(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('filterByDept') filterByDept?: string,
  ) {
    return this.catalog.gradeReport(this.catalog.requireTenant(t), {
      date,
      divisionIds,
      positionIds,
      employeeIds,
      filterByDept,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/grade-changes')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  gradeChanges(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('employeeIds') employeeIds?: string,
  ) {
    return this.catalog.gradeChangeReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      employeeIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/vacancies')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionGroupIds', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionGroupIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'staffGroups', required: false })
  vacancies(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionGroupIds') divisionGroupIds?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionGroupIds') positionGroupIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('staffGroups') staffGroups?: string,
  ) {
    return this.catalog.vacancyReport(this.catalog.requireTenant(t), {
      date,
      divisionGroupIds,
      divisionIds,
      positionGroupIds,
      positionIds,
      staffGroups,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/candidates')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'personType', required: false })
  @ApiQuery({ name: 'employmentSource', required: false })
  @ApiQuery({ name: 'gender', required: false })
  candidates(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('positionIds') positionIds?: string,
    @Query('personType') personType?: string,
    @Query('employmentSource') employmentSource?: string,
    @Query('gender') gender?: string,
  ) {
    return this.catalog.candidateReport(this.catalog.requireTenant(t), {
      from,
      to,
      positionIds,
      personType,
      employmentSource,
      gender,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/tenure')
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'yearsFrom', required: false })
  @ApiQuery({ name: 'yearsTo', required: false })
  @ApiQuery({ name: 'rules', required: false })
  tenure(
    @CurrentTenant() t: string | null,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('yearsFrom') yearsFrom?: string,
    @Query('yearsTo') yearsTo?: string,
    @Query('rules') rules?: string,
  ) {
    return this.catalog.tenureReport(this.catalog.requireTenant(t), {
      divisionIds,
      positionIds,
      employeeIds,
      yearsFrom,
      yearsTo,
      rules,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/relatives')
  relatives(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('relations') relations?: string,
    @Query('gender') gender?: string,
    @Query('ageFrom') ageFrom?: string,
    @Query('ageTo') ageTo?: string,
    @Query('showHidden') showHidden?: string,
  ) {
    return this.catalog.relativesReport(this.catalog.requireTenant(t), {
      date,
      divisionIds,
      positionIds,
      employeeIds,
      relations,
      gender,
      ageFrom,
      ageTo,
      showHidden,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/access')
  access(
    @CurrentTenant() t: string | null,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('withoutAccess') withoutAccess?: string,
  ) {
    return this.catalog.accessReport(this.catalog.requireTenant(t), {
      divisionIds,
      positionIds,
      employeeIds,
      withoutAccess,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/distance')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  distance(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.distanceReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/shifts')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'startTime', required: false })
  @ApiQuery({ name: 'endTime', required: false })
  shifts(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.shiftReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
      startTime,
      endTime,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/time-types')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'locationIds', required: false })
  timeTypes(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('locationIds') locationIds?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.timeTypesReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
      locationIds,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/schedule-plan')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  schedulePlan(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
  ) {
    return this.catalog.schedulePlanReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/employees')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'divisionGroupIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'scheduleIds', required: false })
  @ApiQuery({ name: 'educationType', required: false })
  @ApiQuery({ name: 'filterByDept', required: false })
  employees(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('divisionGroupIds') divisionGroupIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('scheduleIds') scheduleIds?: string,
    @Query('educationType') educationType?: string,
    @Query('filterByDept') filterByDept?: string,
  ) {
    return this.catalog.employmentReport(this.catalog.requireTenant(t), {
      date,
      divisionIds,
      divisionGroupIds,
      positionIds,
      employeeIds,
      scheduleIds,
      educationType,
      filterByDept,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/occupancy')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'positionGroupIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'staffGroups', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'groupBy', required: false })
  @ApiQuery({ name: 'positionType', required: false })
  occupancy(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('positionGroupIds') positionGroupIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('staffGroups') staffGroups?: string,
    @Query('groupBy') groupBy?: string,
    @Query('positionType') positionType?: string,
  ) {
    return this.catalog.occupancyReport(this.catalog.requireTenant(t), {
      date,
      positionGroupIds,
      positionIds,
      staffGroups,
      divisionIds,
      groupBy,
      positionType,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/penalties')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'filterByDept', required: false })
  penalties(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('filterByDept') filterByDept?: string,
  ) {
    return this.catalog.penaltiesReport(this.catalog.requireTenant(t), {
      from,
      to,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      divisionIds,
      positionIds,
      employeeIds,
      filterByDept,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/one-time')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'kind', required: false, description: 'accrual | deduction | both' })
  oneTime(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('kind') kind?: string,
  ) {
    return this.catalog.oneTimeAccrualsReport(this.catalog.requireTenant(t), {
      from,
      to,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      divisionIds,
      positionIds,
      employeeIds,
      kind,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/division-expenses')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'divisionGroupIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'positionGroupIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'cfg', required: false })
  divisionExpenses(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('divisionGroupIds') divisionGroupIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('positionGroupIds') positionGroupIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.divisionExpensesReport(this.catalog.requireTenant(t), {
      from,
      to,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      divisionIds,
      divisionGroupIds,
      positionIds,
      positionGroupIds,
      employeeIds,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/fot')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'locationIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'gradeIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'cfg', required: false })
  fotReport(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('locationIds') locationIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('gradeIds') gradeIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.fotReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      locationIds,
      positionIds,
      gradeIds,
      employeeIds,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/payroll-book')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  payrollBook(
    @CurrentTenant() t: string | null,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
  ) {
    return this.catalog.payrollBookReport(this.catalog.requireTenant(t), {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      divisionIds,
      positionIds,
      employeeIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/account-balance')
  accountBalance(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('account') account?: string,
    @Query('currency') currency?: string,
    @Query('subconto') subconto?: string,
    @Query('showQty') showQty?: string,
    @Query('showAmount') showAmount?: string,
  ) {
    return this.catalog.accountBalanceReport(this.catalog.requireTenant(t), {
      from,
      to,
      account,
      currency,
      subconto,
      showQty: showQty === '1' || showQty === 'true',
      showAmount: showAmount !== '0' && showAmount !== 'false',
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/trial-balance')
  trialBalance(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
    @Query('subconto') subconto?: string,
    @Query('showQty') showQty?: string,
    @Query('showAmount') showAmount?: string,
    @Query('excludeExtra') excludeExtra?: string,
  ) {
    return this.catalog.trialBalanceReport(this.catalog.requireTenant(t), {
      from,
      to,
      currency,
      subconto,
      showQty: showQty === '1' || showQty === 'true',
      showAmount: showAmount !== '0' && showAmount !== 'false',
      excludeExtra: excludeExtra === '1' || excludeExtra === 'true',
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/preliminary-salary')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  preliminarySalary(
    @CurrentTenant() t: string | null,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
  ) {
    return this.catalog.preliminarySalaryReport(this.catalog.requireTenant(t), {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      divisionIds,
      positionIds,
      employeeIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/payments')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  paymentsReport(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('employeeIds') employeeIds?: string,
  ) {
    return this.catalog.paymentsReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      employeeIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/hourly')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'startTime', required: false })
  @ApiQuery({ name: 'endTime', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  hourly(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.hourlyAttendanceReport(this.catalog.requireTenant(t), {
      from,
      to,
      startTime,
      endTime,
      divisionIds,
      employeeIds,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/division-mode')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'groupIds', required: false })
  @ApiQuery({ name: 'useGroups', required: false })
  @ApiQuery({ name: 'layout', required: false })
  @ApiQuery({ name: 'managerGroupId', required: false })
  divisionMode(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('groupIds') groupIds?: string,
    @Query('useGroups') useGroups?: string,
    @Query('layout') layout?: string,
    @Query('managerGroupId') managerGroupId?: string,
  ) {
    return this.catalog.divisionModeReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      groupIds,
      useGroups: useGroups === '1' || useGroups === 'true',
      layout,
      managerGroupId,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/lateness')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  lateness(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.latenessReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/discipline')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  discipline(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
  ) {
    return this.catalog.disciplineReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/discipline/employee/:employeeId')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  disciplineEmployee(
    @CurrentTenant() t: string | null,
    @Param('employeeId') employeeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.catalog.disciplineEmployeeDetail(
      this.catalog.requireTenant(t),
      employeeId,
      from,
      to,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/timesheet-adjustments')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  timesheetAdjustments(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
  ) {
    return this.catalog.timesheetAdjustmentReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/positions-structure')
  positionsStructure(@CurrentTenant() t: string | null) {
    return this.catalog.positionsStructure(this.catalog.requireTenant(t));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('staff-positions/tree')
  staffPositionsTree(@CurrentTenant() t: string | null) {
    return this.catalog.staffPositionsTree(this.catalog.requireTenant(t));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('staff-positions/bulk-close')
  bulkCloseStaffPositions(
    @CurrentTenant() t: string | null,
    @Body() body: { ids?: string[]; closedAt?: string },
  ) {
    return this.catalog.bulkCloseStaffPositions(
      this.catalog.requireTenant(t),
      body.ids ?? [],
      body.closedAt || new Date().toISOString().slice(0, 10),
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('staff-positions/bulk-delete')
  bulkDeleteStaffPositions(
    @CurrentTenant() t: string | null,
    @Body() body: { ids?: string[] },
  ) {
    return this.catalog.bulkDeleteStaffPositions(
      this.catalog.requireTenant(t),
      body.ids ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/attendance-overview')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'locationIds', required: false })
  @ApiQuery({ name: 'groupIds', required: false })
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiQuery({ name: 'cfg', required: false })
  attendanceOverview(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('locationIds') locationIds?: string,
    @Query('groupIds') groupIds?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.attendanceOverview(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
      locationIds,
      groupIds,
      includeInactive: includeInactive === '1' || includeInactive === 'true',
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/marks-detail')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'locationIds', required: false })
  marksDetail(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('locationIds') locationIds?: string,
  ) {
    return this.catalog.marksDetailReport(this.catalog.requireTenant(t), {
      date,
      divisionIds,
      positionIds,
      employeeIds,
      locationIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/positions')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionGroupId', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionGroupId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  positions(
    @CurrentTenant() t: string | null,
    @Query('date') date?: string,
    @Query('divisionGroupId') divisionGroupId?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionGroupId') positionGroupId?: string,
    @Query('positionId') positionId?: string,
  ) {
    return this.catalog.positionsReport(this.catalog.requireTenant(t), {
      date,
      divisionGroupId,
      divisionIds,
      positionGroupId,
      positionId,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/schedules')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'scheduleIds', required: false })
  schedules(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('scheduleIds') scheduleIds?: string,
  ) {
    return this.catalog.schedulesReport(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
      scheduleIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/multi-shift')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'scheduleIds', required: false })
  @ApiQuery({ name: 'details', required: false })
  multiShift(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('scheduleIds') scheduleIds?: string,
    @Query('details') details?: string,
  ) {
    return this.catalog.multiShiftAttendance(this.catalog.requireTenant(t), {
      from,
      to,
      divisionIds,
      positionIds,
      employeeIds,
      scheduleIds,
      details,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/payroll-grouped')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'divisionIds', required: false })
  @ApiQuery({ name: 'positionIds', required: false })
  @ApiQuery({ name: 'employeeIds', required: false })
  @ApiQuery({ name: 'positionType', required: false })
  @ApiQuery({ name: 'cfg', required: false })
  payrollGrouped(
    @CurrentTenant() t: string | null,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('positionType') positionType?: string,
    @Query('cfg') cfg?: string,
  ) {
    return this.catalog.payrollGroupedReport(this.catalog.requireTenant(t), {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      divisionIds,
      positionIds,
      employeeIds,
      positionType,
      cfg,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('analytics/:kind/export.xlsx')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  @ApiQuery({ name: 'reportType', required: false })
  @ApiQuery({ name: 'ranges', required: false })
  @ApiQuery({ name: 'gradeId', required: false })
  @ApiQuery({ name: 'educationType', required: false })
  async exportAnalytics(
    @CurrentTenant() t: string | null,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('date') date?: string,
    @Query('divisionId') divisionId?: string,
    @Query('divisionIds') divisionIds?: string,
    @Query('divisionGroupId') divisionGroupId?: string,
    @Query('positionId') positionId?: string,
    @Query('positionGroupId') positionGroupId?: string,
    @Query('reportType') reportType?: string,
    @Query('ranges') ranges?: string,
    @Query('gradeId') gradeId?: string,
    @Query('educationType') educationType?: string,
    @Query('keyEmployee') keyEmployee?: string,
    @Query('basisType') basisType?: string,
    @Query('employeeIds') employeeIds?: string,
    @Query('positionIds') positionIds?: string,
    @Query('scheduleIds') scheduleIds?: string,
    @Query('filterByDept') filterByDept?: string,
    @Query('divisionGroupIds') divisionGroupIds?: string,
    @Query('yearsFrom') yearsFrom?: string,
    @Query('yearsTo') yearsTo?: string,
    @Query('rules') rules?: string,
    @Query('kinds') kinds?: string,
    @Query('account') account?: string,
    @Query('currency') currency?: string,
    @Query('subconto') subconto?: string,
    @Query('showQty') showQty?: string,
    @Query('showAmount') showAmount?: string,
    @Query('excludeExtra') excludeExtra?: string,
    @Query('relations') relations?: string,
    @Query('gender') gender?: string,
    @Query('ageFrom') ageFrom?: string,
    @Query('ageTo') ageTo?: string,
    @Query('showHidden') showHidden?: string,
    @Query('withoutAccess') withoutAccess?: string,
    @Query('locationIds') locationIds?: string,
    @Query('gradeIds') gradeIds?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('details') details?: string,
    @Query('cfg') cfg?: string,
    @Query('positionType') positionType?: string,
    /** one-time: accrual | deduction | both (path param is already `kind` = report name) */
    @Query('filterKind') filterKind?: string,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.catalog.exportAnalytics(
      this.catalog.requireTenant(t),
      kind,
      {
        year: year ? Number(year) : undefined,
        month: month ? Number(month) : undefined,
        from,
        to,
        date,
        divisionId,
        divisionIds,
        divisionGroupId,
        divisionGroupIds,
        positionId,
        positionGroupId,
        reportType,
        ranges,
        gradeId,
        educationType,
        keyEmployee,
        basisType,
        employeeIds,
        positionIds,
        scheduleIds,
        filterByDept,
        yearsFrom,
        yearsTo,
        rules,
        kinds,
        kind: filterKind || kinds || reportType,
        account,
        currency,
        subconto,
        showQty: showQty === '1' || showQty === 'true',
        showAmount: showAmount !== '0' && showAmount !== 'false',
        excludeExtra: excludeExtra === '1' || excludeExtra === 'true',
        relations,
        gender,
        ageFrom,
        ageTo,
        showHidden,
        withoutAccess,
        locationIds,
        gradeIds,
        startTime,
        endTime,
        details,
        cfg,
        positionType,
      },
    );
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('lookups')
  lookups(@CurrentTenant() t: string | null) {
    return this.catalog.lookups(this.catalog.requireTenant(t));
  }

  // —— Clearance helpers ——

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('clearance-templates/:id/items')
  addTemplateItem(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() body: { title: string; department?: string; sortOrder?: number },
  ) {
    return this.catalog.addClearanceTemplateItem(this.catalog.requireTenant(t), id, body);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch('clearance-items/:id')
  updateClearanceItem(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() body: { status?: string; note?: string },
  ) {
    return this.catalog.updateClearanceItem(this.catalog.requireTenant(t), id, body);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('grade-history/fill')
  fillGradePromotion(
    @CurrentTenant() t: string | null,
    @Body() body: { divisionId?: string; employeeIds?: string[] },
  ) {
    return this.catalog.fillGradePromotionLines(this.catalog.requireTenant(t), {
      divisionId: body.divisionId,
      employeeIds: body.employeeIds,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('grade-history/recommendations')
  gradeRecommendations(@CurrentTenant() t: string | null) {
    return this.catalog.listPendingGradeRecommendations(
      this.catalog.requireTenant(t),
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('grade-history/:id/post')
  postGradePromotion(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postGradePromotion(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('name-changes/:id/post')
  postNameChange(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postNameChange(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('name-changes/:id/cancel')
  cancelNameChange(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.cancelNameChange(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('wage-changes/:id/post')
  postWageChange(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postWageChange(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('wage-changes/:id/cancel')
  cancelWageChange(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.cancelWageChange(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheet-adjustments/:id/post')
  postTimesheetCorrection(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postTimesheetCorrection(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheet-adjustments/:id/cancel')
  cancelTimesheetCorrection(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.cancelTimesheetCorrection(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('schedule-overrides/:id/post')
  postIndividualSchedule(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postIndividualSchedule(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('schedule-overrides/:id/cancel')
  cancelIndividualSchedule(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.cancelIndividualSchedule(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('schedule-overrides/fill')
  fillIndividualSchedule(
    @CurrentTenant() t: string | null,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalog.fillIndividualSchedule(this.catalog.requireTenant(t), body as any);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('position-schedules/:id/post')
  postPositionScheduleDoc(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postPositionScheduleDoc(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('position-schedules/:id/cancel')
  cancelPositionScheduleDoc(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.cancelPositionScheduleDoc(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('position-schedules/fill')
  fillPositionScheduleDoc(
    @CurrentTenant() t: string | null,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalog.fillPositionScheduleDoc(this.catalog.requireTenant(t), body as any);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('schedule-overrides/template.xlsx')
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'documentId', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  async scheduleOverridesTemplate(
    @CurrentTenant() t: string | null,
    @Res() res: Response,
    @Query('month') month?: string,
    @Query('documentId') documentId?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const { buffer, filename } = await this.catalog.downloadScheduleTemplate(
      this.catalog.requireTenant(t),
      { resource: 'schedule-overrides', month, documentId, divisionId },
    );
    return sendExcelAttachment(res, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('position-schedules/template.xlsx')
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'documentId', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'fillOnlyWithEmployees', required: false })
  async positionSchedulesTemplate(
    @CurrentTenant() t: string | null,
    @Res() res: Response,
    @Query('month') month?: string,
    @Query('documentId') documentId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('fillOnlyWithEmployees') fillOnlyWithEmployees?: string,
  ) {
    const { buffer, filename } = await this.catalog.downloadScheduleTemplate(
      this.catalog.requireTenant(t),
      {
        resource: 'position-schedules',
        month,
        documentId,
        divisionId,
        fillOnlyWithEmployees: fillOnlyWithEmployees !== '0' && fillOnlyWithEmployees !== 'false',
      },
    );
    return sendExcelAttachment(res, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('schedule-overrides/import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentId: { type: 'string' },
        month: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', excelImportMulterOptions))
  importScheduleOverrides(
    @CurrentTenant() t: string | null,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentId?: string; month?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    return this.catalog.importScheduleTemplate(this.catalog.requireTenant(t), {
      resource: 'schedule-overrides',
      file: file.buffer,
      documentId: body.documentId,
      month: body.month,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('position-schedules/import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentId: { type: 'string' },
        month: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', excelImportMulterOptions))
  importPositionSchedules(
    @CurrentTenant() t: string | null,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentId?: string; month?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    return this.catalog.importScheduleTemplate(this.catalog.requireTenant(t), {
      resource: 'position-schedules',
      file: file.buffer,
      documentId: body.documentId,
      month: body.month,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('shift-assignments')
  listShiftAssignments(
    @CurrentTenant() t: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.catalog.listShiftAssignments(this.catalog.requireTenant(t), {
      from,
      to,
      employeeId,
      status,
      q,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('shift-assignments/rebuild')
  rebuildShiftAssignments(
    @CurrentTenant() t: string | null,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalog.rebuildShiftAssignments(this.catalog.requireTenant(t), body as any);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('shift-assignments/bulk-action')
  bulkShiftAssignments(
    @CurrentTenant() t: string | null,
    @Body() body: { ids?: string[]; action?: string },
  ) {
    return this.catalog.bulkShiftAssignments(this.catalog.requireTenant(t), body);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('rosters/:id/post')
  postWorkRoster(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postWorkRoster(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('rosters/:id/cancel')
  cancelWorkRoster(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.cancelWorkRoster(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('rosters/fill')
  fillWorkRoster(
    @CurrentTenant() t: string | null,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalog.fillWorkRoster(this.catalog.requireTenant(t), body as any);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('clearance-sheets/:id/complete')
  completeClearance(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
  ) {
    return this.catalog.completeClearanceSheet(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('clearance-sheets/:id/cancel')
  cancelClearance(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
  ) {
    return this.catalog.cancelClearanceSheet(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('tariff-approvals/bulk-post')
  bulkPostTariffApprovals(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() body: { ids?: string[] },
  ) {
    return this.catalog.bulkPostTariffApprovals(
      this.catalog.requireTenant(t),
      body.ids ?? [],
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('tariff-approvals/bulk-delete')
  bulkDeleteTariffApprovals(
    @CurrentTenant() t: string | null,
    @Body() body: { ids?: string[] },
  ) {
    return this.catalog.bulkDeleteTariffApprovals(
      this.catalog.requireTenant(t),
      body.ids ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('tariff-approvals/:id/approve')
  approveTariffApproval(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.approveTariffApproval(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('tariff-approvals/:id/post')
  postTariffApproval(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postTariffApproval(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('tariff-approvals/:id/reject')
  rejectTariffApproval(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.rejectTariffApproval(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('settlements/:id/post')
  postSettlement(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.postSettlement(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('settlements/:id/close')
  closeSettlement(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.closeSettlement(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('sales-accruals/:id/post')
  postSalesAccrual(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.postSalesAccrual(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('sales-accruals/:id/cancel')
  cancelSalesAccrual(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.cancelSalesAccrual(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('facts/import/template.xlsx')
  async factsImportTemplate(
    @CurrentTenant() t: string | null,
    @Res() res: Response,
  ) {
    this.catalog.requireTenant(t);
    const { buffer, filename } = await this.catalog.buildFactsImportTemplate();
    return sendExcelAttachment(res, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('facts/import')
  importFacts(
    @CurrentTenant() t: string | null,
    @Body() body: { rows?: Record<string, unknown>[] },
  ) {
    return this.catalog.importFacts(
      this.catalog.requireTenant(t),
      body.rows ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('payment-orders/:id/send')
  sendPaymentOrder(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.sendPaymentOrder(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('payment-orders/:id/pay')
  payPaymentOrder(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.payPaymentOrder(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('gph-contracts/:id/activate')
  activateGphContract(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.activateGphContract(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('gph-contracts/:id/close')
  closeGphContract(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.closeGphContract(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('gph-contracts/:id/post')
  postGphContract(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.catalog.postGphContract(
      this.catalog.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('gph-contracts/:id/unpost')
  unpostGphContract(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.catalog.unpostGphContract(this.catalog.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('timesheet-adjustments/fill-hours')
  fillTimesheetHours(
    @CurrentTenant() t: string | null,
    @Body()
    body: {
      employeeIds?: string[];
      divisionId?: string;
      periodFrom: string;
      periodTo: string;
      meta?: Record<string, unknown>;
    },
  ) {
    return this.catalog.fillTimesheetCorrectionHours(this.catalog.requireTenant(t), body);
  }

  // —— Generic CRUD ——

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get(':resource/export.xlsx')
  @ApiQuery({ name: 'active', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async exportResource(
    @CurrentTenant() t: string | null,
    @Param('resource') resource: string,
    @Query('active') active?: string,
    @Query('isActive') isActive?: string,
    @Query('employeeId') employeeId?: string,
    @Query('contractId') contractId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    const parsedActive =
      isActive === '1' || isActive === 'true'
        ? true
        : isActive === '0' || isActive === 'false'
          ? false
          : undefined;
    const { buffer, filename } = await this.catalog.exportResource(
      this.catalog.requireTenant(t),
      resource,
      {
        activeOnly: active === '1' || active === 'true',
        employeeId,
        contractId,
        status,
        type,
        isActive: parsedActive,
        from,
        to,
      },
    );
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get(':resource/:id')
  getOne(
    @CurrentTenant() t: string | null,
    @Param('resource') resource: string,
    @Param('id') id: string,
  ) {
    return this.catalog.getOne(this.catalog.requireTenant(t), resource, id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get(':resource')
  list(
    @CurrentTenant() t: string | null,
    @Param('resource') resource: string,
    @Query('active') active?: string,
    @Query('isActive') isActive?: string,
    @Query('employeeId') employeeId?: string,
    @Query('contractId') contractId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsedActive =
      isActive === '1' || isActive === 'true'
        ? true
        : isActive === '0' || isActive === 'false'
          ? false
          : undefined;
    return this.catalog.list(this.catalog.requireTenant(t), resource, {
      activeOnly: active === '1' || active === 'true',
      employeeId,
      contractId,
      status,
      type,
      isActive: parsedActive,
      from,
      to,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':resource')
  create(
    @CurrentTenant() t: string | null,
    @Param('resource') resource: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalog.create(this.catalog.requireTenant(t), resource, body);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':resource/:id')
  update(
    @CurrentTenant() t: string | null,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalog.update(this.catalog.requireTenant(t), resource, id, body);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':resource/:id')
  remove(
    @CurrentTenant() t: string | null,
    @Param('resource') resource: string,
    @Param('id') id: string,
  ) {
    return this.catalog.remove(this.catalog.requireTenant(t), resource, id);
  }
}
