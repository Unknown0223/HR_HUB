import { BadRequestException, Body, Controller, Get, Put, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { MeService } from './me.service';
import { PunchVideoService } from './punch-video.service';
import { PUNCH_VIDEO_MAX_BYTES } from './punch-video';

@ApiTags('punch-video')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller()
export class PunchVideoController {
  constructor(
    private readonly video: PunchVideoService,
    private readonly me: MeService,
  ) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('settings/punch-video')
  getSettings(@CurrentTenant() tenantId: string | null) {
    return this.video.getSettings(this.me.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin)
  @Put('settings/punch-video')
  saveSettings(
    @CurrentTenant() tenantId: string | null,
    @Body() body: { enabled?: boolean; codeRequired?: boolean; chatId?: string },
  ) {
    return this.video.saveSettings(this.me.requireTenant(tenantId), {
      enabled: body.enabled,
      codeRequired: body.codeRequired,
      chatId: body.chatId,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Get('settings/punch-video/staff')
  staff(
    @CurrentTenant() tenantId: string | null,
    @Query('q') q?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.video.staff(this.me.requireTenant(tenantId), q || '', employeeId);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Put('settings/punch-video/staff')
  assign(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body() body: { employeeIds?: string[]; enabled?: boolean; codeRequired?: boolean },
  ) {
    const ids = Array.isArray(body.employeeIds) ? body.employeeIds.filter((id) => typeof id === 'string') : [];
    if (!ids.length) throw new BadRequestException('Xodim tanlanmagan');
    return this.video.assign(
      this.me.requireTenant(tenantId),
      user,
      ids,
      body.enabled === true,
      typeof body.codeRequired === 'boolean' ? body.codeRequired : undefined,
    );
  }

  @Get('me/punch-video')
  async today(@CurrentUser() user: AuthUser) {
    const { tenantId, employee } = await this.me.requireEmployee(user);
    return this.video.today(tenantId, employee.id);
  }

  @Post('me/punch-video')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
  ], { limits: { fileSize: PUNCH_VIDEO_MAX_BYTES } }))
  async punch(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] },
    @Body() body: Record<string, string>,
  ) {
    const front = files?.front?.[0];
    if (!front?.buffer?.length) throw new BadRequestException('Old kamera videosi topilmadi');
    const { tenantId, employee } = await this.me.requireEmployee(user);
    await this.me.assertMarksAllowed(tenantId, employee.id);
    const today = await this.me.todayAttendance(user);
    const direction = body.direction === 'OUT' ? 'OUT' : body.direction === 'IN' ? 'IN' : null;
    if (!direction) throw new BadRequestException('Yo‘nalish: IN yoki OUT');
    return this.video.punch(
      tenantId,
      employee,
      today.marks,
      {
        direction,
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        accuracy: Number(body.accuracy),
        durationSec: Number(body.durationSec),
        captureMode: body.captureMode === 'simultaneous' ? 'simultaneous' : 'sequential',
        spokenCode: body.spokenCode ? Number(body.spokenCode) : undefined,
        comment: body.comment,
      },
      { front: front.buffer, back: files?.back?.[0]?.buffer },
    );
  }
}
