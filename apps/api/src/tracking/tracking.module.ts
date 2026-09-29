import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TrackPathService } from './track-path.service';

@Module({
  imports: [MeModule, NotificationsModule, StorageModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackPathService],
  exports: [TrackingService],
})
export class TrackingModule {}
