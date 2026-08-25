import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { PunchConsumerService } from './punch-consumer.service';
import { DeviceSyncBootstrapService } from './device-sync-bootstrap.service';
import { PunchIngestGuard } from './punch-ingest.guard';
import { PunchRateLimitGuard } from './punch-rate-limit.guard';
import { AttendanceDayScheduler } from './attendance-day.scheduler';
import { DeviceGwModule } from '../device-gw/device-gw.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [DeviceGwModule, StorageModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    PunchConsumerService,
    DeviceSyncBootstrapService,
    PunchIngestGuard,
    PunchRateLimitGuard,
    AttendanceDayScheduler,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
