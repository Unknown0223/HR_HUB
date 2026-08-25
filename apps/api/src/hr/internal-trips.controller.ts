import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import {
  CreateInternalTripDto,
  InternalTripsService,
} from './internal-trips.service';

export class CreateInternalTripBody implements CreateInternalTripDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() recipientDivisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() senderDivisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() requestDate?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() earlyArrival?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lateDeparture?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bySchedule?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workScheduleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualName?: string;
  @ApiPropertyOptional() @IsOptional() amount?: number | string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() visibility?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class UpdateInternalTripBody extends CreateInternalTripBody {
  @ApiPropertyOptional() @IsOptional() @IsUUID() declare employeeId: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() declare startDate: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() declare endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requestStatus?: string;
}

export class ReviewInternalTripBody {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsString()
  status!: 'approved' | 'rejected';
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNote?: string;
}

export class BulkInternalTripBody {
  @ApiProperty({ type: [String] }) @IsArray() ids!: string[];
  @ApiProperty() @IsString() action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNote?: string;
}

@ApiTags('hr-internal-trips')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('hr/internal-trips')
export class InternalTripsController {
  constructor(private readonly trips: InternalTripsService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get()
  list(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.trips.list(this.trips.requireTenant(t), {
      scope,
      status,
      q,
      userId: user?.userId,
      userEmail: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post('bulk-action')
  bulk(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() body: BulkInternalTripBody,
  ) {
    return this.trips.bulkAction(this.trips.requireTenant(t), body, {
      email: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Get(':id')
  get(@CurrentTenant() t: string | null, @Param('id') id: string) {
    return this.trips.get(this.trips.requireTenant(t), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Post()
  create(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInternalTripBody,
  ) {
    return this.trips.create(this.trips.requireTenant(t), dto, {
      userId: user?.userId,
      email: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Patch(':id')
  update(
    @CurrentTenant() t: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateInternalTripBody,
  ) {
    return this.trips.update(this.trips.requireTenant(t), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post(':id/review')
  review(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ReviewInternalTripBody,
  ) {
    return this.trips.review(this.trips.requireTenant(t), id, body.status, {
      reviewNote: body.reviewNote,
      actorName: user?.email,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager, Role.employee)
  @Post(':id/cancel')
  cancel(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.trips.cancel(this.trips.requireTenant(t), id, user?.email);
  }
}
