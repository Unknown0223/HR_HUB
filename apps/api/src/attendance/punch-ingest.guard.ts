import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Optional API key for public punch ingest.
 * If PUNCH_INGEST_API_KEY is unset/empty → open (lab/dev).
 * If set → require matching X-Punch-Key or Authorization: Bearer <key>.
 */
@Injectable()
export class PunchIngestGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (this.config.get<string>('PUNCH_INGEST_API_KEY') ?? '').trim();
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const headerKey = String(req.headers['x-punch-key'] ?? '').trim();
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';

    if (headerKey === expected || bearer === expected) return true;

    throw new UnauthorizedException(
      'Punch ingest requires X-Punch-Key (or Bearer) matching PUNCH_INGEST_API_KEY',
    );
  }
}
