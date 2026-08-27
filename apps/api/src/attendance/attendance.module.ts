import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { OfficeLinkController } from './office-link.controller';
import { AttendanceService } from './attendance.service';
import { PunchConsumerService } from './punch-consumer.service';
import { DeviceSyncBootstrapService } from './device-sync-bootstrap.service';
import { PunchIngestGuard } from './punch-ingest.guard';
import { PunchRateLimitGuard } from './punch-rate-limit.guard';
import { DeviceLinkGuard } from './device-link.guard';
import { AttendanceDayScheduler } from './attendance-day.scheduler';
import { DeviceGwModule } from '../device-gw/device-gw.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [DeviceGwModule, StorageModule],
  controllers: [AttendanceController, OfficeLinkController],
  providers: [
    AttendanceService,
    PunchConsumerService,
    DeviceSyncBootstrapService,
    PunchIngestGuard,
    PunchRateLimitGuard,
    DeviceLinkGuard,
    AttendanceDayScheduler,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
