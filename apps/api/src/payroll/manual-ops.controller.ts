import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { CreateManualOpDto, UpdateManualOpDto } from './manual-ops.dto';
import { ManualOpsService } from './manual-ops.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-manual-ops')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/manual-ops')
export class ManualOpsController {
  constructor(private readonly ops: ManualOpsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.ops.list(this.ops.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('history')
  history(
    @CurrentTenant() tenantId: string | null,
    @Query('opId') opId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    return this.ops.history(this.ops.requireTenant(tenantId), { opId, from, to, search: q });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-post')
  bulkPost(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkIdsDto,
  ) {
    const tid = this.ops.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.ops.post(tid, id, user?.userId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-unpost')
  bulkUnpost(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkIdsDto,
  ) {
    const tid = this.ops.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.ops.unpost(tid, id, user?.userId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.ops.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.ops.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManualOpDto,
  ) {
    return this.ops.create(this.ops.requireTenant(tenantId), dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.ops.get(this.ops.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateManualOpDto,
  ) {
    return this.ops.update(this.ops.requireTenant(tenantId), id, dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.ops.remove(this.ops.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/post')
  post(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.ops.post(this.ops.requireTenant(tenantId), id, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/unpost')
  unpost(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.ops.unpost(this.ops.requireTenant(tenantId), id, user?.userId);
  }
}
