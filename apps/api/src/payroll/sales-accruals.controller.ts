import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  CreateSalesAccrualDto,
  CalculateSalesAccrualDto,
  FillSalesAccrualDto,
  SaveSalesRatesDto,
  UpdateSalesAccrualDto,
} from './sales-accruals.dto';
import { SalesAccrualsService } from './sales-accruals.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-sales-accruals')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/sales-accruals')
export class SalesAccrualsController {
  constructor(private readonly sales: SalesAccrualsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.sales.list(this.sales.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('rates')
  rates(@CurrentTenant() tenantId: string | null) {
    return this.sales.listRates(this.sales.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('rates')
  saveRates(@CurrentTenant() tenantId: string | null, @Body() dto: SaveSalesRatesDto) {
    return this.sales.saveRates(this.sales.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fill')
  fill(@CurrentTenant() tenantId: string | null, @Body() dto: FillSalesAccrualDto) {
    return this.sales.fill(this.sales.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('calculate')
  calculate(@CurrentTenant() tenantId: string | null, @Body() dto: CalculateSalesAccrualDto) {
    return this.sales.calculate(this.sales.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-post')
  bulkPost(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.sales.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.sales.post(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-unpost')
  bulkUnpost(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.sales.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.sales.unpost(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.sales.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.sales.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSalesAccrualDto,
  ) {
    return this.sales.create(this.sales.requireTenant(tenantId), dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.sales.get(this.sales.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateSalesAccrualDto,
  ) {
    return this.sales.update(this.sales.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.sales.remove(this.sales.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/post')
  post(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.sales.post(this.sales.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/unpost')
  unpost(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.sales.unpost(this.sales.requireTenant(tenantId), id);
  }
}
