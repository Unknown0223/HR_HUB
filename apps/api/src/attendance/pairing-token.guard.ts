import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export type PairingAuthContext = {
  sessionId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: Date | null;
  createdById: string | null;
};

/**
 * Auth via short-lived pairing token (X-Pairing-Token header).
 * Looks up sha256(token) on DeviceProvisionSession.pairingTokenHash.
 */
@Injectable()
export class PairingTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & { pairing?: PairingAuthContext }
    >();
    const header = String(req.headers['x-pairing-token'] ?? '').trim();
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const token = header || bearer;
    if (!token) {
      throw new UnauthorizedException('X-Pairing-Token required');
    }

    const tokenHash = hashToken(token);
    const session = await this.prisma.deviceProvisionSession.findFirst({
      where: { pairingTokenHash: tokenHash },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) {
      throw new UnauthorizedException('Pairing token invalid');
    }
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Pairing token expired');
    }

    req.pairing = {
      sessionId: session.id,
      tenantId: session.tenantId,
      tokenHash,
      expiresAt: session.expiresAt,
      createdById: session.createdById ?? null,
    };
    return true;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
