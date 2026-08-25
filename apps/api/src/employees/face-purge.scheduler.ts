import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FaceService } from './face.service';

/**
 * Daily soft-purge of face photos for dismissed employees older than FACE_PURGE_DAYS.
 * Disabled when FACE_PURGE_DAYS is unset, 0, or negative (lab/demo default).
 */
@Injectable()
export class FacePurgeScheduler {
  private readonly logger = new Logger(FacePurgeScheduler.name);

  constructor(
    private readonly face: FaceService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    const days = this.resolveDays();
    if (days === null) {
      this.logger.debug('Face purge skipped — FACE_PURGE_DAYS not set or ≤0');
      return;
    }
    await this.face.purgeDismissedFaces(days);
  }

  /** Manual / ops trigger (same env rules as cron). */
  async runOnce() {
    const days = this.resolveDays();
    if (days === null) {
      return {
        skipped: true,
        reason: 'Set FACE_PURGE_DAYS≥1 to enable',
        candidates: 0,
        purged: 0,
        errors: 0,
        days: 0,
      };
    }
    const result = await this.face.purgeDismissedFaces(days);
    return { skipped: false, reason: null, ...result };
  }

  private resolveDays(): number | null {
    const raw = (this.config.get<string>('FACE_PURGE_DAYS') ?? '').trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.floor(n);
  }
}
