import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationKind, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from '../common/data-scope';
import { TelegramLinksService } from '../telegram/telegram-links.service';
import {
  NOTIFICATION_CATEGORIES,
  readPrefs,
  wantsNotification,
  type NotificationCategory,
} from './notification-prefs';

type NotifyData = {
  kind?: NotificationKind;
  title: string;
  body?: string;
  entity?: string;
  entityId?: string;
  href?: string;
};

type Recipient = { id: string; meta: Prisma.JsonValue };

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramLinksService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  /** Skips users who switched this notification's category off. Returns who got it. */
  private async deliver(
    tenantId: string,
    users: Recipient[],
    data: NotifyData,
    defaultKind: NotificationKind,
  ) {
    const recipients = users.filter((u) => wantsNotification(u.meta, data.entity));
    if (!recipients.length) return [];
    await this.prisma.notification.createMany({
      data: recipients.map((u) => ({
        tenantId,
        userId: u.id,
        kind: data.kind ?? defaultKind,
        title: data.title,
        body: data.body,
        entity: data.entity,
        entityId: data.entityId,
        href: data.href,
      })),
    });
    // Arrival notices are covered by the per-punch Telegram message (sendPunchToTelegram).
    if (data.entity !== 'attendance_arrival') {
      const text = data.body ? `🔔 ${data.title}\n\n${data.body}` : `🔔 ${data.title}`;
      void this.telegram.sendToUsers(recipients.map((u) => u.id), text, { tenantId });
    }
    return recipients.map((u) => ({ id: u.id }));
  }

  /** Logins of one employee: `users.meta.employeeId` link, or matching e-mail. */
  private employeeUsers(tenantId: string, employeeId: string) {
    return runUnscoped(async () => {
      const emp = await this.prisma.employee.findFirst({
        where: { tenantId, id: employeeId },
        select: { email: true },
      });
      const email = emp?.email?.trim();
      return this.prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { meta: { path: ['employeeId'], equals: employeeId } },
            ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true, meta: true },
      });
    });
  }

  /**
   * Telegram-only message to the employee's linked chat (no in-app row), honouring the same
   * per-category switch as in-app notices — used for every attendance punch.
   */
  async telegramToEmployee(tenantId: string, employeeId: string, entity: string, text: string) {
    const users = (await this.employeeUsers(tenantId, employeeId)).filter((u) => wantsNotification(u.meta, entity));
    return this.telegram.sendToUsers(users.map((u) => u.id), text, { tenantId });
  }

  async notifyApprovers(tenantId: string, data: NotifyData) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: [Role.tenant_admin, Role.hr, Role.manager] },
      },
      select: { id: true, meta: true },
    });
    return this.deliver(tenantId, users, data, NotificationKind.approval);
  }

  /** Tenant admins only (e.g. device password / link confirmation). */
  async notifyTenantAdmins(tenantId: string, data: NotifyData) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: [Role.tenant_admin, Role.platform_admin] },
      },
      select: { id: true, meta: true },
    });
    return this.deliver(tenantId, users, data, NotificationKind.approval);
  }

  /**
   * The employee's own login(s): linked via `users.meta.employeeId`, or by matching e-mail
   * (the same rule `MeService.resolveEmployee` uses). No-op when the employee has no account.
   */
  async notifyEmployee(tenantId: string, employeeId: string, data: NotifyData) {
    const users = await this.employeeUsers(tenantId, employeeId);
    return (await this.deliver(tenantId, users, data, NotificationKind.info)).length;
  }

  async notifyAllUsers(tenantId: string, data: NotifyData) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, meta: true },
    });
    return (await this.deliver(tenantId, users, data, NotificationKind.info)).length;
  }

  async preferences(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { meta: true } });
    if (!user) throw new NotFoundException('User not found');
    const prefs = readPrefs(user.meta);
    return NOTIFICATION_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
      enabled: prefs[c.id],
    }));
  }

  async updatePreferences(userId: string, patch: Record<string, unknown>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { meta: true } });
    if (!user) throw new NotFoundException('User not found');
    const meta =
      user.meta && typeof user.meta === 'object' && !Array.isArray(user.meta)
        ? { ...(user.meta as Record<string, unknown>) }
        : {};
    const next = readPrefs(meta);
    for (const c of NOTIFICATION_CATEGORIES) {
      if (typeof patch[c.id] === 'boolean') next[c.id as NotificationCategory] = patch[c.id] as boolean;
    }
    const muted = Object.fromEntries(Object.entries(next).filter(([, on]) => !on).map(([id]) => [id, false]));
    await this.prisma.user.update({
      where: { id: userId },
      data: { meta: { ...meta, notificationPrefs: muted } as Prisma.InputJsonValue },
    });
    return this.preferences(userId);
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

  async deleteOne(tenantId: string, userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, tenantId, userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    await this.prisma.notification.delete({ where: { id } });
    return { ok: true };
  }

  async clearAll(tenantId: string, userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { tenantId, userId },
    });
    return { deleted: result.count };
  }
}
