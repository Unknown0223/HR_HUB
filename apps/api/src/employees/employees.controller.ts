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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { EmploymentStatus, EmploymentType, Role } from '@prisma/client';
import type { Response } from 'express';
import { EmployeesService } from './employees.service';
import { FaceService } from './face.service';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdateEmployeeFlagsDto, UpdateEmployeeLocationsDto, UpdateEmployeePersonalDto, UpdateEmployeeContactsDto, CreateEmployeeBankAccountDto, UpdateEmployeeBankAccountDto, CreateEmployeeBankCardDto, UpdateEmployeeBankCardDto, CreateEmployeePersonDocDto, UpdateEmployeePersonDocDto, CreateEmployeeRelativeDto, UpdateEmployeeRelativeDto, UpdateEmployeeMaritalStatusDto, CreateEmployeeCertificateDto, UpdateEmployeeCertificateDto, CreateEmployeeTenureDto, UpdateEmployeeTenureDto, CreateEmployeeWorkplaceDto, UpdateEmployeeWorkplaceDto, CreateEmployeeAwardDto, UpdateEmployeeAwardDto, UpdateEmployeeFileDto, CreateEmployeeInventoryDto, UpdateEmployeeInventoryDto, CreateEmployeeCarDto, UpdateEmployeeCarDto, UpdateEmployeeIdentificationDto, UpdateEmployeeExtraInfoDto, UpdateEmployeeUserSettingsDto, CreateEmployeeMarkBlockDto, UpdateEmployeeMarkBlockDto } from './dto';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { sendCsvAttachment, sendExcelAttachment } from '../common/excel';
import { ImportRowsDto } from '../common/import.dto';

