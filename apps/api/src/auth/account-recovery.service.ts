import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, isDeliverableEmail } from '../mail/mail.service';
import {
  LOGIN_CALLBACK_PREFIX,
  TelegramLinksService,
  hashSecret,
  newSecret,
} from '../telegram/telegram-links.service';
import { AuthService } from './auth.service';
import { describeDevice, formatWhen } from './device-label';
import { LoginRateLimitService } from './login-rate-limit.service';
import type { SessionClient } from './sessions.service';

export const LOGIN_REQUEST_TTL_MS = 2 * 60_000;
/** An approved request must be picked up by the waiting client within this time after expiry. */
const LOGIN_CLAIM_GRACE_MS = 60_000;
export const RESET_CODE_TTL_MS = 10 * 60_000;
export const RESET_MAX_ATTEMPTS = 5;
const WINDOW_SEC = 15 * 60;
const LOGIN_REQUESTS_PER_USER = 5;
const RESET_CODES_PER_USER = 3;

export class InvalidResetCodeException extends BadRequestException {
  constructor() {
    super('Kod noto‘g‘ri yoki muddati o‘tgan');
  }
}

function shuffled<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function metaOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/**
 * Password-less sign-in approved from the linked Telegram chat, and forgot-password codes
 * sent to Telegram and/or e-mail. Public entry points never reveal whether an account exists.
 */
