import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceGwClient } from '../device-gw/device-gw.client';

/**
 * Re-register active Nest devices into device-gw after GW/API restart.
 *
 * Persistence model (Faza 2.4): PostgreSQL devices + this bootstrap is the
 * source of truth. Redis registry is optional later — API start re-hydrates GW.
 */
@Injectable()
export class DeviceSyncBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DeviceSyncBootstrapService.name);
  private readonly maxAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gw: DeviceGwClient,
  ) {}

  async onModuleInit() {
    // Delay slightly so GW may come up with API
    setTimeout(() => {
      void this.registerAll(1);
    }, 1500);
  }

  async registerAll(attempt = 1) {
    const health = await this.gw.health();
    if (!health.ok) {
      if (attempt < this.maxAttempts) {
        const delayMs = Math.min(30_000, 2000 * attempt);
        this.logger.warn(
          `Device GW offline — bootstrap retry ${attempt}/${this.maxAttempts} in ${delayMs}ms`,
        );
        setTimeout(() => {
          void this.registerAll(attempt + 1);
        }, delayMs);
        return;
      }
      this.logger.error(
        `Device GW offline — bootstrap gave up after ${this.maxAttempts} attempts ` +
          '(API re-register on start = persistence; Redis optional later)',
      );
      return;
    }

    const devices = await this.prisma.device.findMany({
      where: { isActive: true },
    });

    let ok = 0;
    let fail = 0;
    for (const d of devices) {
      try {
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
        } else {
          fail += 1;
          this.logger.warn(
            `Device GW bootstrap: no id returned for device ${d.id} (${d.serialNumber})`,
          );
        }
      } catch (e) {
        fail += 1;
        this.logger.warn(
          `Device GW bootstrap: register failed for ${d.id}: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }
    this.logger.log(
      `Device GW bootstrap: registered ${ok}/${devices.length}` +
        (fail ? ` (failed ${fail})` : '') +
        (attempt > 1 ? ` after attempt ${attempt}` : ''),
    );
  }
}
