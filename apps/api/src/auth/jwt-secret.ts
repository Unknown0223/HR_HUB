import { ConfigService } from '@nestjs/config';

const WEAK_JWT_SECRETS = new Set([
  '',
  'dev-secret',
  'change-me-phase0-dev-secret-min-32-chars!!',
]);

/** Lab-only fallback — never used when NODE_ENV=production (boot fails earlier). */
const LAB_JWT_FALLBACK = 'dev-secret';

export function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

export function resolveJwtSecret(config?: ConfigService): string {
  const secret = (
    config?.get<string>('JWT_SECRET') ??
    process.env.JWT_SECRET ??
    ''
  ).trim();

  if (isProductionEnv()) {
    if (WEAK_JWT_SECRETS.has(secret) || secret.length < 32) {
      throw new Error(
        'JWT_SECRET is missing/weak for production (need random ≥32 chars).',
      );
    }
    return secret;
  }

  if (!secret || WEAK_JWT_SECRETS.has(secret)) {
    return LAB_JWT_FALLBACK;
  }
  return secret;
}
