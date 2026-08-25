import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';

@ApiTags('users')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.users.findByTenant(tenantId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.users.findOne(tenantId, id);
  }
}
