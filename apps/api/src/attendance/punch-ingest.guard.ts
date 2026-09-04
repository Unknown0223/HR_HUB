import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * HTTP punch/heartbeat ingest auth.
 * - If PUNCH_INGEST_API_KEY is set → require X-Punch-Key or Bearer.
 * - Production with empty key → reject (never open). API bootstrap also refuses to start.
 * - Local/dev with empty key → open (lab convenience). Device-gw NATS path is separate.
 */
@Injectable()
export class PunchIngestGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (this.config.get<string>('PUNCH_INGEST_API_KEY') ?? '').trim();
    const isProd =
      (process.env.NODE_ENV ?? this.config.get<string>('NODE_ENV') ?? '')
        .toLowerCase() === 'production';

    if (!expected) {
      if (isProd) {
        throw new UnauthorizedException(
          'Punch ingest is closed: set PUNCH_INGEST_API_KEY',
        );
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const headerKey = String(req.headers['x-punch-key'] ?? '').trim();
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const provided = headerKey || bearer;

    if (!provided || !keysEqual(provided, expected)) {
      throw new UnauthorizedException(
        'Punch ingest requires X-Punch-Key (or Bearer) matching PUNCH_INGEST_API_KEY',
      );
    }
    return true;
  }
}

function keysEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
