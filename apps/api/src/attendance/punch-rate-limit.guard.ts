import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';

/**
 * Optional rate limit for punch ingest (per IP).
 * PUNCH_INGEST_RATE_LIMIT_PER_MIN unset/0 → disabled (lab/demo).
 * Example prod: PUNCH_INGEST_RATE_LIMIT_PER_MIN=120
 * Uses Redis when available; falls back to in-memory Map.
 */
@Injectable()
export class PunchRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limit = Number(
      this.config.get<string>('PUNCH_INGEST_RATE_LIMIT_PER_MIN') ?? '0',
    );
    if (!Number.isFinite(limit) || limit <= 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip =
      String(req.headers['x-forwarded-for'] ?? '')
        .split(',')[0]
        ?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';

    if (this.redis.isReady) {
      const key = `punchrl:${ip}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, 60);
      if (count != null) {
        if (count > limit) {
          throw new HttpException(
            `Punch ingest rate limit exceeded (${limit}/min). Set PUNCH_INGEST_RATE_LIMIT_PER_MIN=0 to disable.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return true;
      }
      // Redis failed — fall through to memory
    }

    const now = Date.now();
    const windowMs = 60_000;
    let bucket = this.buckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(ip, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      throw new HttpException(
        `Punch ingest rate limit exceeded (${limit}/min). Set PUNCH_INGEST_RATE_LIMIT_PER_MIN=0 to disable.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
