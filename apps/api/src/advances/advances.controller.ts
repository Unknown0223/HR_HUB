import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  AdvanceLimitDto,
  CreateAdvanceRequestDto,
  ReviewAdvanceRequestDto,
  UpdateAdvanceLimitDto,
} from './advances.dto';
import { AdvancesService } from './advances.service';

/** HR side: review employees' advance requests and manage the caps. */
@ApiTags('advance-requests')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('advance-requests')
export class AdvanceRequestsController {
  constructor(private readonly advances: AdvancesService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'q', required: false })
  list(
    @CurrentTenant() tenantId: string | null,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.advances.list(this.advances.requireTenant(tenantId), { status, q });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('limits')
  listLimits(@CurrentTenant() tenantId: string | null) {
    return this.advances.listLimits(this.advances.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('limits')
  createLimit(@CurrentTenant() tenantId: string | null, @Body() dto: AdvanceLimitDto) {
    return this.advances.createLimit(this.advances.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('limits/:id')
  updateLimit(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateAdvanceLimitDto,
  ) {
    return this.advances.updateLimit(this.advances.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('limits/:id')
  removeLimit(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.advances.removeLimit(this.advances.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/review')
  review(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewAdvanceRequestDto,
  ) {
    return this.advances.review(this.advances.requireTenant(tenantId), id, dto, user);
  }
}

/** Employee side (mobile app). */
@ApiTags('me')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('me/advances')
@Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
export class MeAdvancesController {
  constructor(private readonly advances: AdvancesService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.advances.myOverview(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdvanceRequestDto) {
    return this.advances.create(user, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.advances.cancelMine(user, id);
  }
}
