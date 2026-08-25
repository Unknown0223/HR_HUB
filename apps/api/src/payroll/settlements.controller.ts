import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  BulkPairIdsDto,
  CreateAccountPairDto,
  CreateSettlementDto,
  RefreshSettlementDto,
  UpdateAccountPairDto,
  UpdateSettlementDto,
} from './settlements.dto';
import { SettlementsService } from './settlements.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-account-pairs')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/account-pairs')
export class AccountPairsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.settlements.listPairs(this.settlements.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(@CurrentTenant() tenantId: string | null, @Body() dto: CreateAccountPairDto) {
    return this.settlements.createPair(this.settlements.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-status')
  bulkStatus(@CurrentTenant() tenantId: string | null, @Body() dto: BulkPairIdsDto) {
    return this.settlements.bulkPairStatus(
      this.settlements.requireTenant(tenantId),
      dto.ids ?? [],
      dto.isActive !== false,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkPairIdsDto) {
    return this.settlements.bulkPairDelete(this.settlements.requireTenant(tenantId), dto.ids ?? []);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.settlements.getPair(this.settlements.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateAccountPairDto,
  ) {
    return this.settlements.updatePair(this.settlements.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.settlements.removePair(this.settlements.requireTenant(tenantId), id);
  }
}

@ApiTags('payroll-settlements')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.settlements.list(this.settlements.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('refresh')
  refresh(@CurrentTenant() tenantId: string | null, @Body() dto: RefreshSettlementDto) {
    return this.settlements.refresh(this.settlements.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('history')
  history(
    @CurrentTenant() tenantId: string | null,
    @Query('settlementId') settlementId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    return this.settlements.history(this.settlements.requireTenant(tenantId), {
      settlementId,
      from,
      to,
      search: q,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-post')
  bulkPost(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkIdsDto,
  ) {
    const tid = this.settlements.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.settlements.post(tid, id, user?.userId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-cancel')
  bulkCancel(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkIdsDto,
  ) {
    const tid = this.settlements.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.settlements.cancel(tid, id, user?.userId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.settlements.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.settlements.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.settlements.create(this.settlements.requireTenant(tenantId), dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.settlements.get(this.settlements.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSettlementDto,
  ) {
    return this.settlements.update(this.settlements.requireTenant(tenantId), id, dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.settlements.remove(this.settlements.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/post')
  post(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.settlements.post(this.settlements.requireTenant(tenantId), id, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/cancel')
  cancel(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.settlements.cancel(this.settlements.requireTenant(tenantId), id, user?.userId);
  }
}
