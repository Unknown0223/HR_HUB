import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { SkipTenant } from '../tenant/decorators';
import { AttendanceService } from './attendance.service';
import { DeviceLinkGuard } from './device-link.guard';
import { OfficeLinkAnnounceDto, OfficeLinkDeviceDto } from './dto';

@ApiTags('office-link')
@Public()
@SkipTenant()
@UseGuards(DeviceLinkGuard)
@ApiHeader({ name: 'X-Device-Link-Key', required: true })
@Controller('attendance/office-link')
export class OfficeLinkController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('ping')
  ping(@Query('tenantCode') tenantCode?: string) {
    return this.attendance.officeLinkPing(tenantCode || 'demo');
  }

  @Post('announce')
  announce(@Body() dto: OfficeLinkAnnounceDto) {
    return this.attendance.officeLinkAnnounce(
      dto.tenantCode || 'demo',
      dto.tunnelUrl,
    );
  }

  @Post('device')
  device(@Body() dto: OfficeLinkDeviceDto) {
    return this.attendance.officeLinkDevice(dto.tenantCode || 'demo', dto);
  }
}
