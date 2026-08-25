import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { FaceService } from './face.service';
import { FacePurgeScheduler } from './face-purge.scheduler';
import { StorageModule } from '../storage/storage.module';
import { DeviceGwModule } from '../device-gw/device-gw.module';

@Module({
  imports: [StorageModule, DeviceGwModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, FaceService, FacePurgeScheduler],
  exports: [EmployeesService, FaceService, FacePurgeScheduler],
})
export class EmployeesModule {}
