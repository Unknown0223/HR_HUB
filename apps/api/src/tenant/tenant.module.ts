import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class TenantModule {}
