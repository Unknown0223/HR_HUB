import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { SkipTenant } from '../tenant/decorators';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Get()
  list(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.list(
      this.notifications.requireTenant(t),
      user.userId,
      unreadOnly === '1' || unreadOnly === 'true',
    );
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @SkipTenant()
  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user.userId);
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @SkipTenant()
  @Put('preferences')
  updatePreferences(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.notifications.updatePreferences(user.userId, body ?? {});
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Get('unread-count')
  unreadCount(@CurrentTenant() t: string | null, @CurrentUser() user: AuthUser) {
    return this.notifications
      .unreadCount(this.notifications.requireTenant(t), user.userId)
      .then((count) => ({ count }));
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Patch('read-all')
  markAllRead(@CurrentTenant() t: string | null, @CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(
      this.notifications.requireTenant(t),
      user.userId,
    );
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Delete()
  clearAll(@CurrentTenant() t: string | null, @CurrentUser() user: AuthUser) {
    return this.notifications.clearAll(
      this.notifications.requireTenant(t),
      user.userId,
    );
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Patch(':id/read')
  markRead(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(
      this.notifications.requireTenant(t),
      user.userId,
      id,
    );
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Delete(':id')
  deleteOne(
    @CurrentTenant() t: string | null,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.notifications.deleteOne(
      this.notifications.requireTenant(t),
      user.userId,
      id,
    );
  }
}
