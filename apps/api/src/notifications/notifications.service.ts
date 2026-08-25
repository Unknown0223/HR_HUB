import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationKind, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  async notifyApprovers(
    tenantId: string,
    data: {
      kind?: NotificationKind;
      title: string;
      body?: string;
      entity?: string;
      entityId?: string;
      href?: string;
    },
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: [Role.tenant_admin, Role.hr, Role.manager] },
      },
      select: { id: true },
    });
    if (!users.length) return [];
    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        tenantId,
        userId: u.id,
        kind: data.kind ?? NotificationKind.approval,
        title: data.title,
        body: data.body,
        entity: data.entity,
        entityId: data.entityId,
        href: data.href,
      })),
    });
    return users;
  }

  async notifyAllUsers(
    tenantId: string,
    data: {
      kind?: NotificationKind;
      title: string;
      body?: string;
      entity?: string;
      entityId?: string;
      href?: string;
    },
  ) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
    if (!users.length) return 0;
    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        tenantId,
        userId: u.id,
        kind: data.kind ?? NotificationKind.info,
        title: data.title,
        body: data.body,
        entity: data.entity,
        entityId: data.entityId,
        href: data.href,
      })),
    });
    return users.length;
  }

  list(tenantId: string, userId: string, unreadOnly?: boolean) {
    return this.prisma.notification.findMany({
      where: {
        tenantId,
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  unreadCount(tenantId: string, userId: string) {
    return this.prisma.notification.count({
      where: { tenantId, userId, readAt: null },
    });
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, tenantId, userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(tenantId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
