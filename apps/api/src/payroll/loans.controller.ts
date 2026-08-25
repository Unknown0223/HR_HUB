import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { CreateLoanDto, UpdateLoanDto } from './loans.dto';
import { LoansService } from './loans.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-loans')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.loans.list(this.loans.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-complete')
  bulkComplete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.loans.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.loans.complete(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-close')
  bulkClose(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.loans.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.loans.close(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.loans.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.loans.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(@CurrentTenant() tenantId: string | null, @Body() dto: CreateLoanDto) {
    return this.loans.create(this.loans.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.loans.get(this.loans.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(@CurrentTenant() tenantId: string | null, @Param('id') id: string, @Body() dto: UpdateLoanDto) {
    return this.loans.update(this.loans.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.loans.remove(this.loans.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/complete')
  complete(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.loans.complete(this.loans.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/close')
  close(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.loans.close(this.loans.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/reopen')
  reopen(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.loans.reopen(this.loans.requireTenant(tenantId), id);
  }
}