@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly links: TelegramLinksService,
    private readonly mail: MailService,
    private readonly limits: LoginRateLimitService,
  ) {}

  /**
   * Sends «is this you?» to the linked chat with three numbers; the client shows the right one,
   * so a stray tap on someone else's request cannot sign them in. The response is identical
   * whether or not the account exists or is linked.
   */
  async startTelegramLogin(login: string, client: SessionClient) {
    const requestId = newSecret(32);
    const code = randomInt(10, 100);
    const expiresAt = new Date(Date.now() + LOGIN_REQUEST_TTL_MS);

    const user = await this.auth.findLoginUser(login);
    const link = user?.isActive ? await this.links.linkOf(user.id) : null;
    if (
      user &&
      link &&
      (await this.auth.canSignIn(user)) &&
      (await this.limits.takeQuota(`tg-login-user:${user.id}`, LOGIN_REQUESTS_PER_USER, WINDOW_SEC))
    ) {
      await this.prisma.authToken.updateMany({
        where: { userId: user.id, kind: 'tg_login', status: 'pending' },
        data: { status: 'superseded' },
      });
      const token = await this.prisma.authToken.create({
        data: {
          userId: user.id,
          kind: 'tg_login',
          tokenHash: hashSecret(requestId),
          expiresAt,
          meta: { code, ip: client.ip ?? null, userAgent: client.userAgent ?? null },
        },
      });
      const decoys = new Set<number>();
      while (decoys.size < 2) {
        const n = randomInt(10, 100);
        if (n !== code) decoys.add(n);
      }
      const choices = shuffled([code, ...decoys]);
      const text =
        '🔐 Worklyn’ga kirish so‘rovi\n\n' +
        `Akkaunt: ${user.fullName}\n` +
        `Qurilma: ${describeDevice(client.userAgent)}\n` +
        `IP: ${client.ip || 'noma’lum'}\n` +
        `Vaqt: ${formatWhen()}\n\n` +
        'Agar bu siz bo‘lsangiz, kirish oynasida ko‘rsatilgan raqamni tanlang (2 daqiqa amal qiladi).\n' +
        'Siz bo‘lmasangiz — «Bu men emasman» tugmasini bosing.';
      void this.links
        .sendToUser(user.id, text, {
          tenantId: user.tenantId,
          buttons: [
            choices.map((n) => ({ text: String(n), callback_data: `${LOGIN_CALLBACK_PREFIX}${token.id}:${n}` })),
            [{ text: '❌ Bu men emasman', callback_data: `${LOGIN_CALLBACK_PREFIX}${token.id}:n` }],
          ],
        })
        .catch((e) => this.logger.warn(`tg login request not sent: ${e instanceof Error ? e.message : e}`));
    }
    return { requestId, code, expiresAt };
  }

  /** `approved` carries a fresh session exactly once; unknown request ids look like `pending`. */
  async pollTelegramLogin(requestId: string, client: SessionClient) {
    const token = await this.prisma.authToken.findUnique({ where: { tokenHash: hashSecret(requestId) } });
    if (!token || token.kind !== 'tg_login') return { status: 'pending' as const };
    if (token.status === 'denied') return { status: 'denied' as const };
    const now = Date.now();
    if (token.status === 'approved' && token.expiresAt.getTime() + LOGIN_CLAIM_GRACE_MS > now) {
      const claimed = await this.prisma.authToken.updateMany({
        where: { id: token.id, status: 'approved' },
        data: { status: 'used', usedAt: new Date() },
      });
      if (!claimed.count) return { status: 'expired' as const };
      const session = await this.auth.loginApproved(token.userId, client);
      return { status: 'approved' as const, ...session };
    }
    if (token.status === 'pending' && token.expiresAt.getTime() > now) return { status: 'pending' as const };
    return { status: 'expired' as const };
  }

  /** Real mailbox for codes: the login e-mail unless it is a generated `*.local`, else the employee card's. */
  private async recoveryEmail(user: { tenantId: string | null; email: string; meta: unknown }) {
    if (isDeliverableEmail(user.email)) return user.email;
    if (!user.tenantId) return null;
    const meta = metaOf(user.meta);
    const linkedId =
      typeof meta.employeeId === 'string' && /^[0-9a-f-]{36}$/i.test(meta.employeeId) ? meta.employeeId : null;
    if (!linkedId) return null;
    const emp = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, id: linkedId },
      select: { email: true },
    });
    return isDeliverableEmail(emp?.email) ? emp!.email : null;
  }

  /** Always resolves the same way; delivery happens in the background. */
  async forgotPassword(login: string, client: SessionClient) {
    const user = await this.auth.findLoginUser(login);
    if (!user?.isActive || !(await this.auth.canSignIn(user))) return;
    if (!(await this.limits.takeQuota(`pwd-forgot-user:${user.id}`, RESET_CODES_PER_USER, WINDOW_SEC))) return;

    const [link, email] = await Promise.all([this.links.linkOf(user.id), this.recoveryEmail(user)]);
    const viaMail = Boolean(email) && (await this.mail.isConfigured(user.tenantId));
    if (!link && !viaMail) return;

    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId: user.id, kind: 'pwd_reset', status: 'pending' },
        data: { status: 'superseded' },
      }),
      this.prisma.authToken.create({
        data: {
          id,
          userId: user.id,
          kind: 'pwd_reset',
          tokenHash: hashSecret(`${id}:${code}`),
          expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
          meta: { ip: client.ip ?? null, userAgent: client.userAgent ?? null },
        },
      }),
    ]);

    const text =
      `Worklyn parolni tiklash kodi: ${code}\n\n` +
      'Kod 10 daqiqa amal qiladi. Uni hech kimga aytmang — Worklyn xodimlari kodni so‘ramaydi.\n' +
      `So‘rov: ${describeDevice(client.userAgent)}, IP ${client.ip || 'noma’lum'}, ${formatWhen()}.\n` +
      'Agar siz so‘ramagan bo‘lsangiz, bu xabarga e’tibor bermang — parolingiz o‘zgarmaydi.';
    if (link) {
      void this.links.sendToUser(user.id, `🔑 ${text}`, { tenantId: user.tenantId }).catch(() => undefined);
    }
    if (viaMail && email) {
      void this.mail.send(user.tenantId, email, 'Worklyn: parolni tiklash kodi', text).catch(() => undefined);
    }
  }

  async resetPassword(login: string, code: string, newPassword: string) {
    const user = await this.auth.findLoginUser(login);
    if (!user?.isActive) throw new InvalidResetCodeException();
    const token = await this.prisma.authToken.findFirst({
      where: { userId: user.id, kind: 'pwd_reset', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt.getTime() < Date.now()) throw new InvalidResetCodeException();

    const counted = await this.prisma.authToken.updateMany({
      where: { id: token.id, status: 'pending', attempts: { lt: RESET_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (!counted.count) throw new InvalidResetCodeException();

    const expected = Buffer.from(token.tokenHash);
    const given = Buffer.from(hashSecret(`${token.id}:${code.trim()}`));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      if (token.attempts + 1 >= RESET_MAX_ATTEMPTS) {
        await this.prisma.authToken.updateMany({
          where: { id: token.id, status: 'pending' },
          data: { status: 'blocked' },
        });
      }
      throw new InvalidResetCodeException();
    }

    const claimed = await this.prisma.authToken.updateMany({
      where: { id: token.id, status: 'pending' },
      data: { status: 'used', usedAt: new Date() },
    });
    if (!claimed.count) throw new InvalidResetCodeException();
    try {
      await this.auth.resetPassword(user.id, newPassword);
    } catch (e) {
      // e.g. the new password equals the old one: let the user retry with the same code
      await this.prisma.authToken.update({ where: { id: token.id }, data: { status: 'pending', usedAt: null } });
      throw e;
    }

    void this.links
      .sendToUser(
        user.id,
        '🔐 Parolingiz tiklandi va barcha qurilmalardagi seanslar yopildi.\n' +
          `Vaqt: ${formatWhen()}\n\n` +
          'Agar buni siz qilmagan bo‘lsangiz, darhol administratorga murojaat qiling.',
        { tenantId: user.tenantId },
      )
      .catch(() => undefined);
    return { ok: true };
  }
}
