import { Module } from '@nestjs/common';
import { DeviceGwClient } from './device-gw.client';

@Module({
  providers: [DeviceGwClient],
  exports: [DeviceGwClient],
})
export class DeviceGwModule {}
