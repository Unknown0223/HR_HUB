import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  CalculateOneTimeAccrualDto,
  CreateOneTimeAccrualDto,
  FillOneTimeAccrualDto,
  UpdateOneTimeAccrualDto,
} from './one-time-accruals.dto';
import { OneTimeAccrualsService } from './one-time-accruals.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-one-time-accruals')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/one-time-accruals')
export class OneTimeAccrualsController {
  constructor(private readonly docs: OneTimeAccrualsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null, @Query('kind') kind?: string) {
    return this.docs.list(this.docs.requireTenant(tenantId), kind);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fill')
  fill(@CurrentTenant() tenantId: string | null, @Body() dto: FillOneTimeAccrualDto) {
    return this.docs.fill(this.docs.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('calculate')
  calculate(@CurrentTenant() tenantId: string | null, @Body() dto: CalculateOneTimeAccrualDto) {
    return this.docs.calculate(this.docs.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-post')
  bulkPost(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.docs.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.docs.post(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-unpost')
  bulkUnpost(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.docs.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.docs.unpost(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.docs.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.docs.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOneTimeAccrualDto,
  ) {
    return this.docs.create(this.docs.requireTenant(tenantId), dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.docs.get(this.docs.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateOneTimeAccrualDto,
  ) {
    return this.docs.update(this.docs.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.docs.remove(this.docs.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/post')
  post(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.docs.post(this.docs.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/unpost')
  unpost(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.docs.unpost(this.docs.requireTenant(tenantId), id);
  }
}
