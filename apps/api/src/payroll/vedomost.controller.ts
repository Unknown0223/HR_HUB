import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  CreateSheetDto,
  FillSheetDto,
  UpdateSheetDto,
  UpdateSheetSettingsDto,
} from './vedomost.dto';
import { VedomostService } from './vedomost.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-vedomost')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/sheets')
export class VedomostController {
  constructor(private readonly sheets: VedomostService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.sheets.list(this.sheets.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fill')
  fill(@CurrentTenant() tenantId: string | null, @Body() dto: FillSheetDto) {
    return this.sheets.fill(this.sheets.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('settings')
  settings(@CurrentTenant() tenantId: string | null) {
    return this.sheets.getSettings(this.sheets.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('settings')
  updateSettings(@CurrentTenant() tenantId: string | null, @Body() dto: UpdateSheetSettingsDto) {
    return this.sheets.updateSettings(this.sheets.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('history')
  history(
    @CurrentTenant() tenantId: string | null,
    @Query('sheetId') sheetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    return this.sheets.history(this.sheets.requireTenant(tenantId), {
      sheetId,
      from,
      to,
      search: q,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-complete')
  bulkComplete(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkIdsDto,
  ) {
    const tid = this.sheets.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.sheets.complete(tid, id, user?.userId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-reopen')
  bulkReopen(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkIdsDto,
  ) {
    const tid = this.sheets.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.sheets.reopen(tid, id, user?.userId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.sheets.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.sheets.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSheetDto,
  ) {
    return this.sheets.create(this.sheets.requireTenant(tenantId), dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.sheets.get(this.sheets.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSheetDto,
  ) {
    return this.sheets.update(this.sheets.requireTenant(tenantId), id, dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.sheets.remove(this.sheets.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/complete')
  complete(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.sheets.complete(this.sheets.requireTenant(tenantId), id, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/reopen')
  reopen(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.sheets.reopen(this.sheets.requireTenant(tenantId), id, user?.userId);
  }
}
