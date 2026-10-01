import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { EmployeesService } from './employees.service';
import { MobileAccountsService } from './mobile-accounts.service';
import { SetMobileAccountDto, SetMobileAccountStatusDto } from './mobile-accounts.dto';

@ApiTags('mobile-accounts')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('mobile-accounts')
export class MobileAccountsController {
  constructor(
    private readonly accounts: MobileAccountsService,
    private readonly employees: EmployeesService,
  ) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'filter', required: false, enum: ['with', 'without', 'blocked'] })
  list(
    @CurrentTenant() tenantId: string | null,
    @Query('q') q?: string,
    @Query('filter') filter?: 'with' | 'without' | 'blocked',
  ) {
    return this.accounts.list(this.employees.requireTenant(tenantId), q, filter);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get(':employeeId')
  get(
    @CurrentTenant() tenantId: string | null,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.accounts.get(this.employees.requireTenant(tenantId), employeeId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Put(':employeeId')
  async set(
    @CurrentTenant() tenantId: string | null,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SetMobileAccountDto,
  ) {
    const tid = this.employees.requireTenant(tenantId);
    const result = await this.accounts.sync(tid, employeeId, dto.login, (dto.password ?? '').trim());
    return { result, ...(await this.accounts.get(tid, employeeId)) };
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':employeeId/status')
  setStatus(
    @CurrentTenant() tenantId: string | null,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SetMobileAccountStatusDto,
  ) {
    return this.accounts.setActive(this.employees.requireTenant(tenantId), employeeId, dto.isActive);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':employeeId')
  remove(
    @CurrentTenant() tenantId: string | null,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.accounts.remove(this.employees.requireTenant(tenantId), employeeId);
  }
}
