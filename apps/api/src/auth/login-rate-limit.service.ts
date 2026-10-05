import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_WINDOW_SEC = Math.floor(FAIL_WINDOW_MS / 1000);
const MAX_FAILS_PER_EMAIL_IP = 5;
const MAX_FAILS_PER_IP = 25;

type Bucket = { count: number; resetAt: number; limit: number };

/**
 * Failed-login limiter. Successful logins clear the email+IP bucket.
 * Per email+IP (and a higher per-IP cap) so an office NAT is not locked out.
 * Uses Redis when REDIS_URL is set; falls back to in-memory Maps.
 */
@Injectable()
export class LoginRateLimitService {
  private readonly byEmailIp = new Map<string, Bucket>();
  private readonly byIp = new Map<string, Bucket>();
  private readonly quotas = new Map<string, Bucket>();

  constructor(private readonly redis: RedisService) {}

  clientIp(req: Request): string {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      ?.trim();
    return forwarded || req.ip || req.socket.remoteAddress || 'unknown';
  }

  async assertAllowed(req: Request, email: string) {
    const ip = this.clientIp(req);
    if (this.redis.isReady) {
      const emailCount = Number(
        (await this.redis.get(this.redisEmailIpKey(ip, email))) ?? 0,
      );
      const ipCount = Number((await this.redis.get(this.redisIpKey(ip))) ?? 0);
      if (
        emailCount >= MAX_FAILS_PER_EMAIL_IP ||
        ipCount >= MAX_FAILS_PER_IP
      ) {
        throw this.locked();
      }
      return;
    }

    const now = Date.now();
    this.prune(now);
    if (this.isLocked(this.byEmailIp.get(this.emailIpKey(ip, email)), now)) {
      throw this.locked();
    }
    if (this.isLocked(this.byIp.get(ip), now)) {
      throw this.locked();
    }
  }

  async recordFailure(req: Request, email: string) {
    const ip = this.clientIp(req);
    if (this.redis.isReady) {
      const emailKey = this.redisEmailIpKey(ip, email);
      const ipKey = this.redisIpKey(ip);
      const emailCount = await this.redis.incr(emailKey);
      if (emailCount === 1) await this.redis.expire(emailKey, FAIL_WINDOW_SEC);
      const ipCount = await this.redis.incr(ipKey);
      if (ipCount === 1) await this.redis.expire(ipKey, FAIL_WINDOW_SEC);
      if (
        (emailCount != null && emailCount >= MAX_FAILS_PER_EMAIL_IP) ||
        (ipCount != null && ipCount >= MAX_FAILS_PER_IP)
      ) {
        throw this.locked();
      }
      // Redis failed mid-flight — fall through to memory
      if (emailCount != null && ipCount != null) return;
    }

    const now = Date.now();
    this.bump(this.byEmailIp, this.emailIpKey(ip, email), now, MAX_FAILS_PER_EMAIL_IP);
    this.bump(this.byIp, ip, now, MAX_FAILS_PER_IP);
    if (
      this.isLocked(this.byEmailIp.get(this.emailIpKey(ip, email)), now) ||
      this.isLocked(this.byIp.get(ip), now)
    ) {
      throw this.locked();
    }
  }

  /**
   * Counts every call (not only failures) against `limit` per `windowSec`; true while under it.
   * Used for actions that send messages (sign-in requests, reset codes) so they cannot be spammed.
   */
  async takeQuota(key: string, limit: number, windowSec: number): Promise<boolean> {
    const k = `quota:${key.trim().toLowerCase()}`;
    if (this.redis.isReady) {
      const n = await this.redis.incr(k);
      if (n != null) {
        if (n === 1) await this.redis.expire(k, windowSec);
        return n <= limit;
      }
    }
    const now = Date.now();
    this.prune(now);
    let bucket = this.quotas.get(k);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowSec * 1000, limit };
      this.quotas.set(k, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  /** {@link takeQuota} that answers 429 when exhausted. */
  async assertQuota(key: string, limit: number, windowSec: number) {
    if (!(await this.takeQuota(key, limit, windowSec))) {
      throw new HttpException('Too many requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordSuccess(req: Request, email: string) {
    const ip = this.clientIp(req);
    if (this.redis.isReady) {
      await this.redis.del(this.redisEmailIpKey(ip, email));
    }
    this.byEmailIp.delete(this.emailIpKey(ip, email));
  }

  private redisIpKey(ip: string) {
    return `loginrl:${ip}`;
  }

  private redisEmailIpKey(ip: string, email: string) {
    return `loginrl:${ip}|${email.trim().toLowerCase()}`;
  }

  private emailIpKey(ip: string, email: string) {
    return `${ip}|${email.trim().toLowerCase()}`;
  }

  private isLocked(bucket: Bucket | undefined, now: number) {
    return !!bucket && now < bucket.resetAt && bucket.count >= bucket.limit;
  }

  private bump(
    map: Map<string, Bucket>,
    key: string,
    now: number,
    limit: number,
  ) {
    let bucket = map.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + FAIL_WINDOW_MS, limit };
      map.set(key, bucket);
    }
    bucket.count += 1;
  }

  private prune(now: number) {
    if (this.byEmailIp.size + this.byIp.size + this.quotas.size < 2000) return;
    for (const [k, b] of this.quotas) {
      if (now >= b.resetAt) this.quotas.delete(k);
    }
    for (const [k, b] of this.byEmailIp) {
      if (now >= b.resetAt) this.byEmailIp.delete(k);
    }
    for (const [k, b] of this.byIp) {
      if (now >= b.resetAt) this.byIp.delete(k);
    }
  }

  private locked() {
    return new HttpException(
      'Too many login attempts. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
