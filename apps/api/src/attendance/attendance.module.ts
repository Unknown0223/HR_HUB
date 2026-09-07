import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { OfficeLinkController } from './office-link.controller';
import { OfficeLinkProvisionController } from './office-link-provision.controller';
import { AttendanceService } from './attendance.service';
import { PunchConsumerService } from './punch-consumer.service';
import { DeviceSyncBootstrapService } from './device-sync-bootstrap.service';
import { PunchIngestGuard } from './punch-ingest.guard';
import { PunchRateLimitGuard } from './punch-rate-limit.guard';
import { DeviceLinkGuard } from './device-link.guard';
import { OfficeLinkAuthGuard } from './office-link-auth.guard';
import { PairingTokenGuard } from './pairing-token.guard';
import { DeviceCredentialVaultService } from './device-credential-vault.service';
import { DeviceCredentialAuditService } from './device-credential-audit.service';
import { AttendanceDayScheduler } from './attendance-day.scheduler';
import { DeviceGwModule } from '../device-gw/device-gw.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [DeviceGwModule, StorageModule],
  controllers: [
    AttendanceController,
    OfficeLinkController,
    OfficeLinkProvisionController,
  ],
  providers: [
    AttendanceService,
    PunchConsumerService,
    DeviceSyncBootstrapService,
    PunchIngestGuard,
    PunchRateLimitGuard,
    DeviceLinkGuard,
    OfficeLinkAuthGuard,
    PairingTokenGuard,
    DeviceCredentialVaultService,
    DeviceCredentialAuditService,
    AttendanceDayScheduler,
  ],
  exports: [AttendanceService, DeviceCredentialVaultService],
})
export class AttendanceModule {}
