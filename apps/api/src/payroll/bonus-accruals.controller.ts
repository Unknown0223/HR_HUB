import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { CreateBonusAccrualDto, FillBonusAccrualDto, UpdateBonusAccrualDto } from './bonus-accruals.dto';
import { BonusAccrualsService } from './bonus-accruals.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-bonus-accruals')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/bonus-accruals')
export class BonusAccrualsController {
  constructor(private readonly docs: BonusAccrualsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null, @Query('kind') kind?: string) {
    return this.docs.list(this.docs.requireTenant(tenantId), kind);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fill')
  fill(@CurrentTenant() tenantId: string | null, @Body() dto: FillBonusAccrualDto) {
    return this.docs.fill(this.docs.requireTenant(tenantId), dto);
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
  create(@CurrentTenant() tenantId: string | null, @Body() dto: CreateBonusAccrualDto) {
    return this.docs.create(this.docs.requireTenant(tenantId), dto);
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
    @Body() dto: UpdateBonusAccrualDto,
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
