import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/** last_seen_at is a hint for the sessions list, so it is written at most this often. */
const TOUCH_EVERY_MS = 5 * 60_000;

export type SessionClient = { userAgent?: string | null; ip?: string | null };

export function sessionClient(req?: Request): SessionClient {
  if (!req) return {};
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return {
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 400) || null,
    ip: (forwarded || req.ip || '').slice(0, 64) || null,
  };
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, client: SessionClient = {}) {
    const row = await this.prisma.userSession.create({
      data: { userId, userAgent: client.userAgent ?? null, ip: client.ip ?? null },
      select: { id: true },
    });
    return row.id;
  }

  /** False when the session was ended (sign-out, «end session») or belongs to someone else. */
  async isActive(sessionId: string, userId: string) {
    const row = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, lastSeenAt: true },
    });
    if (!row || row.userId !== userId || row.revokedAt) return false;
    if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      void this.prisma.userSession
        .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }
    return true;
  }

  async list(userId: string, currentId: string | null) {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
    });
    return rows.map((r) => ({ ...r, current: r.id === currentId }));
  }

  async revoke(userId: string, sessionId: string) {
    const res = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!res.count) throw new NotFoundException('Сеанс не найден');
    return { ok: true };
  }

  async revokeOthers(userId: string, currentId: string | null) {
    const res = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null, ...(currentId ? { id: { not: currentId } } : {}) },
      data: { revokedAt: new Date() },
    });
    return { revoked: res.count };
  }

  /** Start of the sign-in before the current one, for «previous login» in the profile menu. */
  async previousLoginAt(userId: string, currentId: string | null) {
    const row = await this.prisma.userSession.findFirst({
      where: { userId, ...(currentId ? { id: { not: currentId } } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }
}
