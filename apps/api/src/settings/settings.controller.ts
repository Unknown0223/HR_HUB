import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import {
  CreateDictionaryDto,
  CreateDictionaryItemDto,
  CreateIntegrationDto,
  ImportDictionaryItemsDto,
  UpdateDictionaryItemDto,
  CreateUserDto,
  ImportPersonDocsDto,
  UpdatePersonDocsImportDto,
  UpdateOrgSettingsDto,
  UpdatePayrollCalcDto,
  UpdateAccountSettingsDto,
  UpdateSystemSettingsDto,
  UpdateQuickstartDto,
  UpdateUserDto,
} from './dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('org')
  getOrg(@CurrentTenant() tenantId: string | null) {
    return this.settings.getOrg(this.settings.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('org')
  updateOrg(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: UpdateOrgSettingsDto,
  ) {
    return this.settings.updateOrg(this.settings.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('quickstart')
  getQuickstart(@CurrentTenant() tenantId: string | null) {
    return this.settings.getQuickstart(this.settings.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('quickstart')
  updateQuickstart(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: UpdateQuickstartDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.updateQuickstart(
      this.settings.requireTenant(tenantId),
      dto,
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('system')
  getSystem(@CurrentTenant() tenantId: string | null) {
    return this.settings.getSystemSettings(this.settings.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('system')
  updateSystem(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: UpdateSystemSettingsDto | Record<string, unknown>,
  ) {
    return this.settings.updateSystemSettings(
      this.settings.requireTenant(tenantId),
      dto as UpdateSystemSettingsDto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('payroll-calc')
  getPayrollCalc(@CurrentTenant() tenantId: string | null) {
    return this.settings.getPayrollCalc(this.settings.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('payroll-calc')
  updatePayrollCalc(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: UpdatePayrollCalcDto | Record<string, unknown>,
  ) {
    return this.settings.updatePayrollCalc(
      this.settings.requireTenant(tenantId),
      dto as UpdatePayrollCalcDto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('account-settings')
  getAccountSettings(@CurrentTenant() tenantId: string | null) {
    return this.settings.getAccountSettings(
      this.settings.requireTenant(tenantId),
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('account-settings')
  updateAccountSettings(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: UpdateAccountSettingsDto | Record<string, unknown>,
  ) {
    return this.settings.updateAccountSettings(
      this.settings.requireTenant(tenantId),
      dto as UpdateAccountSettingsDto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('account-balance-report')
  getAccountBalanceReportSettings(@CurrentTenant() tenantId: string | null) {
    return this.settings.getAccountBalanceReportSettings(
      this.settings.requireTenant(tenantId),
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('account-balance-report')
  updateAccountBalanceReportSettings(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.settings.updateAccountBalanceReportSettings(
      this.settings.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('users')
  listUsers(@CurrentTenant() tenantId: string | null) {
    return this.settings.listUsers(this.settings.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('users')
  createUser(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.createUser(this.settings.requireTenant(tenantId), dto, user);
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('users/:id')
  updateUser(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.updateUser(
      this.settings.requireTenant(tenantId),
      id,
      dto,
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('users/:id/delete')
  deleteUser(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.deleteUser(this.settings.requireTenant(tenantId), id, user);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('role-access')
  getRoleAccess(@CurrentTenant() tenantId: string | null) {
    return this.settings.getRoleAccess(this.settings.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('role-access')
  updateRoleAccess(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: { grants?: Record<string, Record<string, boolean>> },
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.updateRoleAccess(
      this.settings.requireTenant(tenantId),
      dto,
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('cbu-rates')
  cbuRates(
    @CurrentTenant() tenantId: string | null,
    @Query('date') date?: string,
  ) {
    this.settings.requireTenant(tenantId);
    return this.settings.fetchCbuRates(date);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('dictionaries')
  listDictionaries(
    @CurrentTenant() tenantId: string | null,
    @Query('kind') kind?: string,
  ) {
    return this.settings.listDictionaries(
      this.settings.requireTenant(tenantId),
      kind,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('dictionaries')
  createDictionary(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateDictionaryDto,
  ) {
    return this.settings.createDictionary(
      this.settings.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('dictionaries/:id/items')
  addItem(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateDictionaryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.addDictionaryItem(
      this.settings.requireTenant(tenantId),
      id,
      dto,
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('dictionaries/:id/items/import')
  importItems(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ImportDictionaryItemsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.importDictionaryItems(
      this.settings.requireTenant(tenantId),
      id,
      dto.items || [],
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('dictionaries/:id/items/:itemId')
  updateItem(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateDictionaryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.updateDictionaryItem(
      this.settings.requireTenant(tenantId),
      id,
      itemId,
      dto,
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('dictionaries/:id/items/:itemId/delete')
  deleteItem(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.deleteDictionaryItem(
      this.settings.requireTenant(tenantId),
      id,
      itemId,
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('integrations')
  listIntegrations(@CurrentTenant() tenantId: string | null) {
    return this.settings.listIntegrations(
      this.settings.requireTenant(tenantId),
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('integrations')
  createIntegration(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateIntegrationDto,
  ) {
    return this.settings.createIntegration(
      this.settings.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Patch('integrations/:id')
  updateIntegration(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body()
    body: {
      isActive?: boolean;
      webhookUrl?: string | null;
      config?: Record<string, unknown>;
    },
  ) {
    return this.settings.updateIntegration(
      this.settings.requireTenant(tenantId),
      id,
      body,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Post('integrations/:id/sync')
  syncIntegration(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.settings.syncIntegration(
      this.settings.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('audit')
  listAudit(
    @CurrentTenant() tenantId: string | null,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.settings.listAudit(this.settings.requireTenant(tenantId), {
      entity,
      entityId,
      from,
      to,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('person-docs-import')
  getPersonDocsImport(@CurrentTenant() tenantId: string | null) {
    return this.settings.getPersonDocsImport(this.settings.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('person-docs-import')
  updatePersonDocsImport(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: UpdatePersonDocsImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.updatePersonDocsImport(
      this.settings.requireTenant(tenantId),
      dto,
      user,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('import-person-docs')
  importPersonDocs(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: ImportPersonDocsDto,
  ) {
    return this.settings.importPersonDocuments(
      this.settings.requireTenant(tenantId),
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('person-documents')
  listPersonDocuments(
    @CurrentTenant() tenantId: string | null,
    @Query('limit') limit?: string,
  ) {
    return this.settings.listPersonDocuments(
      this.settings.requireTenant(tenantId),
      limit ? Number(limit) : 100,
    );
  }
}
