import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdvanceRequestsController, MeAdvancesController } from './advances.controller';
import { AdvancesService } from './advances.service';

@Module({
  imports: [MeModule, NotificationsModule],
  controllers: [AdvanceRequestsController, MeAdvancesController],
  providers: [AdvancesService],
})
export class AdvancesModule {}
