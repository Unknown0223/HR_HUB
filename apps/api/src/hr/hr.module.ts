import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { InternalTripsController } from './internal-trips.controller';
import { InternalTripsService } from './internal-trips.service';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [HrController, InternalTripsController],
  providers: [HrService, InternalTripsService],
  exports: [HrService, InternalTripsService],
})
export class HrModule {}
