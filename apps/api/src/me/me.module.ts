import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { HrModule } from '../hr/hr.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { PunchVideoController } from './punch-video.controller';
import { PunchVideoService } from './punch-video.service';

@Module({
  imports: [AccessModule, AttendanceModule, HrModule, NotificationsModule, StorageModule],
  controllers: [MeController, PunchVideoController],
  providers: [MeService, PunchVideoService],
  exports: [MeService],
})
export class MeModule {}
