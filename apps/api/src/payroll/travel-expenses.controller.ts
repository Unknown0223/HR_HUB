import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { CreateTravelExpenseDto, UpdateTravelExpenseDto } from './travel-expenses.dto';
import { TravelExpensesService } from './travel-expenses.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-travel-expenses')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/travel-expenses')
export class TravelExpensesController {
  constructor(private readonly docs: TravelExpensesService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.docs.list(this.docs.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('trips')
  trips(@CurrentTenant() tenantId: string | null, @Query('employeeId') employeeId?: string) {
    return this.docs.listTrips(this.docs.requireTenant(tenantId), employeeId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-complete')
  bulkComplete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.docs.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.docs.complete(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.docs.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.docs.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(@CurrentTenant() tenantId: string | null, @Body() dto: CreateTravelExpenseDto) {
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
    @Body() dto: UpdateTravelExpenseDto,
  ) {
    return this.docs.update(this.docs.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.docs.remove(this.docs.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/complete')
  complete(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.docs.complete(this.docs.requireTenant(tenantId), id);
  }
}
