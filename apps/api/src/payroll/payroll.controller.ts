import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { sendExcelAttachment } from '../common/excel';
import { ImportRowsDto } from '../common/import.dto';
import {
  BulkFinePolicyIdsDto,
  CalculatePeriodDto,
  CreateAdvanceDto,
  CreateAllowancePolicyDto,
  CreateFinePolicyDto,
  CreateManualLineDto,
  CreatePeriodDto,
  CreatePolicyDto,
  CreateTimesheetSheetDto,
  FillTimesheetDto,
  TimesheetSettingsDto,
  UpdateAllowancePolicyDto,
  UpdateFinePolicyDto,
  UpdateTimesheetSheetDto,
} from './dto';
import { PayrollService } from './payroll.service';

@ApiTags('payroll')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('policies')
  listPolicies(@CurrentTenant() tenantId: string | null) {
    return this.payroll.listPolicies(this.payroll.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('policies')
  createPolicy(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreatePolicyDto,
  ) {
    return this.payroll.createPolicy(this.payroll.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('fine-policies')
  @ApiQuery({ name: 'scope', required: false })
  listFinePolicies(
    @CurrentTenant() tenantId: string | null,
    @Query('scope') scope?: string,
  ) {
    return this.payroll.listFinePolicies(
      this.payroll.requireTenant(tenantId),
      scope,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fine-policies')
  createFinePolicy(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateFinePolicyDto,
  ) {
    return this.payroll.createFinePolicy(
      this.payroll.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fine-policies/bulk-delete')
  bulkDeleteFinePolicies(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkFinePolicyIdsDto,
  ) {
    return this.payroll.bulkDeleteFinePolicies(
      this.payroll.requireTenant(tenantId),
      dto.ids ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('fine-policies/:id')
  getFinePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.getFinePolicy(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('fine-policies/:id')
  updateFinePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateFinePolicyDto,
  ) {
    return this.payroll.updateFinePolicy(
      this.payroll.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('fine-policies/:id')
  deleteFinePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.deleteFinePolicy(
      this.payroll.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fine-policies/:id/copy')
  copyFinePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.copyFinePolicy(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('allowance-policies')
  @ApiQuery({ name: 'scope', required: false })
  listAllowancePolicies(
    @CurrentTenant() tenantId: string | null,
    @Query('scope') scope?: string,
  ) {
    return this.payroll.listAllowancePolicies(
      this.payroll.requireTenant(tenantId),
      scope,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('allowance-policies')
  createAllowancePolicy(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateAllowancePolicyDto,
  ) {
    return this.payroll.createAllowancePolicy(
      this.payroll.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('allowance-policies/bulk-delete')
  bulkDeleteAllowancePolicies(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkFinePolicyIdsDto,
  ) {
    return this.payroll.bulkDeleteAllowancePolicies(
      this.payroll.requireTenant(tenantId),
      dto.ids ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('allowance-policies/:id')
  getAllowancePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.getAllowancePolicy(
      this.payroll.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('allowance-policies/:id')
  updateAllowancePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateAllowancePolicyDto,
  ) {
    return this.payroll.updateAllowancePolicy(
      this.payroll.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('allowance-policies/:id')
  deleteAllowancePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.deleteAllowancePolicy(
      this.payroll.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('allowance-policies/:id/copy')
  copyAllowancePolicy(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.copyAllowancePolicy(
      this.payroll.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('periods')
  listPeriods(@CurrentTenant() tenantId: string | null) {
    return this.payroll.listPeriods(this.payroll.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('periods')
  createPeriod(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreatePeriodDto,
  ) {
    return this.payroll.createPeriod(this.payroll.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('periods/:id')
  getPeriod(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.getPeriod(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('periods/:id/calculate')
  calculate(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CalculatePeriodDto,
  ) {
    return this.payroll.calculatePeriod(
      this.payroll.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('periods/:id/close')
  closePeriod(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.closePeriod(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('periods/:id/reopen')
  reopenPeriod(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.reopenPeriod(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('periods/:id/vedomost')
  vedomost(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.vedomost(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('lines')
  createLine(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateManualLineDto,
  ) {
    return this.payroll.createManualLine(
      this.payroll.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('lines/import')
  @ApiBody({
    type: ImportRowsDto,
    description:
      'Rows: periodId OR year+month, employeeTabNumber OR employeeId, type? (default other), amount, description?',
  })
  importLines(
    @CurrentTenant() tenantId: string | null,
    @Body() body: ImportRowsDto,
  ) {
    return this.payroll.importLines(
      this.payroll.requireTenant(tenantId),
      body.rows ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('lines/export.xlsx')
  @ApiQuery({ name: 'periodId', required: true })
  async exportLines(
    @CurrentTenant() tenantId: string | null,
    @Query('periodId') periodId: string,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.payroll.exportLinesXlsx(
      this.payroll.requireTenant(tenantId),
      periodId,
    );
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('lines')
  @ApiQuery({ name: 'periodId', required: true })
  listLines(
    @CurrentTenant() tenantId: string | null,
    @Query('periodId') periodId: string,
  ) {
    return this.payroll.listLines(
      this.payroll.requireTenant(tenantId),
      periodId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('lines/:id/post')
  postLine(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.postPayrollLine(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('lines/:id/cancel')
  cancelLine(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.cancelPayrollLine(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('advances')
  listAdvances(@CurrentTenant() tenantId: string | null) {
    return this.payroll.listAdvances(this.payroll.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('advances')
  createAdvance(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateAdvanceDto,
  ) {
    return this.payroll.createAdvance(
      this.payroll.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('advances/import')
  @ApiBody({
    type: ImportRowsDto,
    description:
      'Rows: employeeTabNumber OR employeeId, amount, periodId?, note?, status? (default draft)',
  })
  importAdvances(
    @CurrentTenant() tenantId: string | null,
    @Body() body: ImportRowsDto,
  ) {
    return this.payroll.importAdvances(
      this.payroll.requireTenant(tenantId),
      body.rows ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('advances/export.xlsx')
  async exportAdvances(
    @CurrentTenant() tenantId: string | null,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.payroll.exportAdvancesXlsx(
      this.payroll.requireTenant(tenantId),
    );
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('advances/:id/pay')
  payAdvance(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.payAdvance(this.payroll.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('timesheets/settings')
  getTimesheetSettings(@CurrentTenant() tenantId: string | null) {
    return this.payroll.getTimesheetSettings(this.payroll.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('timesheets/settings')
  patchTimesheetSettings(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: TimesheetSettingsDto,
  ) {
    return this.payroll.patchTimesheetSettings(
      this.payroll.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheets/fill')
  fillTimesheetLines(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: FillTimesheetDto,
  ) {
    return this.payroll.fillTimesheetLines(
      this.payroll.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheets/bulk-post')
  bulkPostTimesheetSheets(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkFinePolicyIdsDto,
  ) {
    return this.payroll.bulkPostTimesheetSheets(
      this.payroll.requireTenant(tenantId),
      dto.ids ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheets/bulk-cancel')
  bulkCancelTimesheetSheets(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkFinePolicyIdsDto,
  ) {
    return this.payroll.bulkCancelTimesheetSheets(
      this.payroll.requireTenant(tenantId),
      dto.ids ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheets/bulk-delete')
  bulkDeleteTimesheetSheets(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkFinePolicyIdsDto,
  ) {
    return this.payroll.bulkDeleteTimesheetSheets(
      this.payroll.requireTenant(tenantId),
      dto.ids ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('timesheets')
  listTimesheetSheets(@CurrentTenant() tenantId: string | null) {
    return this.payroll.listTimesheetSheets(this.payroll.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheets')
  createTimesheetSheet(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateTimesheetSheetDto,
  ) {
    return this.payroll.createTimesheetSheet(
      this.payroll.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('timesheets/:id')
  getTimesheetSheet(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.getTimesheetSheet(
      this.payroll.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('timesheets/:id')
  updateTimesheetSheet(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateTimesheetSheetDto,
  ) {
    return this.payroll.updateTimesheetSheet(
      this.payroll.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('timesheets/:id')
  deleteTimesheetSheet(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.deleteTimesheetSheet(
      this.payroll.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheets/:id/post')
  postTimesheetSheet(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.payroll.postTimesheetSheet(
      this.payroll.requireTenant(tenantId),
      id,
      user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('timesheets/:id/cancel')
  cancelTimesheetSheet(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.payroll.cancelTimesheetSheet(
      this.payroll.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('timesheet')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  timesheet(
    @CurrentTenant() tenantId: string | null,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const y = Number(year);
    const m = Number(month);
    return this.payroll.timesheet(
      this.payroll.requireTenant(tenantId),
      Number.isFinite(y) && y > 1900 ? y : now.getFullYear(),
      Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
    );
  }
}

