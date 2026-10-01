import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { AccessService } from './access.service';
import { AccessReasonDto, BulkAccessDto, GrantAccessDto } from './access.dto';

@ApiTags('access')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('options')
  options(@CurrentUser() user: AuthUser) {
    return this.access.options(user.role);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('summary')
  summary(@CurrentTenant() t: string | null) {
    return this.access.summary(this.access.requireTenant(t));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('employees')
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'accessType', required: false })
  @ApiQuery({ name: 'grantStatus', required: false, enum: ['active', 'expiring', 'expired', 'revoked', 'none'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listEmployees(
    @CurrentTenant() t: string | null,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('divisionId') divisionId?: string,
    @Query('positionId') positionId?: string,
    @Query('locationId') locationId?: string,
    @Query('accessType') accessType?: string,
    @Query('grantStatus') grantStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.access.listEmployees(this.access.requireTenant(t), {
      q,
      status,
      divisionId,
      positionId,
      locationId,
      accessType,
      grantStatus,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('employees/:id')
  getEmployee(@CurrentTenant() t: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.access.getEmployee(this.access.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('grants')
  grant(@CurrentTenant() t: string | null, @CurrentUser() user: AuthUser, @Body() dto: GrantAccessDto) {
    return this.access.grant(this.access.requireTenant(t), user, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('grants/:id/revoke')
  revoke(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccessReasonDto,
  ) {
    return this.access.revoke(this.access.requireTenant(t), user, id, dto.reason);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk')
  bulk(@CurrentTenant() t: string | null, @CurrentUser() user: AuthUser, @Body() dto: BulkAccessDto) {
    return this.access.bulk(this.access.requireTenant(t), user, dto);
  }
}
