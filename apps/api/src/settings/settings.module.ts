import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { DocumentExpiryNotifyScheduler } from './document-expiry-notify.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SettingsController],
  providers: [SettingsService, DocumentExpiryNotifyScheduler],
  exports: [SettingsService],
})
export class SettingsModule {}
