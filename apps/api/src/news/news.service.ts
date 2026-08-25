import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, NotificationKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const NEWS_DICTIONARY_CODE = 'news_feed';

function fullName(e: {
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
}) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function toLocalYmd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private async ensureDict(tenantId: string) {
    let dict = await this.prisma.dictionary.findUnique({
      where: { tenantId_code: { tenantId, code: NEWS_DICTIONARY_CODE } },
    });
    if (!dict) {
      dict = await this.prisma.dictionary.create({
        data: {
          tenantId,
          code: NEWS_DICTIONARY_CODE,
          name: 'Новостная лента',
          kind: 'extra',
        },
      });
    }
    return dict;
  }

  async list(tenantId: string, limit = 50) {
    const dict = await this.ensureDict(tenantId);
    const items = await this.prisma.dictionaryItem.findMany({
      where: { dictionaryId: dict.id, isActive: true },
      orderBy: [{ sortOrder: 'desc' }, { code: 'desc' }],
      take: Math.min(100, Math.max(1, limit)),
    });

    return items.map((item) => {
      const meta = (item.meta ?? {}) as Record<string, unknown>;
      const body = typeof meta.body === 'string' ? meta.body : '';
      return {
        id: item.id,
        code: item.code,
        title: item.name,
        body,
        publishedAt:
          typeof meta.publishedAt === 'string' ? meta.publishedAt : null,
        sendToAll: Boolean(meta.sendToAll),
        authorName:
          typeof meta.authorName === 'string' ? meta.authorName : null,
      };
    });
  }

  async create(
    tenantId: string,
    body: {
      title?: string;
      message?: string;
      body?: string;
      sendToAll?: boolean;
      authorName?: string;
    },
  ) {
    const html = String(body.message ?? body.body ?? '').trim();
    if (!html || !stripHtml(html)) {
      throw new BadRequestException('Сообщение обязательно');
    }
    const plain = stripHtml(html);
    const title =
      String(body.title || '').trim() ||
      (plain.length > 80 ? `${plain.slice(0, 77)}…` : plain);

    const dict = await this.ensureDict(tenantId);
    const publishedAt = new Date().toISOString();
    const code = `N-${Date.now().toString(36).toUpperCase()}`;
    const sendToAll = body.sendToAll !== false;

    const maxSort = await this.prisma.dictionaryItem.aggregate({
      where: { dictionaryId: dict.id },
      _max: { sortOrder: true },
    });

    const item = await this.prisma.dictionaryItem.create({
      data: {
        dictionaryId: dict.id,
        code,
        name: title,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        isActive: true,
        meta: {
          body: html,
          publishedAt,
          sendToAll,
          authorName: body.authorName?.trim() || null,
        },
      },
    });

    let notified = 0;
    if (sendToAll) {
      notified = await this.notifications.notifyAllUsers(tenantId, {
        kind: NotificationKind.info,
        title: 'Новое сообщение',
        body: plain.slice(0, 280),
        entity: 'news',
        entityId: item.id,
        href: '/news',
      });
    }

    return {
      id: item.id,
      code: item.code,
      title: item.name,
      body: html,
      publishedAt,
      sendToAll,
      authorName: body.authorName?.trim() || null,
      notified,
    };
  }

  async remove(tenantId: string, id: string) {
    const dict = await this.ensureDict(tenantId);
    const item = await this.prisma.dictionaryItem.findFirst({
      where: { id, dictionaryId: dict.id },
    });
    if (!item) throw new NotFoundException('Сообщение не найдено');
    await this.prisma.dictionaryItem.delete({ where: { id } });
    return { ok: true };
  }

  async birthdays(tenantId: string) {
    const today = new Date();
    const month = today.getMonth();
    const dayOfMonth = today.getDate();

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: EmploymentStatus.active,
        person: { birthDate: { not: null } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        position: { select: { name: true } },
        division: { select: { name: true } },
        person: { select: { birthDate: true } },
      },
    });

    const MONTHS_RU = [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ];

    return employees
      .map((e) => {
        const bd = e.person?.birthDate;
        if (!bd) return null;
        const bMonth = bd.getUTCMonth();
        const bDay = bd.getUTCDate();
        let delta = bDay - dayOfMonth;
        if (bMonth !== month) {
          const thisYear = new Date(
            Date.UTC(today.getFullYear(), bMonth, bDay),
          );
          const todayUtc = new Date(
            Date.UTC(today.getFullYear(), month, dayOfMonth),
          );
          delta = Math.round(
            (thisYear.getTime() - todayUtc.getTime()) / 86400000,
          );
          if (delta < -3) {
            const nextYear = new Date(
              Date.UTC(today.getFullYear() + 1, bMonth, bDay),
            );
            delta = Math.round(
              (nextYear.getTime() - todayUtc.getTime()) / 86400000,
            );
          }
        }
        if (delta < -1 || delta > 30) return null;
        return {
          employeeId: e.id,
          fullName: fullName(e),
          tabNumber: e.tabNumber,
          position: e.position?.name || e.division?.name || '',
          birthDate: toLocalYmd(bd),
          day: bDay,
          month: bMonth + 1,
          daysUntil: delta,
          label: `${bDay} ${MONTHS_RU[bMonth]}`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort(
        (a, b) =>
          a.daysUntil - b.daysUntil || a.fullName.localeCompare(b.fullName),
      );
  }
}
