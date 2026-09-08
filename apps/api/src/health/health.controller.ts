import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../auth/decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    let redis: 'up' | 'down' | 'disabled' = 'disabled';
    if (this.redis.isReady) {
      redis = (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      service: 'hr-hub-api',
      db,
      redis,
      timestamp: new Date().toISOString(),
    };
  }
}
