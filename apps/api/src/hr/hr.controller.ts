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
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  DocumentType,
  RequestStatus,
  RequestType,
  Role,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { HrService } from './hr.service';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { sendExcelAttachment } from '../common/excel';

export class CreateAbsenceTypeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paid?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() calcKind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowEmployeeRequest?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackUnusedTime?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requestTimeLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() providedIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnnual?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() daysPerYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() limitDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyQtyLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyHourLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() carryoverPolicy?: string;
}

export class UpdateAbsenceTypeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paid?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() calcKind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeTypeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowEmployeeRequest?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackUnusedTime?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requestTimeLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() providedIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnnual?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() daysPerYear?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() limitDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyQtyLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyHourLimit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() carryoverPolicy?: string | null;
}

export class CreateAbsenceDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsString() absenceTypeId!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() documentDate?: string;
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
  @ApiPropertyOptional({ description: 'part_day | full_day | multi_day and extra fields' })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class UpdateAbsenceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() absenceTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() documentDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class UpdateAbsenceStatusDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNote?: string;
  @ApiPropertyOptional({ description: 'complete | cancel | restore | approve | reject' })
  @IsOptional()
  @IsString()
  action?: string;
}

export class BulkAbsenceActionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  ids!: string[];
  @ApiProperty({ description: 'approve | reject | cancel | restore | complete | delete' })
  @IsString()
  action!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class AbsenceTypeEmployeesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  employeeIds!: string[];
  @ApiPropertyOptional({ description: 'planned | carryover' })
  @IsOptional()
  @IsString()
  accrualKind?: string;
}

export class CreateRequestDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty({ enum: RequestType }) @IsEnum(RequestType) type!: RequestType;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() visibility?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() createdByUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeUserId?: string;
}

export class ReviewRequestDto {
  @ApiProperty({ enum: [RequestStatus.approved, RequestStatus.rejected] })
  @IsEnum(RequestStatus)
  status!: RequestStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNote?: string;
}

export class UpdateRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() visibility?: string;
}

export class BulkRequestActionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  ids!: string[];
  @ApiProperty({ description: 'approve | reject | restore | cancel | delete' })
  @IsString()
  action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNote?: string;
}

export class HrChangeLineDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() staffPositionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employmentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpsertHrChangeRequestDto {
  @ApiProperty({ enum: ['open_position', 'hire', 'transfer', 'transfer_batch', 'dismiss'] })
  @IsString()
  kind!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() requestDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() staffPositionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() employmentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dismissalReasonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() candidateGender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() candidateFirstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() candidateLastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() candidateMiddleName?: string;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [HrChangeLineDto] })
  @IsOptional()
  lines?: HrChangeLineDto[];
}

export class CreateDocumentDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty({ enum: DocumentType }) @IsEnum(DocumentType) type!: DocumentType;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsDateString() documentDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, unknown>;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() documentDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, unknown>;
}

