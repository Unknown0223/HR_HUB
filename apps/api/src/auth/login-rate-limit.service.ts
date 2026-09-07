import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL_IP = 5;
const MAX_FAILS_PER_IP = 25;

type Bucket = { count: number; resetAt: number; limit: number };

/**
 * Failed-login limiter. Successful logins clear the email+IP bucket.
 * Per email+IP (and a higher per-IP cap) so an office NAT is not locked out.
 */
@Injectable()
export class LoginRateLimitService {
  private readonly byEmailIp = new Map<string, Bucket>();
  private readonly byIp = new Map<string, Bucket>();

  clientIp(req: Request): string {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      ?.trim();
    return forwarded || req.ip || req.socket.remoteAddress || 'unknown';
  }

  assertAllowed(req: Request, email: string) {
    const ip = this.clientIp(req);
    const now = Date.now();
    this.prune(now);
    if (this.isLocked(this.byEmailIp.get(this.emailIpKey(ip, email)), now)) {
      throw this.locked();
    }
    if (this.isLocked(this.byIp.get(ip), now)) {
      throw this.locked();
    }
  }

  recordFailure(req: Request, email: string) {
    const ip = this.clientIp(req);
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

  recordSuccess(req: Request, email: string) {
    this.byEmailIp.delete(this.emailIpKey(this.clientIp(req), email));
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
    if (this.byEmailIp.size + this.byIp.size < 2000) return;
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
