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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AttendanceService } from './attendance.service';
import {
  AssignScheduleDto,
  ApplyMarkSettingsDto,
  BulkDeviceIdsDto,
  BulkMarksDto,
  CopyMarksDto,
  CopyMarksPreviewDto,
  CreateDeviceDto,
  CreateLocationDto,
  CreateManualMarkDto,
  CreateProductionCalendarDto,
  CreateQrCodeDto,
  CreateScheduleDto,
  DeviceIgnoreDto,
  GpsPunchDto,
  IngestHeartbeatDto,
  IngestPunchDto,
  QrPunchDto,
  UpdateDeviceDto,
  UpdateLocationDto,
  UpdateMarkDto,
  UpdateProductionCalendarDto,
  UpdateQrCodeDto,
  UpdateScheduleDto,
  ChangeDevicePasswordDto,
  SyncDevicePasswordDto,
  RemoteDeviceCommandDto,
} from './dto';
import { ImportRowsDto } from '../common/import.dto';
import { sendExcelAttachment } from '../common/excel';
import { Roles, Public } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { SkipTenant } from '../tenant/decorators';
import { PunchIngestGuard } from './punch-ingest.guard';
import { PunchRateLimitGuard } from './punch-rate-limit.guard';

@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // --- Locations ---
  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('locations')
  @ApiQuery({ name: 'filter', required: false, description: 'active | inactive' })
  listLocations(
    @CurrentTenant() tenantId: string | null,
    @Query('filter') filter?: string,
  ) {
    return this.attendance.listLocations(
      this.attendance.requireTenant(tenantId),
      filter,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('locations')
  createLocation(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateLocationDto,
  ) {
    return this.attendance.createLocation(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('locations/:id')
  getLocation(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.getLocation(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('locations/:id')
  updateLocation(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.attendance.updateLocation(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('locations/:id')
  deleteLocation(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.deleteLocation(
      this.attendance.requireTenant(tenantId),
      id,
    );
  }

  // --- Devices ---
  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('devices')
  @ApiQuery({ name: 'filter', required: false, description: 'new = never seen AND status new/registered' })
  listDevices(
    @CurrentTenant() tenantId: string | null,
    @Query('filter') filter?: string,
  ) {
    return this.attendance.listDevices(this.attendance.requireTenant(tenantId), filter);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices')
  createDevice(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateDeviceDto,
  ) {
    return this.attendance.createDevice(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/register-gw')
  registerGw(@CurrentTenant() tenantId: string | null) {
    return this.attendance.registerTenantDevices(
      this.attendance.requireTenant(tenantId),
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/bulk-delete')
  bulkDeleteDevices(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkDeviceIdsDto,
  ) {
    return this.attendance.bulkDeleteDevices(
      this.attendance.requireTenant(tenantId),
      dto.ids,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('devices/:id')
  getDevice(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.getDevice(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('devices/:id')
  updateDevice(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.attendance.updateDevice(this.attendance.requireTenant(tenantId), id, dto);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/change-password')
  changeDevicePassword(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ChangeDevicePasswordDto,
  ) {
    return this.attendance.changeDevicePassword(
      this.attendance.requireTenant(tenantId),
      id,
      dto.newPassword,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/sync-password')
  syncDevicePassword(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: SyncDevicePasswordDto,
  ) {
    return this.attendance.syncDevicePassword(
      this.attendance.requireTenant(tenantId),
      id,
      dto.password,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('devices/:id')
  deleteDevice(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.deleteDevice(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/sync')
  syncDevice(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.syncDevice(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/remote')
  remoteDevice(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: RemoteDeviceCommandDto,
  ) {
    return this.attendance.remoteDeviceCommand(
      this.attendance.requireTenant(tenantId),
      id,
      dto.action,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/apply-mark-settings')
  applyMarkSettings(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ApplyMarkSettingsDto,
  ) {
    return this.attendance.applyMarkSettings(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('devices/:id/persons')
  listDevicePersons(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.listDevicePersons(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/persons/sync')
  syncDevicePersons(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.syncDevicePersons(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('devices/:id/marks')
  @ApiQuery({ name: 'all', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listDeviceMarks(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Query('all') all?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendance.listDeviceMarks(this.attendance.requireTenant(tenantId), id, {
      page,
      limit,
      all: all === '1' || all === 'true',
    });
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('devices/:id/commands')
  listDeviceCommands(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.listDeviceCommands(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('devices/:id/ignored-persons')
  @ApiQuery({ name: 'scope', required: false, description: 'attached | available' })
  listIgnoredPersons(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Query('scope') scope?: string,
  ) {
    return this.attendance.listIgnoredPersons(
      this.attendance.requireTenant(tenantId),
      id,
      scope === 'available' ? 'available' : 'attached',
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/ignored-persons')
  attachIgnoredPersons(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: DeviceIgnoreDto,
  ) {
    return this.attendance.setIgnoredPersons(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
      'attach',
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('devices/:id/ignored-persons')
  detachIgnoredPersons(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: DeviceIgnoreDto,
  ) {
    return this.attendance.setIgnoredPersons(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
      'detach',
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('devices/:id/ignored-divisions')
  @ApiQuery({ name: 'scope', required: false, description: 'attached | available' })
  listIgnoredDivisions(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Query('scope') scope?: string,
  ) {
    return this.attendance.listIgnoredDivisions(
      this.attendance.requireTenant(tenantId),
      id,
      scope === 'available' ? 'available' : 'attached',
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/ignored-divisions')
  attachIgnoredDivisions(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: DeviceIgnoreDto,
  ) {
    return this.attendance.setIgnoredDivisions(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
      'attach',
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('devices/:id/ignored-divisions')
  detachIgnoredDivisions(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: DeviceIgnoreDto,
  ) {
    return this.attendance.setIgnoredDivisions(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
      'detach',
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('devices/:id/heartbeat')
  heartbeat(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.heartbeat(this.attendance.requireTenant(tenantId), id);
  }

  // --- Schedules ---
  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('schedules')
  @ApiQuery({ name: 'mode', required: false, description: 'rosters = include assigned employees' })
  listSchedules(
    @CurrentTenant() tenantId: string | null,
    @Query('mode') mode?: string,
  ) {
    return this.attendance.listSchedules(this.attendance.requireTenant(tenantId), mode);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('schedules/:id')
  getSchedule(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.getSchedule(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('schedules')
  createSchedule(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.attendance.createSchedule(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('schedules/:id')
  updateSchedule(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.attendance.updateSchedule(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('schedules/:id')
  deleteSchedule(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.deleteSchedule(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('schedules/:id/fill')
  fillSchedule(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body()
    body?: { year?: number; weekPattern?: string; dayNormHours?: number },
  ) {
    return this.attendance.fillScheduleYear(
      this.attendance.requireTenant(tenantId),
      id,
      body as { year?: number; weekPattern?: '6/1' | '5/1' | '5/2'; dayNormHours?: number },
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('schedules/:id/assign')
  assignSchedule(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: AssignScheduleDto,
  ) {
    return this.attendance.assignSchedule(
      this.attendance.requireTenant(tenantId),
      id,
      dto.employeeId,
    );
  }

  // --- Production calendars ---
  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('production-calendars')
  listProductionCalendars(@CurrentTenant() tenantId: string | null) {
    return this.attendance.listProductionCalendars(
      this.attendance.requireTenant(tenantId),
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('production-calendars/:id')
  getProductionCalendar(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.getProductionCalendar(
      this.attendance.requireTenant(tenantId),
      id,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('production-calendars')
  createProductionCalendar(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateProductionCalendarDto,
  ) {
    return this.attendance.createProductionCalendar(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('production-calendars/:id')
  updateProductionCalendar(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateProductionCalendarDto,
  ) {
    return this.attendance.updateProductionCalendar(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('production-calendars/:id')
  deleteProductionCalendar(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.deleteProductionCalendar(
      this.attendance.requireTenant(tenantId),
      id,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('production-calendars/:id/recalculate')
  recalculateProductionCalendar(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.recalculateProductionCalendar(
      this.attendance.requireTenant(tenantId),
      id,
    );
  }

  // --- QR ---
  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('qr-codes')
  listQr(@CurrentTenant() tenantId: string | null) {
    return this.attendance.listQrCodes(this.attendance.requireTenant(tenantId));
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('qr-codes')
  createQr(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateQrCodeDto,
  ) {
    return this.attendance.createQrCode(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('qr-codes/:id')
  updateQr(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateQrCodeDto,
  ) {
    return this.attendance.updateQrCode(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Post('punches/qr')
  punchQr(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: QrPunchDto,
  ) {
    return this.attendance.punchQr(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Post('punches/gps')
  punchGps(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: GpsPunchDto,
  ) {
    return this.attendance.punchGps(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  // --- Marks / days / problems ---
  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('marks')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'markTypes', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listMarks(
    @CurrentTenant() tenantId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: string,
    @Query('locationId') locationId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('markTypes') markTypes?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendance.listMarks(this.attendance.requireTenant(tenantId), {
      from,
      to,
      employeeId,
      locationId,
      divisionId,
      markTypes,
      q,
      page,
      limit,
    });
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('marks/latest')
  @ApiQuery({ name: 'limit', required: false })
  listLatestMarks(
    @CurrentTenant() tenantId: string | null,
    @Query('limit') limit?: string,
  ) {
    return this.attendance.listLatestMarks(
      this.attendance.requireTenant(tenantId),
      limit ? Number(limit) : 12,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('marks/import/template.xlsx')
  async marksImportTemplate(
    @CurrentTenant() tenantId: string | null,
    @Res() res: Response,
  ) {
    this.attendance.requireTenant(tenantId);
    const { buffer, filename } = await this.attendance.marksImportTemplate();
    sendExcelAttachment(res, buffer, filename);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('marks/import')
  @ApiBody({ type: ImportRowsDto })
  importMarks(
    @CurrentTenant() tenantId: string | null,
    @Body() body: ImportRowsDto,
  ) {
    return this.attendance.importMarks(
      this.attendance.requireTenant(tenantId),
      body.rows ?? [],
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('marks')
  createMark(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateManualMarkDto,
  ) {
    return this.attendance.createManualMark(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('marks/bulk')
  bulkMarks(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkMarksDto,
  ) {
    return this.attendance.bulkMarks(this.attendance.requireTenant(tenantId), dto);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('marks/copy/preview')
  copyMarksPreview(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CopyMarksPreviewDto,
  ) {
    return this.attendance.copyMarksPreview(
      this.attendance.requireTenant(tenantId),
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('marks/copy')
  copyMarks(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CopyMarksDto,
  ) {
    return this.attendance.copyMarks(this.attendance.requireTenant(tenantId), dto);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('marks/:id')
  getMark(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.getMark(this.attendance.requireTenant(tenantId), id);
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch('marks/:id')
  updateMark(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateMarkDto,
  ) {
    return this.attendance.updateMark(
      this.attendance.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('marks/:id')
  deleteMark(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.deleteMark(
      this.attendance.requireTenant(tenantId),
      id,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('location-tracking')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  locationTracking(
    @CurrentTenant() tenantId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.attendance.locationTracking(this.attendance.requireTenant(tenantId), {
      from,
      to,
      employeeId,
      divisionId,
    });
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('gps-tracking')
  @ApiQuery({ name: 'q', required: false })
  gpsTrackingBoard(
    @CurrentTenant() tenantId: string | null,
    @Query('q') q?: string,
  ) {
    return this.attendance.gpsTrackingBoard(this.attendance.requireTenant(tenantId), {
      q,
    });
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('gps-tracking/:employeeId')
  @ApiQuery({ name: 'date', required: false })
  gpsTrackingDetail(
    @CurrentTenant() tenantId: string | null,
    @Param('employeeId') employeeId: string,
    @Query('date') date?: string,
  ) {
    return this.attendance.gpsTrackingDetail(
      this.attendance.requireTenant(tenantId),
      employeeId,
      date,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('days')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listDays(
    @CurrentTenant() tenantId: string | null,
    @Query('date') date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendance.listDays(this.attendance.requireTenant(tenantId), {
      date,
      page,
      limit,
    });
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('problems')
  listProblems(@CurrentTenant() tenantId: string | null) {
    return this.attendance.listProblems(this.attendance.requireTenant(tenantId));
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('problems/:id/resolve')
  resolveProblem(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.attendance.resolveProblem(
      this.attendance.requireTenant(tenantId),
      id,
    );
  }

  @ApiBearerAuth()
  @ApiSecurity('tenant')
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('days/mark-absents')
  markAbsents(@CurrentTenant() tenantId: string | null) {
    return this.attendance.markAbsentsForToday(
      this.attendance.requireTenant(tenantId),
    );
  }

  /**
   * Device gateway / integrations punch ingest.
   * Production: PUNCH_INGEST_API_KEY is required (API will not start without it).
   * Local/dev: empty key stays open for lab. Set key → require X-Punch-Key (or Bearer).
   * Optional: PUNCH_INGEST_RATE_LIMIT_PER_MIN → per-IP rate limit (0/unset = off).
   * NATS consumer path is separate and unaffected.
   */
  @Public()
  @SkipTenant()
  @UseGuards(PunchIngestGuard, PunchRateLimitGuard)
  @ApiHeader({
    name: 'X-Punch-Key',
    required: false,
    description:
      'Required in production and whenever PUNCH_INGEST_API_KEY is set',
  })
  @Post('punches/ingest')
  ingest(@Body() dto: IngestPunchDto) {
    return this.attendance.ingestPunch(dto);
  }

  /** Device-gw online pulse (~8s). Auth same as punches/ingest. */
  @Public()
  @SkipTenant()
  @UseGuards(PunchIngestGuard, PunchRateLimitGuard)
  @ApiHeader({
    name: 'X-Punch-Key',
    required: false,
    description:
      'Required in production and whenever PUNCH_INGEST_API_KEY is set',
  })
  @Post('heartbeats/ingest')
  ingestHeartbeat(@Body() dto: IngestHeartbeatDto) {
    return this.attendance.recordDeviceHeartbeat(dto);
  }
}
