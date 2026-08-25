import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { Roles } from '../auth/decorators';
import { SkipTenant } from '../tenant/decorators';

@ApiTags('tenants')
@ApiBearerAuth()
@ApiSecurity('tenant')
@SkipTenant()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Roles(Role.platform_admin)
  @Get()
  findAll() {
    return this.tenants.findAll();
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenants.findOne(id);
  }

  @Roles(Role.platform_admin)
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Roles(Role.platform_admin)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }
}
