import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { PairingAuthContext } from './pairing-token.guard';
import { hashToken } from './pairing-token.guard';

export type OfficeLinkAuthContext = {
  mode: 'link_key' | 'pairing';
  pairing?: PairingAuthContext;
};

/**
 * Accept either long-lived X-Device-Link-Key or short-lived X-Pairing-Token.
 * Used by classic office-link routes (ping / announce / device / locations).
 */
@Injectable()
export class OfficeLinkAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & { officeLinkAuth?: OfficeLinkAuthContext; pairing?: PairingAuthContext }
    >();

    const pairingHeader = String(req.headers['x-pairing-token'] ?? '').trim();
    if (pairingHeader) {
      const tokenHash = hashToken(pairingHeader);
      const session = await this.prisma.deviceProvisionSession.findFirst({
        where: { pairingTokenHash: tokenHash },
        orderBy: { createdAt: 'desc' },
      });
      if (session && !(session.expiresAt && session.expiresAt.getTime() < Date.now())) {
        const pairing: PairingAuthContext = {
          sessionId: session.id,
          tenantId: session.tenantId,
          tokenHash,
          expiresAt: session.expiresAt,
          createdById: session.createdById ?? null,
        };
        req.pairing = pairing;
        req.officeLinkAuth = { mode: 'pairing', pairing };
        return true;
      }
      // Expired/invalid pairing: fall through to link key when present
      // (office PC often still has a valid long-lived link.key).
    }

    const expected = this.expectedLinkKey();
    if (!expected) {
      if (pairingHeader) {
        throw new UnauthorizedException('Pairing token expired');
      }
      throw new UnauthorizedException(
        'DEVICE_LINK_KEY sozlanmagan yoki X-Pairing-Token kerak',
      );
    }
    const headerKey = String(req.headers['x-device-link-key'] ?? '').trim();
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const provided = headerKey || bearer;
    if (!provided || !keysEqual(provided, expected)) {
      if (pairingHeader) {
        throw new UnauthorizedException('Pairing token expired');
      }
      throw new UnauthorizedException('Ulanish kaliti noto‘g‘ri');
    }
    req.officeLinkAuth = { mode: 'link_key' };
    return true;
  }

  expectedLinkKey(): string {
    return (
      (this.config.get<string>('DEVICE_LINK_KEY') ?? '').trim() ||
      (this.config.get<string>('PUNCH_INGEST_API_KEY') ?? '').trim()
    );
  }
}

function keysEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
