import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/** Shared office-link password: DEVICE_LINK_KEY, else PUNCH_INGEST_API_KEY. */
@Injectable()
export class DeviceLinkGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.expectedKey();
    if (!expected) {
      throw new UnauthorizedException('DEVICE_LINK_KEY sozlanmagan');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const headerKey = String(req.headers['x-device-link-key'] ?? '').trim();
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const provided = headerKey || bearer;
    if (!provided || !keysEqual(provided, expected)) {
      throw new UnauthorizedException('Ulanish kaliti noto‘g‘ri');
    }
    return true;
  }

  expectedKey(): string {
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
