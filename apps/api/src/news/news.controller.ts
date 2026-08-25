import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NewsService } from './news.service';
import { Roles } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';

@ApiTags('news')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Get()
  list(
    @CurrentTenant() tenantId: string | null,
    @Query('limit') limit?: string,
  ) {
    return this.news.list(
      this.news.requireTenant(tenantId),
      limit ? Number(limit) : 50,
    );
  }

  @Roles(
    Role.platform_admin,
    Role.tenant_admin,
    Role.hr,
    Role.manager,
    Role.employee,
  )
  @Get('birthdays')
  birthdays(@CurrentTenant() tenantId: string | null) {
    return this.news.birthdays(this.news.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Post()
  create(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title?: string;
      message?: string;
      body?: string;
      sendToAll?: boolean;
    },
  ) {
    return this.news.create(this.news.requireTenant(tenantId), {
      ...body,
      authorName: user?.email || undefined,
    });
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.news.remove(this.news.requireTenant(tenantId), id);
  }
}
