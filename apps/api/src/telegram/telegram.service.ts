import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FaceSyncStatus, NotificationKind } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { TELEGRAM_UPDATES, TelegramBotClient, type TelegramBotConfig } from './telegram-bot.client';
import {
  LINK_START_PREFIX,
  LOGIN_CALLBACK_PREFIX,
  TelegramLinksService,
} from './telegram-links.service';

export type { TelegramBotConfig } from './telegram-bot.client';

type TgFrom = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TgUpdate = {
  update_id?: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type?: string };
    from?: TgFrom;
    photo?: Array<{ file_id: string; file_unique_id?: string; file_size?: number }>;
  };
  callback_query?: {
    id: string;
    from: TgFrom;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

type SessionState = {
  tenantId: string;
  inviteCode: string;
  step: 'name' | 'phone' | 'pinfl' | 'photo' | 'done';
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  pinfl?: string | null;
  photoUrl?: string | null;
};

function asCfg(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  /** In-memory draft sessions keyed by telegram user id */
  private readonly drafts = new Map<string, SessionState>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly bot: TelegramBotClient,
    private readonly links: TelegramLinksService,
  ) {}

  resolveConfig(tenantId?: string | null): Promise<TelegramBotConfig> {
    return this.bot.resolveConfig(tenantId);
  }

  async isEnabled(tenantId?: string | null): Promise<boolean> {
    const cfg = await this.resolveConfig(tenantId);
    return Boolean(cfg.botToken);
  }

  async status(tenantId?: string | null) {
    const cfg = await this.resolveConfig(tenantId);
    return {
      enabled: Boolean(cfg.botToken),
      botUsername: cfg.botUsername || null,
      source: cfg.source,
      hasWebhookSecret: Boolean(cfg.webhookSecret),
      publicApiUrl: cfg.publicApiUrl || null,
      webhookPath: '/api/telegram/webhook',
    };
  }

  async assertWebhookSecret(headerSecret: string | undefined) {
    const expectedEnv = (
      this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? ''
    ).trim();
    if (expectedEnv) {
      if (headerSecret !== expectedEnv) {
        throw new UnauthorizedException('Invalid webhook secret');
      }
      return;
    }
    const rows = await this.prisma.externalIntegration.findMany({
      where: {
        OR: [
          { name: { equals: 'Telegram Bot', mode: 'insensitive' } },
          { name: { contains: 'telegram', mode: 'insensitive' } },
        ],
      },
      take: 50,
    });
    const secrets = rows
      .map((r) => String(asCfg(r.config).webhookSecret || '').trim())
      .filter(Boolean);
    if (!secrets.length) return; // open webhook (lab)
    if (!headerSecret || !secrets.includes(headerSecret)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  async createInvite(tenantId: string) {
    const cfg = await this.resolveConfig(tenantId);
    if (!cfg.botToken) {
      throw new BadRequestException(
        'Telegram bot sozlanmagan — Settings → Telegram da token kiriting',
      );
    }
    const inviteCode = randomBytes(4).toString('hex');
    const bot = cfg.botUsername || 'HRHUBBot';
    const deepLink = `https://t.me/${bot}?start=${inviteCode}`;
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
        'Xodimga shu havolani yuboring. Bot FIO/telefon/PINFL/foto so‘raydi, HR tasdiqlaydi.',
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

    if (row.photoUrl) {
      await this.prisma.faceProfile.upsert({
        where: { employeeId: emp.id },
        create: {
          tenantId,
          employeeId: emp.id,
          photoUrl: row.photoUrl,
          syncStatus: FaceSyncStatus.pending,
          contentType: 'image/jpeg',
        },
        update: {
          photoUrl: row.photoUrl,
          syncStatus: FaceSyncStatus.pending,
          lastError: null,
        },
      });
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
        tenantId,
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
        tenantId,
      );
    }
    return { ok: true };
  }

  async setupWebhook(
    tenantId: string,
    opts?: { publicApiUrl?: string },
  ) {
    const cfg = await this.resolveConfig(tenantId);
    if (!cfg.botToken) {
      throw new BadRequestException('Avval bot tokenini saqlang');
    }
    const base =
      (opts?.publicApiUrl || '').trim().replace(/\/$/, '') ||
      cfg.publicApiUrl ||
      '';
    if (!base) {
      throw new BadRequestException(
        'publicApiUrl kerak (masalan https://hr-hubapi-production.up.railway.app)',
      );
    }
    const webhookUrl = `${base}/api/telegram/webhook`;
    const body: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: TELEGRAM_UPDATES,
      drop_pending_updates: true,
    };
    if (cfg.webhookSecret) {
      body.secret_token = cfg.webhookSecret;
    }
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || data.ok === false) {
      throw new BadRequestException(
        data.description || `setWebhook HTTP ${res.status}`,
      );
    }

    // Persist publicApiUrl on integration if present
    const row = await this.prisma.externalIntegration.findFirst({
      where: {
        tenantId,
        OR: [
          { name: { equals: 'Telegram Bot', mode: 'insensitive' } },
          { name: { contains: 'telegram', mode: 'insensitive' } },
        ],
      },
    });
    if (row) {
      const prev = asCfg(row.config);
      await this.prisma.externalIntegration.update({
        where: { id: row.id },
        data: {
          config: {
            ...prev,
            sys: 'telegram',
            publicApiUrl: base,
            webhookUrl,
          },
          isActive: true,
        },
      });
    }

    return {
      ok: true,
      webhookUrl,
      botUsername: cfg.botUsername || null,
      hasSecret: Boolean(cfg.webhookSecret),
    };
  }

  async handleWebhook(update: TgUpdate) {
    const cb = update.callback_query;
    if (cb) {
      if (cb.data?.startsWith(LOGIN_CALLBACK_PREFIX)) {
        const res = await this.links.answerLogin(cb.data, cb.from);
        await this.bot.answerCallback(cb.id, res.text, res.tenantId);
        if (res.edit && cb.message) {
          await this.bot.editMessage(String(cb.message.chat.id), cb.message.message_id, res.edit, res.tenantId);
        }
      } else {
        await this.bot.answerCallback(cb.id, 'Noma’lum amal');
      }
      return { ok: true };
    }

    const msg = update.message;
    if (!msg?.chat?.id) return { ok: true };
    const chatId = String(msg.chat.id);
    const fromId = String(msg.from?.id || chatId);
    const text = String(msg.text || '').trim();
    const username = msg.from?.username || null;
    const photoSizes = msg.photo || [];

    if (text === '/stop') {
      const n = msg.from ? await this.links.stopByTelegramUser(msg.from.id) : 0;
      await this.sendMessage(
        chatId,
        n ? 'Akkaunt botdan uzildi. Qayta ulash uchun Worklyn’da «Telegram botga o‘tish» tugmasini bosing.' : 'Bu chatga hech qanday akkaunt ulanmagan.',
      );
      return { ok: true };
    }

    if (text.startsWith('/start')) {
      const code = text.split(/\s+/)[1]?.trim();
      if (code?.startsWith(LINK_START_PREFIX)) {
        if (msg.chat.type && msg.chat.type !== 'private') {
          await this.sendMessage(chatId, 'Akkauntni faqat bot bilan shaxsiy chatda ulash mumkin.');
          return { ok: true };
        }
        const res = await this.links.consumeStart(
          code.slice(LINK_START_PREFIX.length),
          msg.from ?? { id: msg.chat.id },
          chatId,
        );
        await this.sendMessage(chatId, res.text, res.tenantId);
        return { ok: true };
      }
      if (!code) {
        await this.sendMessage(
          chatId,
          'Worklyn bot. Akkauntni ulash uchun Worklyn saytida yoki ilovasida «Telegram botga o‘tish» tugmasini bosing. ' +
            'Yangi xodim sifatida qo‘shilish uchun HR bergan havoladan foydalaning.',
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
      if (!(await this.isEnabled(invite.tenantId))) {
        await this.sendMessage(chatId, 'Bot vaqtincha o‘chirilgan.');
        return { ok: true };
      }
      this.drafts.set(fromId, {
        tenantId: invite.tenantId,
        inviteCode: code,
        step: 'name',
      });
      await this.sendMessage(
        chatId,
        'Salom! Familiya Ism Sharifni yuboring (masalan: Karimov Ali Vali).',
        invite.tenantId,
      );
      return { ok: true };
    }

    const draft = this.drafts.get(fromId);
    if (!draft) {
      const linked = await this.prisma.telegramLink.count({ where: { telegramUserId: fromId } });
      await this.sendMessage(
        chatId,
        linked
          ? 'Bu chat Worklyn akkauntingizga ulangan: bildirishnomalar va kirish/chiqish xabarlari shu yerga keladi. Uzish: /stop'
          : 'Akkauntni ulash uchun Worklyn saytida yoki ilovasida «Telegram botga o‘tish» tugmasini bosing.',
      );
      return { ok: true };
    }

    const tid = draft.tenantId;

    if (draft.step === 'name') {
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await this.sendMessage(chatId, 'Kamida Familiya va Ism yozing.', tid);
        return { ok: true };
      }
      draft.lastName = parts[0];
      draft.firstName = parts[1];
      draft.middleName = parts.slice(2).join(' ') || undefined;
      draft.step = 'phone';
      this.drafts.set(fromId, draft);
      await this.sendMessage(chatId, 'Telefon raqamingizni yuboring (+998…).', tid);
      return { ok: true };
    }

    if (draft.step === 'phone') {
      if (!text && !photoSizes.length) {
        await this.sendMessage(chatId, 'Telefon raqam yuboring.', tid);
        return { ok: true };
      }
      draft.phone = text || draft.phone;
      draft.step = 'pinfl';
      this.drafts.set(fromId, draft);
      await this.sendMessage(
        chatId,
        'PINFL (14 raqam) yuboring yoki o‘tkazib yuborish uchun «-» yozing.',
        tid,
      );
      return { ok: true };
    }

    if (draft.step === 'pinfl') {
      const pinfl = text === '-' ? null : text.replace(/\D/g, '');
      if (text !== '-' && pinfl && pinfl.length !== 14) {
        await this.sendMessage(
          chatId,
          'PINFL 14 raqam bo‘lishi kerak yoki «-» yuboring.',
          tid,
        );
        return { ok: true };
      }
      draft.pinfl = pinfl;
      draft.step = 'photo';
      this.drafts.set(fromId, draft);
      await this.sendMessage(
        chatId,
        'Yuz rasmini yuboring (Face ID uchun). O‘tkazib yuborish: «-».',
        tid,
      );
      return { ok: true };
    }

    if (draft.step === 'photo') {
      let photoUrl: string | null = null;
      if (text === '-') {
        photoUrl = null;
      } else if (photoSizes.length) {
        const best = photoSizes[photoSizes.length - 1];
        try {
          photoUrl = await this.downloadTelegramPhoto(
            tid,
            best.file_id,
            fromId,
          );
        } catch (e) {
          this.logger.warn(
            `photo download failed: ${e instanceof Error ? e.message : e}`,
          );
          await this.sendMessage(
            chatId,
            'Rasm yuklanmadi. Qayta yuboring yoki «-» bilan o‘tkazing.',
            tid,
          );
          return { ok: true };
        }
      } else {
        await this.sendMessage(
          chatId,
          'Rasm yuboring yoki «-» bilan o‘tkazing.',
          tid,
        );
        return { ok: true };
      }

      const invite = await this.prisma.employeeJoinRequest.findFirst({
        where: {
          tenantId: draft.tenantId,
          inviteCode: draft.inviteCode,
          status: 'invited',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!invite) {
        await this.sendMessage(chatId, 'Invite eskirgan. Yangi kod so‘rang.', tid);
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
          pinfl: draft.pinfl || null,
          photoUrl,
        },
      });
      this.drafts.delete(fromId);
      await this.sendMessage(
        chatId,
        '✅ Ariza yuborildi. HR tasdiqlashini kuting.',
        tid,
      );
      try {
        await this.notifications.notifyApprovers(draft.tenantId, {
          kind: NotificationKind.system,
          title: 'Telegram: yangi xodim arizasi',
          body: `${draft.lastName} ${draft.firstName} (@${username || '—'})${
            photoUrl ? ' · foto bor' : ''
          }`,
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

  private async downloadTelegramPhoto(
    tenantId: string,
    fileId: string,
    telegramUserId: string,
  ): Promise<string> {
    const cfg = await this.resolveConfig(tenantId);
    if (!cfg.botToken) throw new BadRequestException('Bot token yo‘q');
    const metaRes = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    const meta = (await metaRes.json()) as {
      ok?: boolean;
      result?: { file_path?: string };
      description?: string;
    };
    if (!meta.ok || !meta.result?.file_path) {
      throw new BadRequestException(meta.description || 'getFile failed');
    }
    const filePath = meta.result.file_path;
    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${cfg.botToken}/${filePath}`,
    );
    if (!fileRes.ok) {
      throw new BadRequestException(`file download HTTP ${fileRes.status}`);
    }
    const buf = Buffer.from(await fileRes.arrayBuffer());
    if (!buf.length) throw new BadRequestException('Empty photo');
    const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg';
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    const key = `telegram-join/${tenantId}/${telegramUserId}/${Date.now()}.${ext}`;
    const { url } = await this.storage.putObject(key, buf, mime);
    return url;
  }

  async sendMessage(
    chatId: string,
    text: string,
    tenantId?: string | null,
  ) {
    await this.bot.sendMessage(chatId, text, { tenantId });
  }
}
