import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { HrModule } from '../hr/hr.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [AttendanceModule, HrModule, NotificationsModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