@ApiTags('employees')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly face: FaceService,
  ) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  @ApiQuery({ name: 'status', required: false, enum: EmploymentStatus })
  @ApiQuery({ name: 'employmentType', required: false, enum: EmploymentType })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false, description: '1-based page (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 50, max 500)' })
  list(
    @CurrentTenant() tenantId: string | null,
    @Query('status') status?: EmploymentStatus,
    @Query('employmentType') employmentType?: EmploymentType,
    @Query('divisionId') divisionId?: string,
    @Query('positionId') positionId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.employees.list(this.employees.requireTenant(tenantId), {
      status,
      employmentType,
      divisionId,
      positionId,
      q,
      page,
      limit,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('export.xlsx')
  @ApiQuery({ name: 'status', required: false, enum: EmploymentStatus })
  @ApiQuery({ name: 'employmentType', required: false, enum: EmploymentType })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  @ApiQuery({ name: 'q', required: false })
  async exportXlsx(
    @CurrentTenant() tenantId: string | null,
    @Query('status') status?: EmploymentStatus,
    @Query('employmentType') employmentType?: EmploymentType,
    @Query('divisionId') divisionId?: string,
    @Query('positionId') positionId?: string,
    @Query('q') q?: string,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.employees.exportXlsx(
      this.employees.requireTenant(tenantId),
      { status, employmentType, divisionId, positionId, q },
    );
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('export.csv')
  @ApiQuery({ name: 'status', required: false, enum: EmploymentStatus })
  @ApiQuery({ name: 'employmentType', required: false, enum: EmploymentType })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  @ApiQuery({ name: 'q', required: false })
  async exportCsv(
    @CurrentTenant() tenantId: string | null,
    @Query('status') status?: EmploymentStatus,
    @Query('employmentType') employmentType?: EmploymentType,
    @Query('divisionId') divisionId?: string,
    @Query('positionId') positionId?: string,
    @Query('q') q?: string,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.employees.exportCsv(
      this.employees.requireTenant(tenantId),
      { status, employmentType, divisionId, positionId, q },
    );
    sendCsvAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('import/template.csv')
  async importTemplateCsv(
    @CurrentTenant() tenantId: string | null,
    @Res() res?: Response,
  ) {
    this.employees.requireTenant(tenantId);
    const { buffer, filename } = await this.employees.importTemplateCsv();
    sendCsvAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('import/template.xlsx')
  async importTemplateXlsx(
    @CurrentTenant() tenantId: string | null,
    @Res() res?: Response,
  ) {
    this.employees.requireTenant(tenantId);
    const { buffer, filename } = await this.employees.importTemplateXlsx();
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('import')
  @ApiBody({
    type: ImportRowsDto,
    description:
      'Rows: tabNumber, firstName, lastName, middleName?, email?, divisionCode?|divisionId?, positionCode?|positionId?, baseSalary?, employmentType?, hireDate?',
  })
  importEmployees(
    @CurrentTenant() tenantId: string | null,
    @Body() body: ImportRowsDto,
  ) {
    return this.employees.importEmployees(
      this.employees.requireTenant(tenantId),
      body.rows ?? [],
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/hire-document')
  hireDocument(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.employees.hireDocumentView(
      this.employees.requireTenant(tenantId),
      id,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/reports/:kind/settings')
  getEmployeeReportSettings(
    @CurrentTenant() tenantId: string | null,
    @Param('kind') kind: string,
  ) {
    return this.employees.getEmployeeReportSettings(
      this.employees.requireTenant(tenantId),
      kind,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch(':id/reports/:kind/settings')
  saveEmployeeReportSettings(
    @CurrentTenant() tenantId: string | null,
    @Param('kind') kind: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.employees.saveEmployeeReportSettings(
      this.employees.requireTenant(tenantId),
      kind,
      body,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/reports/:kind')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  employeeReport(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.employees.employeeReport(
      this.employees.requireTenant(tenantId),
      id,
      kind,
      { from, to },
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/flags')
  updateFlags(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeFlagsDto,
  ) {
    return this.employees.updateProfileFlags(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/locations')
  updateLocations(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeLocationsDto,
  ) {
    return this.employees.updateEmployeeLocations(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/visit-stats')
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['last12', 'current_year', 'last_year'],
  })
  visitStats(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Query('period') period?: 'last12' | 'current_year' | 'last_year',
  ) {
    return this.employees.visitStats(
      this.employees.requireTenant(tenantId),
      id,
      period || 'last12',
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/change-history')
  @ApiQuery({ name: 'section', required: true, enum: ['personal', 'contacts'] })
  changeHistory(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Query('section') section: 'personal' | 'contacts' = 'personal',
  ) {
    return this.employees.changeHistory(
      this.employees.requireTenant(tenantId),
      id,
      section === 'contacts' ? 'contacts' : 'personal',
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/personal')
  updatePersonal(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeePersonalDto,
  ) {
    return this.employees.updatePersonal(
      this.employees.requireTenant(tenantId),
      id,
      dto,
      user.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/contacts')
  updateContacts(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeContactsDto,
  ) {
    return this.employees.updateContacts(
      this.employees.requireTenant(tenantId),
      id,
      dto,
      user.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.employees.findOne(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/bank-accounts')
  listBankAccounts(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listBankAccounts(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/bank-accounts')
  createBankAccount(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeBankAccountDto,
  ) {
    return this.employees.createBankAccount(this.employees.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/bank-accounts/:accountId')
  updateBankAccount(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateEmployeeBankAccountDto,
  ) {
    return this.employees.updateBankAccount(
      this.employees.requireTenant(tenantId),
      id,
      accountId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/bank-accounts/:accountId')
  deleteBankAccount(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
  ) {
    return this.employees.deleteBankAccount(this.employees.requireTenant(tenantId), id, accountId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/bank-cards')
  listBankCards(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listBankCards(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/bank-cards')
  createBankCard(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeBankCardDto,
  ) {
    return this.employees.createBankCard(this.employees.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/bank-cards/:cardId')
  updateBankCard(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateEmployeeBankCardDto,
  ) {
    return this.employees.updateBankCard(this.employees.requireTenant(tenantId), id, cardId, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/bank-cards/:cardId')
  deleteBankCard(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('cardId') cardId: string,
  ) {
    return this.employees.deleteBankCard(this.employees.requireTenant(tenantId), id, cardId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/person-documents')
  listPersonDocuments(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listPersonDocuments(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/person-documents')
  createPersonDocument(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeePersonDocDto,
  ) {
    return this.employees.createPersonDocument(this.employees.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/person-documents/:docId')
  updatePersonDocument(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: UpdateEmployeePersonDocDto,
  ) {
    return this.employees.updatePersonDocument(
      this.employees.requireTenant(tenantId),
      id,
      docId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/person-documents/:docId')
  deletePersonDocument(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.employees.deletePersonDocument(this.employees.requireTenant(tenantId), id, docId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/relatives')
  listRelatives(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listRelatives(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/relatives')
  createRelative(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeRelativeDto,
  ) {
    return this.employees.createRelative(this.employees.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/relatives/:relativeId')
  updateRelative(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('relativeId') relativeId: string,
    @Body() dto: UpdateEmployeeRelativeDto,
  ) {
    return this.employees.updateRelative(
      this.employees.requireTenant(tenantId),
      id,
      relativeId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/relatives/:relativeId')
  deleteRelative(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('relativeId') relativeId: string,
  ) {
    return this.employees.deleteRelative(this.employees.requireTenant(tenantId), id, relativeId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/marital-status')
  updateMaritalStatus(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeMaritalStatusDto,
  ) {
    return this.employees.updateMaritalStatus(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/certificates')
  listCertificates(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listCertificates(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/certificates')
  createCertificate(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeCertificateDto,
  ) {
    return this.employees.createCertificate(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/certificates/:certificateId')
  updateCertificate(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('certificateId') certificateId: string,
    @Body() dto: UpdateEmployeeCertificateDto,
  ) {
    return this.employees.updateCertificate(
      this.employees.requireTenant(tenantId),
      id,
      certificateId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/certificates/:certificateId')
  deleteCertificate(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('certificateId') certificateId: string,
  ) {
    return this.employees.deleteCertificate(
      this.employees.requireTenant(tenantId),
      id,
      certificateId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/tenures')
  listTenures(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listTenures(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/tenures')
  createTenure(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeTenureDto,
  ) {
    return this.employees.createTenure(this.employees.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/tenures/:tenureId')
  updateTenure(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('tenureId') tenureId: string,
    @Body() dto: UpdateEmployeeTenureDto,
  ) {
    return this.employees.updateTenure(
      this.employees.requireTenant(tenantId),
      id,
      tenureId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/tenures/:tenureId')
  deleteTenure(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('tenureId') tenureId: string,
  ) {
    return this.employees.deleteTenure(
      this.employees.requireTenant(tenantId),
      id,
      tenureId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/workplaces')
  listWorkplaces(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listWorkplaces(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/workplaces')
  createWorkplace(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeWorkplaceDto,
  ) {
    return this.employees.createWorkplace(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/workplaces/:workplaceId')
  updateWorkplace(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('workplaceId') workplaceId: string,
    @Body() dto: UpdateEmployeeWorkplaceDto,
  ) {
    return this.employees.updateWorkplace(
      this.employees.requireTenant(tenantId),
      id,
      workplaceId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/workplaces/:workplaceId')
  deleteWorkplace(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('workplaceId') workplaceId: string,
  ) {
    return this.employees.deleteWorkplace(
      this.employees.requireTenant(tenantId),
      id,
      workplaceId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/awards')
  listAwards(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listAwards(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/awards')
  createAward(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeAwardDto,
  ) {
    return this.employees.createAward(this.employees.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/awards/:awardId')
  updateAward(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('awardId') awardId: string,
    @Body() dto: UpdateEmployeeAwardDto,
  ) {
    return this.employees.updateAward(
      this.employees.requireTenant(tenantId),
      id,
      awardId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/awards/:awardId')
  deleteAward(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('awardId') awardId: string,
  ) {
    return this.employees.deleteAward(
      this.employees.requireTenant(tenantId),
      id,
      awardId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/files')
  listEmployeeFiles(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listEmployeeFiles(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['file', 'name'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  createEmployeeFile(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; note?: string },
  ) {
    return this.employees.createEmployeeFile(
      this.employees.requireTenant(tenantId),
      id,
      file,
      body,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/files/:fileId')
  updateEmployeeFile(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Body() dto: UpdateEmployeeFileDto,
  ) {
    return this.employees.updateEmployeeFile(
      this.employees.requireTenant(tenantId),
      id,
      fileId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/files/:fileId')
  deleteEmployeeFile(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.employees.deleteEmployeeFile(
      this.employees.requireTenant(tenantId),
      id,
      fileId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/inventory')
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'userName', required: false })
  @ApiQuery({ name: 'responsibleName', required: false })
  @ApiQuery({ name: 'purchaseFrom', required: false })
  @ApiQuery({ name: 'purchaseTo', required: false })
  @ApiQuery({ name: 'status', required: false })
  listInventory(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('userName') userName?: string,
    @Query('responsibleName') responsibleName?: string,
    @Query('purchaseFrom') purchaseFrom?: string,
    @Query('purchaseTo') purchaseTo?: string,
    @Query('status') status?: string,
  ) {
    return this.employees.listInventory(this.employees.requireTenant(tenantId), id, {
      q,
      userName,
      responsibleName,
      purchaseFrom,
      purchaseTo,
      status,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/inventory')
  createInventory(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeInventoryDto,
  ) {
    return this.employees.createInventory(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/inventory/:itemId')
  updateInventory(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateEmployeeInventoryDto,
  ) {
    return this.employees.updateInventory(
      this.employees.requireTenant(tenantId),
      id,
      itemId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/inventory/:itemId')
  deleteInventory(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.employees.deleteInventory(
      this.employees.requireTenant(tenantId),
      id,
      itemId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/cars')
  listCars(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listCars(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/cars')
  createCar(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeCarDto,
  ) {
    return this.employees.createCar(this.employees.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/cars/:carId')
  updateCar(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('carId') carId: string,
    @Body() dto: UpdateEmployeeCarDto,
  ) {
    return this.employees.updateCar(
      this.employees.requireTenant(tenantId),
      id,
      carId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/cars/:carId')
  deleteCar(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('carId') carId: string,
  ) {
    return this.employees.deleteCar(
      this.employees.requireTenant(tenantId),
      id,
      carId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/identification')
  updateIdentification(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeIdentificationDto,
  ) {
    return this.employees.updateIdentification(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/extra-info')
  updateExtraInfo(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeExtraInfoDto,
  ) {
    return this.employees.updateExtraInfo(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/user-settings')
  updateUserSettings(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeUserSettingsDto,
  ) {
    return this.employees.updateUserSettings(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id/mark-blocks')
  listMarkBlocks(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.employees.listMarkBlocks(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/mark-blocks')
  createMarkBlock(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeMarkBlockDto,
  ) {
    return this.employees.createMarkBlock(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id/mark-blocks/:blockId')
  updateMarkBlock(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Body() dto: UpdateEmployeeMarkBlockDto,
  ) {
    return this.employees.updateMarkBlock(
      this.employees.requireTenant(tenantId),
      id,
      blockId,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/mark-blocks/:blockId')
  deleteMarkBlock(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
  ) {
    return this.employees.deleteMarkBlock(
      this.employees.requireTenant(tenantId),
      id,
      blockId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employees.create(this.employees.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(
      this.employees.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get(':id/face')
  faceStatus(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.face.getFaceStatus(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/face')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadFace(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.face.uploadFace(this.employees.requireTenant(tenantId), id, file);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id/face')
  clearFace(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.face.clearFace(this.employees.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/face/sync')
  syncFace(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.face.syncToDevices(this.employees.requireTenant(tenantId), id);
  }
}
