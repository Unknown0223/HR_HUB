import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationKind } from '@prisma/client';

type TgUpdate = {
  update_id?: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string; last_name?: string };
    photo?: Array<{ file_id: string }>;
  };
};

type SessionState = {
  tenantId: string;
  inviteCode: string;
  step: 'name' | 'phone' | 'pinfl' | 'done';
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  /** In-memory draft sessions keyed by telegram user id */
  private readonly drafts = new Map<string, SessionState>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  botToken(): string {
    return (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
  }

  botUsername(): string {
    return (this.config.get<string>('TELEGRAM_BOT_USERNAME') ?? '').trim().replace(/^@/, '');
  }

  isEnabled(): boolean {
    return Boolean(this.botToken());
  }

  async createInvite(tenantId: string) {
    if (!this.isEnabled()) {
      throw new BadRequestException(
        'TELEGRAM_BOT_TOKEN sozlanmagan — bot o‘chirilgan',
      );
    }
    const inviteCode = randomBytes(4).toString('hex');
    const bot = this.botUsername() || 'HRHUBBot';
    const deepLink = `https://t.me/${bot}?start=${inviteCode}`;
    // Store invite as a placeholder row (status=invited) until employee fills form
    await this.prisma.employeeJoinRequest.create({
      data: {
        tenantId,
        inviteCode,
        status: 'invited',
      },
    });
    return {
      inviteCode,
      deepLink,
      botUsername: bot,
      instructions:
        'Xodimga shu havolani yuboring. Bot FIO/telefon/PINFL so‘raydi, HR tasdiqlaydi.',
    };
  }

  async listJoinRequests(tenantId: string, status?: string) {
    return this.prisma.employeeJoinRequest.findMany({
      where: {
        tenantId,
        ...(status ? { status } : { status: { not: 'invited' } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async approveJoinRequest(
    tenantId: string,
    id: string,
    opts: { tabNumber: string; reviewedBy?: string },
  ) {
    const row = await this.prisma.employeeJoinRequest.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('So‘rov topilmadi');
    if (row.status === 'approved' && row.employeeId) {
      return { ok: true, employeeId: row.employeeId, already: true };
    }
    if (!row.firstName || !row.lastName) {
      throw new BadRequestException('So‘rovda FIO yo‘q');
    }
    const tabNumber = String(opts.tabNumber || '').trim();
    if (!tabNumber) throw new BadRequestException('tabNumber majburiy');

    const emp = await this.prisma.employee.create({
      data: {
        tenantId,
        tabNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        middleName: row.middleName || null,
        phone: row.phone || null,
        telegramUsername: row.telegramUsername || null,
      },
    });

    if (row.pinfl || row.passportNumber) {
      const person = await this.prisma.person.create({
        data: {
          tenantId,
          firstName: row.firstName,
          lastName: row.lastName,
          middleName: row.middleName || null,
          pinfl: row.pinfl || null,
          passport: [row.passportSeries, row.passportNumber]
            .filter(Boolean)
            .join(' ')
            .trim() || null,
          birthDate: row.birthDate,
          gender: row.gender || null,
          phone: row.phone || null,
          photoUrl: row.photoUrl || null,
        },
      });
      await this.prisma.employee.update({
        where: { id: emp.id },
        data: { personId: person.id },
      });
      if (row.passportNumber) {
        await this.prisma.personDocument.create({
          data: {
            tenantId,
            employeeId: emp.id,
            personId: person.id,
            docType: 'PASSPORT',
            docNumber: row.passportNumber,
            issuer: null,
          },
        });
      }
    }

    await this.prisma.employeeJoinRequest.update({
      where: { id: row.id },
      data: {
        status: 'approved',
        employeeId: emp.id,
        reviewedBy: opts.reviewedBy || null,
        reviewedAt: new Date(),
      },
    });

    if (row.telegramUserId) {
      await this.sendMessage(
        row.telegramUserId,
        `✅ Arizangiz qabul qilindi. Tab № ${tabNumber}. HR bilan bog‘laning.`,
      );
    }
    return { ok: true, employeeId: emp.id };
  }

  async rejectJoinRequest(tenantId: string, id: string, reviewedBy?: string) {
    const row = await this.prisma.employeeJoinRequest.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('So‘rov topilmadi');
    await this.prisma.employeeJoinRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: reviewedBy || null,
        reviewedAt: new Date(),
      },
    });
    if (row.telegramUserId) {
      await this.sendMessage(
        row.telegramUserId,
        '❌ Arizangiz rad etildi. HR bilan bog‘laning.',
      );
    }
    return { ok: true };
  }

  async handleWebhook(update: TgUpdate) {
    if (!this.isEnabled()) return { ok: true, skipped: true };
    const msg = update.message;
    if (!msg?.chat?.id) return { ok: true };
    const chatId = String(msg.chat.id);
    const fromId = String(msg.from?.id || chatId);
    const text = String(msg.text || '').trim();
    const username = msg.from?.username || null;

    if (text.startsWith('/start')) {
      const code = text.split(/\s+/)[1]?.trim();
      if (!code) {
        await this.sendMessage(
          chatId,
          'HR HUB bot. Qo‘shilish uchun HR bergan havola orqali /start QODNI yuboring.',
        );
        return { ok: true };
      }
      const invite = await this.prisma.employeeJoinRequest.findFirst({
        where: { inviteCode: code, status: 'invited' },
        orderBy: { createdAt: 'desc' },
      });
      if (!invite) {
        await this.sendMessage(chatId, 'Kod topilmadi yoki muddati o‘tgan.');
        return { ok: true };
      }
      this.drafts.set(fromId, {
        tenantId: invite.tenantId,
        inviteCode: code,
        step: 'name',
      });
      await this.sendMessage(
        chatId,
        'Salom! Xodim sifatida qo‘shilish uchun Familiya Ism Sharifni yuboring (masalan: Karimov Ali Vali).',
      );
      return { ok: true };
    }

    const draft = this.drafts.get(fromId);
    if (!draft) {
      await this.sendMessage(
        chatId,
        'Sessiya yo‘q. HR havolasidan /start QOD bilan boshlang.',
      );
      return { ok: true };
    }

    if (draft.step === 'name') {
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await this.sendMessage(chatId, 'Kamida Familiya va Ism yozing.');
        return { ok: true };
      }
      draft.lastName = parts[0];
      draft.firstName = parts[1];
      draft.middleName = parts.slice(2).join(' ') || undefined;
      draft.step = 'phone';
      this.drafts.set(fromId, draft);
      await this.sendMessage(chatId, 'Telefon raqamingizni yuboring (+998…).');
      return { ok: true };
    }

    if (draft.step === 'phone') {
      draft.phone = text;
      draft.step = 'pinfl';
      this.drafts.set(fromId, draft);
      await this.sendMessage(
        chatId,
        'PINFL (14 raqam) yuboring yoki o‘tkazib yuborish uchun «-» yozing.',
      );
      return { ok: true };
    }

    if (draft.step === 'pinfl') {
      const pinfl = text === '-' ? null : text.replace(/\D/g, '');
      const invite = await this.prisma.employeeJoinRequest.findFirst({
        where: {
          tenantId: draft.tenantId,
          inviteCode: draft.inviteCode,
          status: 'invited',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!invite) {
        await this.sendMessage(chatId, 'Invite eskirgan. Yangi kod so‘rang.');
        this.drafts.delete(fromId);
        return { ok: true };
      }
      await this.prisma.employeeJoinRequest.update({
        where: { id: invite.id },
        data: {
          status: 'pending',
          telegramUserId: fromId,
          telegramUsername: username,
          firstName: draft.firstName!,
          lastName: draft.lastName!,
          middleName: draft.middleName || null,
          phone: draft.phone || null,
          pinfl: pinfl || null,
        },
      });
      this.drafts.delete(fromId);
      draft.step = 'done';
      await this.sendMessage(
        chatId,
        '✅ Ariza yuborildi. HR tasdiqlashini kuting.',
      );
      try {
        await this.notifications.notifyApprovers(draft.tenantId, {
          kind: NotificationKind.system,
          title: 'Telegram: yangi xodim arizasi',
          body: `${draft.lastName} ${draft.firstName} (@${username || '—'})`,
          entity: 'employee_join_request',
          href: '/employees?panel=telegram',
        });
      } catch (e) {
        this.logger.warn(
          `notify failed: ${e instanceof Error ? e.message : e}`,
        );
      }
      return { ok: true };
    }

    return { ok: true };
  }

  async sendMessage(chatId: string, text: string) {
    const token = this.botToken();
    if (!token) return;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Telegram sendMessage ${res.status}: ${body}`);
      }
    } catch (e) {
      this.logger.warn(
        `Telegram sendMessage error: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  status() {
    return {
      enabled: this.isEnabled(),
      botUsername: this.botUsername() || null,
    };
  }
}
