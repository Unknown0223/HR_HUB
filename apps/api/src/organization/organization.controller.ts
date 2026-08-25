import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { OrganizationService } from './organization.service';
import {
  CreateDivisionDto,
  CreatePositionDto,
  UpdateActiveDto,
  UpdateDivisionDto,
  UpdatePositionDto,
} from './dto';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { sendCsvAttachment, sendExcelAttachment } from '../common/excel';
import { ImportRowsDto } from '../common/import.dto';

@ApiTags('organization')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('organization')
export class OrganizationController {
  constructor(private readonly org: OrganizationService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('divisions')
  listDivisions(
    @CurrentTenant() tenantId: string | null,
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ) {
    return this.org.listDivisions(this.org.requireTenant(tenantId), status ?? 'all');
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('divisions/tree')
  divisionTree(@CurrentTenant() tenantId: string | null) {
    return this.org.tree(this.org.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('divisions/export.xlsx')
  async exportXlsx(
    @CurrentTenant() tenantId: string | null,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.org.exportTree(
      this.org.requireTenant(tenantId),
      'xlsx',
    );
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('divisions/export.csv')
  async exportCsv(
    @CurrentTenant() tenantId: string | null,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.org.exportTree(
      this.org.requireTenant(tenantId),
      'csv',
    );
    sendCsvAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('divisions/import/template.xlsx')
  async importTemplateXlsx(
    @CurrentTenant() tenantId: string | null,
    @Res() res?: Response,
  ) {
    this.org.requireTenant(tenantId);
    const { buffer, filename } = await this.org.importTemplateXlsx();
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('divisions/import')
  @ApiBody({
    type: ImportRowsDto,
    description:
      'Rows keyed by Verifix headers or English keys: name, code, parent, group, schedule, manager, openedAt, closedAt, project',
  })
  importDivisions(
    @CurrentTenant() tenantId: string | null,
    @Body() body: ImportRowsDto,
  ) {
    return this.org.importDivisions(
      this.org.requireTenant(tenantId),
      body.rows ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('divisions')
  createDivision(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateDivisionDto,
  ) {
    return this.org.createDivision(this.org.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('divisions/:id')
  updateDivision(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateDivisionDto,
  ) {
    return this.org.updateDivision(this.org.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('divisions/:id')
  deleteDivision(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.org.deleteDivision(this.org.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('divisions/:id/active')
  setDivisionActive(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateActiveDto,
  ) {
    return this.org.setDivisionActive(this.org.requireTenant(tenantId), id, dto.isActive);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('divisions/:id')
  getDivision(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.org.getDivision(this.org.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('positions')
  listPositions(
    @CurrentTenant() tenantId: string | null,
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ) {
    return this.org.listPositions(this.org.requireTenant(tenantId), status ?? 'all');
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('positions/import/template.xlsx')
  async importPositionTemplateXlsx(
    @CurrentTenant() tenantId: string | null,
    @Res() res?: Response,
  ) {
    this.org.requireTenant(tenantId);
    const { buffer, filename } = await this.org.importPositionTemplateXlsx();
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('positions/import')
  @ApiBody({ type: ImportRowsDto })
  importPositions(
    @CurrentTenant() tenantId: string | null,
    @Body() body: ImportRowsDto,
  ) {
    return this.org.importPositions(
      this.org.requireTenant(tenantId),
      body.rows ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('positions')
  createPosition(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreatePositionDto,
  ) {
    return this.org.createPosition(this.org.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('positions/:id')
  updatePosition(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.org.updatePosition(this.org.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('positions/:id')
  deletePosition(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.org.deletePosition(this.org.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('positions/:id/active')
  setPositionActive(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateActiveDto,
  ) {
    return this.org.setPositionActive(this.org.requireTenant(tenantId), id, dto.isActive);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('positions/:id')
  getPosition(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.org.getPosition(this.org.requireTenant(tenantId), id);
  }
}
