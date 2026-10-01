import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeFormController } from './employee-form.controller';
import { EmployeeFormIngestGuard } from './employee-form-ingest.guard';
import { FaceService } from './face.service';
import { FacePurgeScheduler } from './face-purge.scheduler';
import { StorageModule } from '../storage/storage.module';
import { DeviceGwModule } from '../device-gw/device-gw.module';
import { SettingsModule } from '../settings/settings.module';
import { MobileAccountsService } from './mobile-accounts.service';
import { MobileAccountsController } from './mobile-accounts.controller';

@Module({
  imports: [StorageModule, DeviceGwModule, SettingsModule],
  controllers: [EmployeesController, EmployeeFormController, MobileAccountsController],
  providers: [
    EmployeesService,
    MobileAccountsService,
    FaceService,
    FacePurgeScheduler,
    EmployeeFormIngestGuard,
  ],
  exports: [EmployeesService, FaceService, FacePurgeScheduler],
})
export class EmployeesModule {}
