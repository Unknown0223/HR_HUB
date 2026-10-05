import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { FaceModule } from '../face/face.module';
import { MeModule } from '../me/me.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { TrackingModule } from '../tracking/tracking.module';
import { TeamController } from './team.controller';
import { TeamKioskService } from './team-kiosk.service';
import { TeamService } from './team.service';

@Module({
  imports: [MeModule, StorageModule, TrackingModule, AttendanceModule, FaceModule, NotificationsModule],
  controllers: [TeamController],
  providers: [TeamService, TeamKioskService],
})
export class TeamModule {}
