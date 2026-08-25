import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';

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
}
