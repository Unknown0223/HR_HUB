import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from './settings.service';

/**
 * Daily HR reminders for PersonDocument.expiresAt based on
 * system.documentTypeNotifications / hrNotifyDocumentDates.
 */
@Injectable()
export class DocumentExpiryNotifyScheduler {
  private readonly logger = new Logger(DocumentExpiryNotifyScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async handleCron() {
    const result = await this.runOnce();
    if (result.tenants === 0) {
      this.logger.debug('Document expiry notify: no tenants');
      return;
    }
    this.logger.log(
      `Document expiry notify done tenants=${result.tenants} scanned=${result.scanned} sent=${result.sent}`,
    );
  }

  async runOnce() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
      take: 500,
    });
    let scanned = 0;
    let sent = 0;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const t of tenants) {
      try {
        const { system } = await this.settings.getSystemSettings(t.id);
        const cfg = system.documentTypeNotifications;
        const masterOn =
          Boolean(cfg?.enabled) || Boolean(system.hrNotifyDocumentDates);
        if (!masterOn) continue;

        const configured = (cfg?.rules || []).filter(
          (r) => r.enabled && r.documentTypeCode && r.daysBefore >= 0,
        );
        const rules =
          configured.length > 0
            ? configured
            : [
                {
                  id: 'legacy-default',
                  documentTypeCode: '*',
                  daysBefore: 30,
                  enabled: true,
                },
              ];

        for (const rule of rules) {
          const maxDate = new Date(today);
          maxDate.setUTCDate(maxDate.getUTCDate() + rule.daysBefore);
          const docs = await this.prisma.personDocument.findMany({
            where: {
              tenantId: t.id,
              expiresAt: { gte: today, lte: maxDate },
              ...(rule.documentTypeCode !== '*'
                ? { docType: { equals: rule.documentTypeCode, mode: 'insensitive' } }
                : {}),
            },
            select: {
              id: true,
              docType: true,
              docNumber: true,
              expiresAt: true,
              employeeId: true,
              employee: {
                select: {
                  firstName: true,
                  lastName: true,
                  tabNumber: true,
                },
              },
            },
            take: 200,
          });
          scanned += docs.length;
          for (const doc of docs) {
            if (!doc.expiresAt) continue;
            const exp = doc.expiresAt.toISOString().slice(0, 10);
            const who = doc.employee
              ? `${doc.employee.lastName || ''} ${doc.employee.firstName || ''}`.trim() ||
                doc.employee.tabNumber
              : 'сотрудник';
            const already = await this.prisma.notification.findFirst({
              where: {
                tenantId: t.id,
                entity: 'PersonDocument',
                entityId: doc.id,
                title: { contains: exp },
                createdAt: { gte: today },
              },
              select: { id: true },
            });
            if (already) continue;
            await this.notifications.notifyApprovers(t.id, {
              kind: NotificationKind.alert,
              title: `Документ истекает ${exp}`,
              body: `${doc.docType} №${doc.docNumber} — ${who}`,
              entity: 'PersonDocument',
              entityId: doc.id,
              href: doc.employeeId
                ? `/employees/${doc.employeeId}`
                : '/settings/person-docs',
            });
            sent += 1;
          }
        }
      } catch (e) {
        this.logger.warn(
          `Document expiry notify failed tenant=${t.id}: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }
    return { tenants: tenants.length, scanned, sent };
  }
}
