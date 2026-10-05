import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export const SMTP_INTEGRATION_NAME = 'SMTP (pochta)';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  source: 'integration' | 'env' | 'none';
};

export type SmtpSettingsInput = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  /** Empty or omitted keeps the stored password. */
  password?: string;
  from?: string;
};

function asCfg(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

/** Addresses generated for login-only accounts (`login@<code>.local`) cannot receive mail. */
export function isDeliverableEmail(email: string | null | undefined): email is string {
  const e = String(email ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !e.endsWith('.local');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private envConfig(): SmtpConfig {
    const host = (this.config.get<string>('SMTP_HOST') ?? '').trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 0) || 587;
    const secureRaw = (this.config.get<string>('SMTP_SECURE') ?? '').trim().toLowerCase();
    const user = (this.config.get<string>('SMTP_USER') ?? '').trim();
    return {
      host,
      port,
      secure: secureRaw ? secureRaw === 'true' || secureRaw === '1' : port === 465,
      user,
      password: this.config.get<string>('SMTP_PASSWORD') ?? this.config.get<string>('SMTP_PASS') ?? '',
      from: (this.config.get<string>('SMTP_FROM') ?? '').trim() || user,
      source: host ? 'env' : 'none',
    };
  }

  private async row(tenantId: string) {
    return this.prisma.externalIntegration.findFirst({
      where: { tenantId, name: SMTP_INTEGRATION_NAME },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Tenant integration first (when active and filled in), then `SMTP_*` env. */
  async resolve(tenantId?: string | null): Promise<SmtpConfig> {
    if (tenantId) {
      const row = await this.row(tenantId);
      const c = asCfg(row?.config);
      const host = String(c.host ?? '').trim();
      if (row?.isActive && host) {
        const port = Number(c.port) || 587;
        const user = String(c.user ?? '').trim();
        return {
          host,
          port,
          secure: typeof c.secure === 'boolean' ? c.secure : port === 465,
          user,
          password: String(c.password ?? ''),
          from: String(c.from ?? '').trim() || user,
          source: 'integration',
        };
      }
    }
    return this.envConfig();
  }

  async isConfigured(tenantId?: string | null) {
    const cfg = await this.resolve(tenantId);
    return Boolean(cfg.host && cfg.from);
  }

  /** Settings for the admin page — the password is never returned, only whether one is stored. */
  async settings(tenantId: string) {
    const row = await this.row(tenantId);
    const c = asCfg(row?.config);
    const env = this.envConfig();
    return {
      isActive: row?.isActive ?? false,
      host: String(c.host ?? ''),
      port: Number(c.port) || 587,
      secure: typeof c.secure === 'boolean' ? c.secure : false,
      user: String(c.user ?? ''),
      from: String(c.from ?? ''),
      hasPassword: Boolean(c.password),
      envFallback: env.source === 'env',
      effectiveSource: (await this.resolve(tenantId)).source,
    };
  }

  async saveSettings(tenantId: string, input: SmtpSettingsInput & { isActive?: boolean }) {
    const row = await this.row(tenantId);
    const prev = asCfg(row?.config);
    const next: Record<string, unknown> = { ...prev, sys: 'smtp' };
    if (input.host !== undefined) next.host = input.host.trim();
    if (input.port !== undefined) next.port = input.port;
    if (input.secure !== undefined) next.secure = input.secure;
    if (input.user !== undefined) next.user = input.user.trim();
    if (input.from !== undefined) next.from = input.from.trim();
    if (input.password) next.password = input.password;
    const isActive = input.isActive ?? (row ? row.isActive : true);
    if (row) {
      await this.prisma.externalIntegration.update({
        where: { id: row.id },
        data: { config: next as Prisma.InputJsonValue, isActive },
      });
    } else {
      await this.prisma.externalIntegration.create({
        data: {
          tenantId,
          type: 'custom',
          name: SMTP_INTEGRATION_NAME,
          config: next as Prisma.InputJsonValue,
          isActive,
        },
      });
    }
    return this.settings(tenantId);
  }

  private transport(cfg: SmtpConfig) {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.password } } : {}),
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
  }

  /** Best-effort: false when SMTP is not configured or the server rejected the message. */
  async send(tenantId: string | null, to: string, subject: string, text: string): Promise<boolean> {
    if (!isDeliverableEmail(to)) return false;
    const cfg = await this.resolve(tenantId);
    if (!cfg.host || !cfg.from) return false;
    try {
      await this.transport(cfg).sendMail({ from: cfg.from, to, subject, text });
      return true;
    } catch (e) {
      this.logger.warn(`SMTP send failed (${cfg.source}): ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  /** Admin «test» button: surfaces the SMTP error text instead of swallowing it. */
  async sendTest(tenantId: string, to: string) {
    if (!isDeliverableEmail(to)) throw new BadRequestException('Pochta manzili noto‘g‘ri');
    const cfg = await this.resolve(tenantId);
    if (!cfg.host || !cfg.from) throw new BadRequestException('SMTP sozlanmagan');
    try {
      await this.transport(cfg).sendMail({
        from: cfg.from,
        to,
        subject: 'Worklyn: SMTP sinovi',
        text: 'Bu sinov xati. Pochta sozlamalari to‘g‘ri ishlayapti.',
      });
      return { ok: true, source: cfg.source };
    } catch (e) {
      throw new BadRequestException(`SMTP xatosi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
