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
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PersonsService } from './persons.service';
import {
  BulkIdsDto,
  BulkPinDto,
  BulkStatusDto,
  CreatePersonDto,
  UpdatePersonDto,
} from './persons.dto';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';

@ApiTags('persons')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  @ApiQuery({ name: 'unattached', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'fio', required: false })
  @ApiQuery({ name: 'gender', required: false })
  @ApiQuery({ name: 'birthFrom', required: false })
  @ApiQuery({ name: 'birthTo', required: false })
  @ApiQuery({ name: 'regionId', required: false })
  @ApiQuery({ name: 'phone', required: false })
  @ApiQuery({ name: 'blacklisted', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiQuery({ name: 'pinned', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @CurrentTenant() tenantId: string | null,
    @Query('unattached') unattached?: string,
    @Query('q') q?: string,
    @Query('fio') fio?: string,
    @Query('gender') gender?: string,
    @Query('birthFrom') birthFrom?: string,
    @Query('birthTo') birthTo?: string,
    @Query('regionId') regionId?: string,
    @Query('phone') phone?: string,
    @Query('blacklisted') blacklisted?: string,
    @Query('isActive') isActive?: string,
    @Query('pinned') pinned?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.persons.list(this.persons.requireTenant(tenantId), {
      unattached: unattached === '1' || unattached === 'true',
      q,
      fio,
      gender,
      birthFrom,
      birthTo,
      regionId,
      phone,
      blacklisted,
      isActive,
      pinned,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk/status')
  bulkStatus(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkStatusDto,
  ) {
    return this.persons.bulkStatus(
      this.persons.requireTenant(tenantId),
      dto.ids,
      dto.isActive,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk/pin')
  bulkPin(@CurrentTenant() tenantId: string | null, @Body() dto: BulkPinDto) {
    return this.persons.bulkPin(
      this.persons.requireTenant(tenantId),
      dto.ids,
      dto.isPinned,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk/delete')
  bulkDelete(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BulkIdsDto,
  ) {
    return this.persons.bulkDelete(
      this.persons.requireTenant(tenantId),
      dto.ids,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreatePersonDto,
  ) {
    return this.persons.create(this.persons.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.persons.findOne(this.persons.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
  ) {
    return this.persons.update(this.persons.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.persons.remove(this.persons.requireTenant(tenantId), id);
  }
}
