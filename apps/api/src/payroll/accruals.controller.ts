import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  BulkAccrualIdsDto,
  CreateAccrualDocDto,
  FillAccrualDto,
  UpdateAccrualDocDto,
} from './accruals.dto';
import { AccrualsService } from './accruals.service';

@ApiTags('payroll-accruals')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/accruals')
export class AccrualsController {
  constructor(private readonly accruals: AccrualsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.accruals.list(this.accruals.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('fill')
  fill(@CurrentTenant() tenantId: string | null, @Body() dto: FillAccrualDto) {
    return this.accruals.fill(this.accruals.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-post')
  bulkPost(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAccrualIdsDto,
  ) {
    return this.accruals.bulk(
      this.accruals.requireTenant(tenantId),
      dto.ids ?? [],
      'post',
      user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-cancel')
  bulkCancel(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAccrualIdsDto,
  ) {
    return this.accruals.bulk(
      this.accruals.requireTenant(tenantId),
      dto.ids ?? [],
      'cancel',
      user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkAccrualIdsDto,
  ) {
    return this.accruals.bulk(
      this.accruals.requireTenant(tenantId),
      dto.ids ?? [],
      'delete',
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAccrualDocDto,
  ) {
    return this.accruals.create(
      this.accruals.requireTenant(tenantId),
      dto,
      user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/entries')
  entries(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.accruals.entries(this.accruals.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/history')
  history(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.accruals.history(this.accruals.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/operations')
  operations(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.accruals.operations(this.accruals.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.accruals.get(this.accruals.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccrualDocDto,
  ) {
    return this.accruals.update(
      this.accruals.requireTenant(tenantId),
      id,
      dto,
      user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.accruals.remove(this.accruals.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/post')
  post(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.accruals.post(
      this.accruals.requireTenant(tenantId),
      id,
      user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/cancel')
  cancel(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.accruals.cancel(
      this.accruals.requireTenant(tenantId),
      id,
      user?.userId,
    );
  }
}
