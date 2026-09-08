import {
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { SkipTenant } from '../tenant/decorators';
import { AttendanceService } from './attendance.service';
import {
  OfficeLinkAuthContext,
  OfficeLinkAuthGuard,
} from './office-link-auth.guard';
import { OfficeLinkAnnounceDto, OfficeLinkDeviceDto } from './dto';

const CurrentOfficeLinkAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OfficeLinkAuthContext | undefined => {
    const req = ctx.switchToHttp().getRequest<{
      officeLinkAuth?: OfficeLinkAuthContext;
    }>();
    return req.officeLinkAuth;
  },
);

@ApiTags('office-link')
@Public()
@SkipTenant()
@UseGuards(OfficeLinkAuthGuard)
@ApiHeader({ name: 'X-Device-Link-Key', required: false })
@ApiHeader({ name: 'X-Pairing-Token', required: false })
@Controller('attendance/office-link')
export class OfficeLinkController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('ping')
  ping(@Query('tenantCode') tenantCode?: string) {
    return this.attendance.officeLinkPing(tenantCode || 'demo');
  }

  @Post('announce')
  @HttpCode(200)
  announce(@Body() dto: OfficeLinkAnnounceDto) {
    return this.attendance.officeLinkAnnounce(
      dto.tenantCode || 'demo',
      dto.tunnelUrl,
    );
  }

  @Post('device')
  @HttpCode(200)
  device(
    @Body() dto: OfficeLinkDeviceDto,
    @CurrentOfficeLinkAuth() auth?: OfficeLinkAuthContext,
  ) {
    return this.attendance.officeLinkDevice(dto.tenantCode || 'demo', dto, {
      provisionSessionId: auth?.pairing?.sessionId,
    });
  }

  /** Locations for office-link GUI (pairing tenant wins over tenantCode query). */
  @Get('locations')
  locations(
    @Query('tenantCode') tenantCode?: string,
    @CurrentOfficeLinkAuth() auth?: OfficeLinkAuthContext,
  ) {
    if (auth?.pairing?.tenantId) {
      return this.attendance.officeLinkLocationsForTenant(auth.pairing.tenantId);
    }
    return this.attendance.officeLinkLocations(tenantCode || 'demo');
  }
}
