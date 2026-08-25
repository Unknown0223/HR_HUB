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
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { HireDocumentExceptionsService } from './hire-document-exceptions.service';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';

class CreateExceptionDto {
  @ApiProperty() @IsString() divisionId!: string;
  @ApiProperty() @IsString() positionId!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentTypeIds?: string[];
}

class UpdateExceptionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentTypeIds?: string[];
}

@ApiTags('hire-document-exceptions')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('hire-document-exceptions')
export class HireDocumentExceptionsController {
  constructor(private readonly service: HireDocumentExceptionsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(
    @CurrentTenant() tenantId: string | null,
    @Query('q') q?: string,
  ) {
    return this.service.list(this.service.requireTenant(tenantId), q);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(this.service.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateExceptionDto,
  ) {
    return this.service.create(this.service.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateExceptionDto,
  ) {
    return this.service.update(this.service.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.service.remove(this.service.requireTenant(tenantId), id);
  }
}
