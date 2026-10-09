import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export type TelegramBotConfig = {
  botToken: string;
  botUsername: string;
  webhookSecret: string;
  publicApiUrl: string;
  source: 'integration' | 'env' | 'none';
};

export type InlineButton = { text: string; callback_data?: string; url?: string };

export const TELEGRAM_UPDATES = ['message', 'callback_query'] as const;

function asCfg(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

const TELEGRAM_INTEGRATION = [
  { name: { equals: 'Telegram Bot', mode: 'insensitive' as const } },
  { name: { contains: 'telegram', mode: 'insensitive' as const } },
];

/** Bot settings (tenant integration → env → any tenant's bot) and the raw Bot API calls. */
@Injectable()
export class TelegramBotClient implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramBotClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  envConfig(): TelegramBotConfig {
    const botToken = (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    const botUsername = (this.config.get<string>('TELEGRAM_BOT_USERNAME') ?? '')
      .trim()
      .replace(/^@/, '');
    const webhookSecret = (this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '').trim();
    const publicApiUrl = (
      this.config.get<string>('API_PUBLIC_URL') ??
      this.config.get<string>('PUBLIC_API_URL') ??
      ''
    )
      .trim()
      .replace(/\/$/, '');
    return { botToken, botUsername, webhookSecret, publicApiUrl, source: botToken ? 'env' : 'none' };
  }

  async resolveConfig(tenantId?: string | null): Promise<TelegramBotConfig> {
    const env = this.envConfig();
    if (tenantId) {
      const row = await this.prisma.externalIntegration.findFirst({
        where: { tenantId, OR: TELEGRAM_INTEGRATION },
        orderBy: { updatedAt: 'desc' },
      });
      if (row) {
        const c = asCfg(row.config);
        const sys = String(c.sys || '').toLowerCase();
        if (!sys || sys === 'telegram') {
          const botToken = String(c.botToken || c.token || '').trim() || env.botToken;
          const botUsername =
            String(c.botUsername || c.username || '').trim().replace(/^@/, '') || env.botUsername;
          const webhookSecret = String(c.webhookSecret || '').trim() || env.webhookSecret;
          const publicApiUrl =
            String(c.publicApiUrl || '').trim().replace(/\/$/, '') || env.publicApiUrl;
          if (botToken) {
            return {
              botToken,
              botUsername,
              webhookSecret,
              publicApiUrl,
              source: String(c.botToken || c.token || '').trim() ? 'integration' : 'env',
            };
          }
        }
      }
    }

    if (env.botToken) return env;

    // Fallback: any tenant telegram row (webhook / single-bot setups)
    const any = await this.prisma.externalIntegration.findMany({
      where: { isActive: true, OR: TELEGRAM_INTEGRATION },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
    for (const row of any) {
      const c = asCfg(row.config);
      if (String(c.sys || '').toLowerCase() === 'telegram' || !c.sys) {
        const botToken = String(c.botToken || c.token || '').trim();
        if (!botToken) continue;
        return {
          botToken,
          botUsername: String(c.botUsername || '').trim().replace(/^@/, ''),
          webhookSecret: String(c.webhookSecret || '').trim() || env.webhookSecret,
          publicApiUrl: String(c.publicApiUrl || '').trim().replace(/\/$/, '') || env.publicApiUrl,
          source: 'integration',
        };
      }
    }
    return { ...env, source: 'none' };
  }

  /** Every configured bot (env + tenant integrations), de-duplicated by token. */
  private async allConfigs(): Promise<TelegramBotConfig[]> {
    const out = new Map<string, TelegramBotConfig>();
    const env = this.envConfig();
    if (env.botToken) out.set(env.botToken, env);
    const rows = await this.prisma.externalIntegration.findMany({
      where: { isActive: true, OR: TELEGRAM_INTEGRATION },
      take: 50,
    });
    for (const row of rows) {
      const c = asCfg(row.config);
      if (c.sys && String(c.sys).toLowerCase() !== 'telegram') continue;
      const botToken = String(c.botToken || c.token || '').trim();
      if (!botToken || out.has(botToken)) continue;
      out.set(botToken, {
        botToken,
        botUsername: String(c.botUsername || '').trim().replace(/^@/, ''),
        webhookSecret: String(c.webhookSecret || '').trim() || env.webhookSecret,
        publicApiUrl: String(c.publicApiUrl || '').trim().replace(/\/$/, '') || env.publicApiUrl,
        source: 'integration',
      });
    }
    return [...out.values()];
  }

  /**
   * Webhooks registered before sign-in approval asked Telegram for messages only; re-register
   * them with the same URL so button presses (callback_query) reach us too.
   */
  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    void this.ensureWebhookUpdates().catch((e) =>
      this.logger.warn(`webhook update check failed: ${e instanceof Error ? e.message : e}`),
    );
  }

  private async ensureWebhookUpdates() {
    for (const cfg of await this.allConfigs()) {
      const info = await this.call<{ url?: string; allowed_updates?: string[] }>(
        cfg.botToken,
        'getWebhookInfo',
        {},
      );
      const url = info?.url;
      if (!url) continue;
      const allowed = info?.allowed_updates ?? [];
      if (!allowed.length || TELEGRAM_UPDATES.every((u) => allowed.includes(u))) continue;
      await this.call(cfg.botToken, 'setWebhook', {
        url,
        allowed_updates: TELEGRAM_UPDATES,
        ...(cfg.webhookSecret ? { secret_token: cfg.webhookSecret } : {}),
      });
      this.logger.log(`Telegram webhook now receives ${TELEGRAM_UPDATES.join(', ')}`);
    }
  }

  async call<T = unknown>(
    botToken: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: T;
        description?: string;
      };
      if (!res.ok || data.ok === false) {
        this.logger.warn(`Telegram ${method} ${res.status}: ${data.description ?? ''}`);
        return null;
      }
      return (data.result ?? null) as T | null;
    } catch (e) {
      this.logger.warn(`Telegram ${method} error: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** Plain text by default; `html` enables Telegram's HTML subset (escape user text first). */
  async sendMessage(
    chatId: string,
    text: string,
    opts: { tenantId?: string | null; buttons?: InlineButton[][]; html?: boolean } = {},
  ): Promise<number | null> {
    const cfg = await this.resolveConfig(opts.tenantId);
    if (!cfg.botToken) return null;
    const sent = await this.call<{ message_id: number }>(cfg.botToken, 'sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(opts.html ? { parse_mode: 'HTML' } : {}),
      ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
    });
    return sent?.message_id ?? null;
  }

  /** Video clip (mp4) with a caption. Returns null when the bot or the chat rejects it. */
  async sendVideo(
    chatId: string,
    video: Buffer,
    caption: string,
    tenantId?: string | null,
    filename = 'punch.mp4',
  ): Promise<number | null> {
    const cfg = await this.resolveConfig(tenantId);
    if (!cfg.botToken || !chatId) return null;
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption.slice(0, 1000));
    form.append('supports_streaming', 'true');
    form.append('video', new Blob([new Uint8Array(video)], { type: 'video/mp4' }), filename);
    try {
      const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendVideo`, { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!res.ok || data.ok === false) {
        this.logger.warn(`Telegram sendVideo ${res.status}: ${data.description ?? ''}`);
        return null;
      }
      return data.result?.message_id ?? null;
    } catch (e) {
      this.logger.warn(`Telegram sendVideo error: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async editMessage(
    chatId: string,
    messageId: number,
    text: string,
    tenantId?: string | null,
  ) {
    const cfg = await this.resolveConfig(tenantId);
    if (!cfg.botToken) return;
    await this.call(cfg.botToken, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: { inline_keyboard: [] },
    });
  }

  async answerCallback(callbackId: string, text: string, tenantId?: string | null) {
    const cfg = await this.resolveConfig(tenantId);
    if (!cfg.botToken) return;
    await this.call(cfg.botToken, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text: text.slice(0, 190),
    });
  }
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
