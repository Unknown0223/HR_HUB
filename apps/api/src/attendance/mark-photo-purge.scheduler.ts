import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';

/**
 * Daily purge of punch capture photos past tenant markPhotos retention
 * (приход / уход / отметка — separate cutoffs).
 */
@Injectable()
export class MarkPhotoPurgeScheduler {
  private readonly logger = new Logger(MarkPhotoPurgeScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCron() {
    const result = await this.runOnce();
    if (result.tenants === 0) {
      this.logger.debug('Mark photo purge: no tenants');
      return;
    }
    this.logger.log(
      `Mark photo purge done tenants=${result.tenants} scanned=${result.scanned} purged=${result.purged} errors=${result.errors}`,
    );
  }

  async runOnce() {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
      take: 500,
    });
    let scanned = 0;
    let purged = 0;
    let errors = 0;
    for (const t of tenants) {
      try {
        const disabled = await this.attendance.purgeDisabledEstimatedOutPhotos(
          t.id,
        );
        purged += disabled.purged;
        scanned += disabled.scanned;
        errors += disabled.errors;
        const r = await this.attendance.purgeExpiredMarkPhotos(t.id);
        scanned += r.scanned;
        purged += r.purged;
        errors += r.errors;
      } catch (e) {
        errors += 1;
        this.logger.warn(
          `Mark photo purge tenant=${t.id}: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }
    return { tenants: tenants.length, scanned, purged, errors };
  }
}
