import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotClient, type InlineButton } from './telegram-bot.client';

export const LINK_TOKEN_TTL_MS = 10 * 60_000;
export const PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60_000;
/** Deep-link payload prefix; invite codes for self-onboarding are bare hex. */
export const LINK_START_PREFIX = 'L_';
export const LOGIN_CALLBACK_PREFIX = 'tl:';

export function hashSecret(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export function newSecret(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

function metaOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

type TgFrom = { id: number; username?: string };

@Injectable()
export class TelegramLinksService {
  private readonly logger = new Logger(TelegramLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotClient,
  ) {}

  async status(userId: string, tenantId: string | null) {
    const [cfg, link, user] = await Promise.all([
      this.bot.resolveConfig(tenantId),
      this.prisma.telegramLink.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { meta: true } }),
    ]);
    const configured = Boolean(cfg.botToken && cfg.botUsername);
    const snoozeRaw = metaOf(user?.meta).telegramPromptSnoozedUntil;
    const snoozedUntil = typeof snoozeRaw === 'string' ? snoozeRaw : null;
    const snoozed = snoozedUntil ? Date.parse(snoozedUntil) > Date.now() : false;
    return {
      configured,
      botUsername: configured ? cfg.botUsername : null,
      linked: Boolean(link),
      username: link?.username ?? null,
      linkedAt: link?.linkedAt ?? null,
      snoozedUntil,
      promptDue: configured && !link && !snoozed,
    };
  }

  /** One-time `t.me/<bot>?start=L_<secret>` link; the secret is stored hashed and expires in 10 min. */
  async createLink(userId: string, tenantId: string | null) {
    const cfg = await this.bot.resolveConfig(tenantId);
    if (!cfg.botToken || !cfg.botUsername) {
      throw new BadRequestException('Telegram bot sozlanmagan — administratorga murojaat qiling');
    }
    const secret = newSecret();
    const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.authToken.deleteMany({ where: { userId, kind: 'tg_link', status: 'pending' } }),
      this.prisma.authToken.create({
        data: { userId, kind: 'tg_link', tokenHash: hashSecret(secret), expiresAt },
      }),
    ]);
    return {
      url: `https://t.me/${cfg.botUsername}?start=${LINK_START_PREFIX}${secret}`,
      botUsername: cfg.botUsername,
      expiresAt,
    };
  }

  async snooze(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { meta: true } });
    const snoozedUntil = new Date(Date.now() + PROMPT_SNOOZE_MS).toISOString();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        meta: { ...metaOf(user?.meta), telegramPromptSnoozedUntil: snoozedUntil } as Prisma.InputJsonValue,
      },
    });
    return { snoozedUntil };
  }

  async unlink(userId: string, tenantId: string | null) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link) return { ok: true };
    await this.prisma.telegramLink.delete({ where: { userId } });
    await this.bot.sendMessage(
      link.chatId,
      'Akkaunt Worklyn botdan uzildi. Bildirishnomalar endi bu yerga kelmaydi.',
      { tenantId },
    );
    return { ok: true };
  }

  /** `/start L_<secret>` from the deep link: binds the chat to the account that requested the link. */
  async consumeStart(secret: string, from: TgFrom, chatId: string): Promise<{ text: string; tenantId: string | null }> {
    const token = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashSecret(secret) },
      include: { user: { select: { id: true, fullName: true, tenantId: true, isActive: true } } },
    });
    if (
      !token ||
      token.kind !== 'tg_link' ||
      token.status !== 'pending' ||
      token.expiresAt.getTime() < Date.now() ||
      !token.user.isActive
    ) {
      return {
        text: 'Havola eskirgan yoki allaqachon ishlatilgan. Worklyn ilovasida yoki saytida «Telegram botga o‘tish» tugmasini qayta bosing.',
        tenantId: token?.user.tenantId ?? null,
      };
    }
    const claimed = await this.prisma.authToken.updateMany({
      where: { id: token.id, status: 'pending' },
      data: { status: 'used', usedAt: new Date() },
    });
    if (!claimed.count) {
      return { text: 'Havola allaqachon ishlatilgan.', tenantId: token.user.tenantId };
    }
    const cfg = await this.bot.resolveConfig(token.user.tenantId);
    const data = {
      telegramUserId: String(from.id),
      chatId,
      username: from.username ?? null,
      botUsername: cfg.botUsername || null,
      linkedAt: new Date(),
    };
    await this.prisma.telegramLink.upsert({
      where: { userId: token.userId },
      create: { userId: token.userId, ...data },
      update: data,
    });
    return {
      text:
        `✅ ${token.user.fullName} akkaunti ulandi.\n\n` +
        'Endi bu yerga keladi:\n• har bir kirish va chiqish belgisi\n• platformadagi bildirishnomalar\n' +
        '• xavfsizlik xabarlari (yangi kirish, parol o‘zgarishi)\n\n' +
        'Telegram orqali saytga yoki ilovaga kirishni tasdiqlashingiz va parolni tiklashingiz ham mumkin.\n' +
        'Uzish uchun: /stop',
      tenantId: token.user.tenantId,
    };
  }

  /** `/stop`: the Telegram user detaches every account linked to this chat. */
  async stopByTelegramUser(fromId: number) {
    const res = await this.prisma.telegramLink.deleteMany({ where: { telegramUserId: String(fromId) } });
    return res.count;
  }

  /** Approve / deny button on a sign-in request (`tl:<tokenId>:y|n`); only the linked Telegram user may answer. */
  async answerLogin(data: string, from: TgFrom) {
    const [, id, verdict] = data.split(':');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || (verdict !== 'y' && verdict !== 'n')) {
      return { text: 'Noma’lum amal', edit: null as string | null, tenantId: null as string | null };
    }
    const token = await this.prisma.authToken.findUnique({
      where: { id },
      include: { user: { select: { tenantId: true, telegramLink: true } } },
    });
    const tenantId = token?.user.tenantId ?? null;
    if (!token || token.kind !== 'tg_login' || token.user.telegramLink?.telegramUserId !== String(from.id)) {
      return { text: 'So‘rov topilmadi', edit: null, tenantId };
    }
    if (token.status !== 'pending' || token.expiresAt.getTime() < Date.now()) {
      return { text: 'So‘rov muddati o‘tgan', edit: '⌛ Kirish so‘rovi muddati o‘tgan.', tenantId };
    }
    const approved = verdict === 'y';
    await this.prisma.authToken.updateMany({
      where: { id, status: 'pending' },
      data: { status: approved ? 'approved' : 'denied' },
    });
    return approved
      ? { text: 'Kirish tasdiqlandi', edit: '✅ Kirish tasdiqlandi.', tenantId }
      : {
          text: 'Kirish rad etildi',
          edit: '❌ Kirish rad etildi. Agar bu siz bo‘lmasangiz, parolingizni almashtiring.',
          tenantId,
        };
  }

  async linkOf(userId: string) {
    return this.prisma.telegramLink.findUnique({ where: { userId } });
  }

  async sendToUser(
    userId: string,
    text: string,
    opts: { tenantId?: string | null; buttons?: InlineButton[][]; html?: boolean } = {},
  ) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link) return null;
    return this.bot.sendMessage(link.chatId, text, opts);
  }

  /** Best-effort fan-out; never throws so callers can fire and forget. */
  async sendToUsers(userIds: string[], text: string, opts: { tenantId?: string | null; html?: boolean } = {}) {
    if (!userIds.length) return 0;
    try {
      const links = await this.prisma.telegramLink.findMany({
        where: { userId: { in: [...new Set(userIds)] } },
        select: { chatId: true },
      });
      const chats = [...new Set(links.map((l) => l.chatId))];
      for (const chatId of chats) {
        await this.bot.sendMessage(chatId, text, opts);
      }
      return chats.length;
    } catch (e) {
      this.logger.warn(`telegram fan-out failed: ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }
}
