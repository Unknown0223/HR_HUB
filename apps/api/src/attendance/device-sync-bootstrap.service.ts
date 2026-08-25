import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceGwClient } from '../device-gw/device-gw.client';

/** Re-register active Nest devices into device-gw after GW/API restart. */
@Injectable()
export class DeviceSyncBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DeviceSyncBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gw: DeviceGwClient,
  ) {}

  async onModuleInit() {
    // Delay slightly so GW may come up with API
    setTimeout(() => {
      void this.registerAll();
    }, 1500);
  }

  async registerAll() {
    const health = await this.gw.health();
    if (!health.ok) {
      this.logger.warn('Device GW offline — skip bootstrap register');
      return;
    }

    const devices = await this.prisma.device.findMany({
      where: { isActive: true },
    });

    let ok = 0;
    for (const d of devices) {
      const reg = await this.gw.registerFromDevice(d);
      if (reg?.id) {
        await this.prisma.device.update({
          where: { id: d.id },
          data: {
            gatewayRef: reg.id,
            status: reg.status || 'online',
            lastSeenAt: new Date(),
          },
        });
        ok += 1;
      }
    }
    this.logger.log(`Device GW bootstrap: registered ${ok}/${devices.length}`);
  }
}
