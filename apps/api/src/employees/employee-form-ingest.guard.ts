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
 * Google Form / Apps Script → employee create.
 * Header: X-Employee-Form-Key (or Authorization: Bearer).
 * Env: EMPLOYEE_FORM_INGEST_KEY (prod required).
 */
@Injectable()
export class EmployeeFormIngestGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (
      this.config.get<string>('EMPLOYEE_FORM_INGEST_KEY') ?? ''
    ).trim();
    const isProd =
      (process.env.NODE_ENV ?? this.config.get<string>('NODE_ENV') ?? '')
        .toLowerCase() === 'production';

    if (!expected) {
      if (isProd) {
        throw new UnauthorizedException(
          'Employee form ingest closed: set EMPLOYEE_FORM_INGEST_KEY',
        );
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const headerKey = String(req.headers['x-employee-form-key'] ?? '').trim();
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const provided = headerKey || bearer;

    if (!provided || !keysEqual(provided, expected)) {
      throw new UnauthorizedException(
        'Employee form ingest requires X-Employee-Form-Key matching EMPLOYEE_FORM_INGEST_KEY',
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