@ApiTags('hr')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('absence-types')
  listAbsenceTypes(
    @CurrentTenant() t: string | null,
    @Query('all') all?: string,
  ) {
    return this.hr.listAbsenceTypes(this.hr.requireTenant(t), {
      includeInactive: all === '1' || all === 'true',
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('absence-types/:id/employees')
  listAbsenceTypeEmployees(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Query('scope') scope?: string,
    @Query('accrualKind') accrualKind?: string,
    @Query('q') q?: string,
  ) {
    return this.hr.listAbsenceTypeEmployees(this.hr.requireTenant(t), id, {
      scope: scope === 'available' ? 'available' : 'attached',
      accrualKind,
      q,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('absence-types/:id/employees/attach')
  attachAbsenceTypeEmployees(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() body: AbsenceTypeEmployeesDto,
  ) {
    return this.hr.attachAbsenceTypeEmployees(this.hr.requireTenant(t), id, body);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('absence-types/:id/employees/detach')
  detachAbsenceTypeEmployees(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() body: AbsenceTypeEmployeesDto,
  ) {
    return this.hr.detachAbsenceTypeEmployees(this.hr.requireTenant(t), id, body);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('absence-types/:id')
  getAbsenceType(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.getAbsenceType(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('absence-types')
  createAbsenceType(@CurrentTenant() t: string | null, @Body() dto: CreateAbsenceTypeDto) {
    return this.hr.createAbsenceType(this.hr.requireTenant(t), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('absence-types/:id')
  updateAbsenceType(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateAbsenceTypeDto,
  ) {
    return this.hr.updateAbsenceType(this.hr.requireTenant(t), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('absence-types/:id')
  deleteAbsenceType(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.deleteAbsenceType(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('absences')
  listAbsences(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('posted') posted?: string,
    @Query('scope') scope?: string,
  ) {
    return this.hr.listAbsences(this.hr.requireTenant(t), {
      employeeId,
      status,
      from,
      to,
      q,
      posted,
      scope,
      userEmail: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('absences/bulk-action')
  bulkAbsenceAction(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() body: BulkAbsenceActionDto,
  ) {
    return this.hr.bulkAbsenceAction(this.hr.requireTenant(t), body, {
      actorName: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('absences/:id')
  getAbsence(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.getAbsence(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Post('absences')
  createAbsence(@CurrentTenant() t: string | null, @Body() dto: CreateAbsenceDto) {
    return this.hr.createAbsence(this.hr.requireTenant(t), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch('absences/:id')
  updateAbsence(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateAbsenceDto,
  ) {
    return this.hr.updateAbsence(this.hr.requireTenant(t), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('absences/:id/post')
  postAbsence(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.updateAbsenceStatus(
      this.hr.requireTenant(t),
      id,
      RequestStatus.approved,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('absences/:id/unpost')
  unpostAbsence(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.updateAbsenceStatus(
      this.hr.requireTenant(t),
      id,
      RequestStatus.draft,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Delete('absences/:id')
  deleteAbsence(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.deleteAbsence(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch('absences/:id/status')
  updateAbsenceStatus(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateAbsenceStatusDto,
  ) {
    const tenantId = this.hr.requireTenant(t);
    const actor = user?.email || undefined;
    if (body.action) {
      return this.hr.applyAbsenceAction(tenantId, id, body.action, {
        reviewNote: body.reviewNote,
        actorName: actor,
      });
    }
    if (!body.status) {
      return this.hr.getAbsence(tenantId, id);
    }
    return this.hr.updateAbsenceStatus(
      tenantId,
      id,
      body.status,
      body.reviewNote,
      actor,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('absences/:id/complete')
  completeAbsence(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.applyAbsenceAction(this.hr.requireTenant(t), id, 'complete', {
      actorName: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('absences/:id/cancel')
  cancelAbsence(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.applyAbsenceAction(this.hr.requireTenant(t), id, 'cancel', {
      actorName: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('absences/:id/restore')
  restoreAbsence(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.applyAbsenceAction(this.hr.requireTenant(t), id, 'restore', {
      actorName: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('requests')
  listRequests(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Query('status') status?: RequestStatus,
    @Query('type') type?: RequestType,
    @Query('scope') scope?: string,
    @Query('q') q?: string,
  ) {
    return this.hr.listRequests(this.hr.requireTenant(t), {
      status,
      type,
      scope,
      q,
      userId: user?.userId,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('requests/bulk-action')
  bulkRequestAction(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() body: BulkRequestActionDto,
  ) {
    return this.hr.bulkRequestAction(this.hr.requireTenant(t), body, {
      actorName: user?.email ?? user?.userId,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get('requests/:id')
  getRequest(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.getRequest(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Post('requests')
  createRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRequestDto,
  ) {
    return this.hr.createRequest(this.hr.requireTenant(t), dto, user?.userId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Patch('requests/:id')
  updateRequest(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.hr.updateRequest(this.hr.requireTenant(t), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Delete('requests/:id')
  deleteRequest(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.deleteRequest(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch('requests/:id/review')
  reviewRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewRequestDto,
  ) {
    return this.hr.reviewRequest(
      this.hr.requireTenant(t),
      id,
      dto,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('requests/:id/restore')
  restoreRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.restoreRequest(
      this.hr.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Post('requests/:id/cancel')
  cancelRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.cancelRequest(
      this.hr.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  // —— Personnel change requests (Verifix) ——

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('change-requests')
  listChangeRequests(
    @CurrentTenant() t: string | null,
    @Query('kind') kind?: string,
    @Query('status') status?: RequestStatus,
  ) {
    return this.hr.listChangeRequests(this.hr.requireTenant(t), { kind, status });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('change-requests/export.xlsx')
  async exportChangeRequests(
    @CurrentTenant() t: string | null,
    @Query('kind') kind?: string,
    @Query('status') status?: RequestStatus,
    @Res() res?: Response,
  ) {
    const { buffer, filename } = await this.hr.exportChangeRequests(
      this.hr.requireTenant(t),
      { kind, status },
    );
    sendExcelAttachment(res!, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('change-requests/:id')
  getChangeRequest(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.getChangeRequest(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('change-requests')
  createChangeRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertHrChangeRequestDto,
  ) {
    return this.hr.createChangeRequest(
      this.hr.requireTenant(t),
      dto,
      user?.userId,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch('change-requests/:id')
  updateChangeRequest(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() dto: UpsertHrChangeRequestDto,
  ) {
    return this.hr.updateChangeRequest(this.hr.requireTenant(t), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Delete('change-requests/:id')
  deleteChangeRequest(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.deleteChangeRequest(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('change-requests/:id/submit')
  submitChangeRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.submitChangeRequest(
      this.hr.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch('change-requests/:id/review')
  reviewChangeRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewRequestDto,
  ) {
    return this.hr.reviewChangeRequest(
      this.hr.requireTenant(t),
      id,
      dto,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('change-requests/:id/cancel')
  cancelChangeRequest(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.cancelChangeRequest(
      this.hr.requireTenant(t),
      id,
      user?.email ?? user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('documents')
  listDocuments(
    @CurrentTenant() t: string | null,
    @Query('q') q?: string,
    @Query('type') type?: DocumentType,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.hr.listDocuments(this.hr.requireTenant(t), {
      q,
      type,
      status,
      employeeId,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('documents/export.xlsx')
  async exportDocuments(
    @CurrentTenant() t: string | null,
    @Res({ passthrough: true }) res: Response,
    @Query('q') q?: string,
    @Query('type') type?: DocumentType,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { buffer, filename } = await this.hr.exportDocumentsXlsx(
      this.hr.requireTenant(t),
      { q, type, status, employeeId, from, to },
    );
    sendExcelAttachment(res, buffer, filename);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('documents/:id')
  getDocument(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.getDocument(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('documents/:id/history')
  documentHistory(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.documentHistory(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('documents/:id/files')
  listDocumentFiles(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.hr.listDocumentFiles(this.hr.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('documents/:id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  addDocumentFile(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.hr.addDocumentFile(
      this.hr.requireTenant(t),
      id,
      file,
      user?.userId,
      user?.email,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get('documents/:id/files/:fileId')
  getDocumentFile(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.hr.getDocumentFileUrl(this.hr.requireTenant(t), id, fileId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete('documents/:id/files/:fileId')
  deleteDocumentFile(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.hr.deleteDocumentFile(
      this.hr.requireTenant(t),
      id,
      fileId,
      user?.userId,
      user?.email,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('documents')
  createDocument(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.hr.createDocument(
      this.hr.requireTenant(t),
      dto,
      user?.userId,
      user?.email,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch('documents/:id')
  updateDocument(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.hr.updateDocument(
      this.hr.requireTenant(t),
      id,
      dto,
      user?.userId,
      user?.email,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('documents/:id/post')
  postDocument(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.postDocument(
      this.hr.requireTenant(t),
      id,
      user?.email ?? user?.userId,
      user?.userId,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('documents/:id/unpost')
  unpostDocument(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.unpostDocument(
      this.hr.requireTenant(t),
      id,
      user?.userId,
      user?.email,
    );
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('documents/:id/cancel')
  cancelDocument(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hr.cancelDocument(
      this.hr.requireTenant(t),
      id,
      user?.email ?? user?.userId,
      user?.userId,
    );
  }
}
