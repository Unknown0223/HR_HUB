import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeFormController } from './employee-form.controller';
import { EmployeeFormIngestGuard } from './employee-form-ingest.guard';
import { FaceService } from './face.service';
import { FacePurgeScheduler } from './face-purge.scheduler';
import { StorageModule } from '../storage/storage.module';
import { DeviceGwModule } from '../device-gw/device-gw.module';

@Module({
  imports: [StorageModule, DeviceGwModule],
  controllers: [EmployeesController, EmployeeFormController],
  providers: [
    EmployeesService,
    FaceService,
    FacePurgeScheduler,
    EmployeeFormIngestGuard,
  ],
  exports: [EmployeesService, FaceService, FacePurgeScheduler],
})
export class EmployeesModule {}
