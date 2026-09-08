import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin ioredis wrapper. When REDIS_URL is unset or connect fails, methods
 * no-op (return null / skip) so callers can fall back to in-memory behavior.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  get isReady(): boolean {
    return this.client != null;
  }

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      this.logger.warn('REDIS_URL not set — Redis disabled');
      return;
    }

    let client: Redis | null = null;
    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
      await client.connect();
      await client.ping();
      this.client = client;
      this.logger.log('Redis connected');
    } catch (e) {
      this.logger.warn(`Redis unavailable — continuing without cache: ${e}`);
      if (client) {
        try {
          client.disconnect();
        } catch {
          /* ignore */
        }
      }
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
    this.client = null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (e) {
      this.logger.warn(`Redis GET ${key} failed: ${e}`);
      return null;
    }
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (ttlSeconds != null && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (e) {
      this.logger.warn(`Redis SET ${key} failed: ${e}`);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (e) {
      this.logger.warn(`Redis DEL ${key} failed: ${e}`);
      return false;
    }
  }

  async incr(key: string): Promise<number | null> {
    if (!this.client) return null;
    try {
      return await this.client.incr(key);
    } catch (e) {
      this.logger.warn(`Redis INCR ${key} failed: ${e}`);
      return null;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.expire(key, ttlSeconds);
      return true;
    } catch (e) {
      this.logger.warn(`Redis EXPIRE ${key} failed: ${e}`);
      return false;
    }
  }

  async ping(): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.ping();
    } catch (e) {
      this.logger.warn(`Redis PING failed: ${e}`);
      return null;
    }
  }
}
