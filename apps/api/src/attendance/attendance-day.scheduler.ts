import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceService } from './attendance.service';

/** Close yesterday's timesheet at 23:59+ and refresh today after schedule end. */
@Injectable()
export class AttendanceDayScheduler {
  private readonly logger = new Logger(AttendanceDayScheduler.name);

  constructor(private readonly attendance: AttendanceService) {}

  @Cron('5 0 * * *')
  async afterMidnight() {
    const res = await this.attendance.finalizeOpenDays(new Date());
    this.logger.log(`attendance day finalize midnight tenants=${res.tenants}`);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async duringDay() {
    const res = await this.attendance.finalizeOpenDays(new Date());
    this.logger.debug(`attendance day finalize tick tenants=${res.tenants}`);
  }
}
