import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { StorageModule } from '../storage/storage.module';
import { TrackingModule } from '../tracking/tracking.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [MeModule, StorageModule, TrackingModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
