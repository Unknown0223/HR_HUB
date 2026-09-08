import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceGwClient } from '../device-gw/device-gw.client';

/**
 * Re-register active Nest devices into device-gw after GW/API restart.
 *
 * Persistence model: PostgreSQL devices + this bootstrap is the source of
 * truth. API start re-hydrates GW in parallel batches.
 */
@Injectable()
export class DeviceSyncBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DeviceSyncBootstrapService.name);
  private readonly maxAttempts = 5;
  private readonly concurrency = 4;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gw: DeviceGwClient,
  ) {}

  async onModuleInit() {
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
        `Device GW offline — bootstrap gave up after ${this.maxAttempts} attempts`,
      );
      return;
    }

    const devices = await this.prisma.device.findMany({
      where: { isActive: true },
    });

    let ok = 0;
    let fail = 0;
    let skipped = 0;

    for (let i = 0; i < devices.length; i += this.concurrency) {
      const batch = devices.slice(i, i + this.concurrency);
      const results = await Promise.all(
        batch.map(async (d) => {
          // Skip devices already online with a gateway ref — avoid tunnel spam.
          if (d.status === 'online' && d.gatewayRef) {
            return 'skipped' as const;
          }
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
              return 'ok' as const;
            }
            this.logger.warn(
              `Device GW bootstrap: no id returned for device ${d.id} (${d.serialNumber})`,
            );
            return 'fail' as const;
          } catch (e) {
            this.logger.warn(
              `Device GW bootstrap: register failed for ${d.id}: ${
                e instanceof Error ? e.message : e
              }`,
            );
            return 'fail' as const;
          }
        }),
      );
      for (const r of results) {
        if (r === 'ok') ok += 1;
        else if (r === 'fail') fail += 1;
        else skipped += 1;
      }
    }

    this.logger.log(
      `Device GW bootstrap: registered ${ok}/${devices.length}` +
        (skipped ? ` (skipped online ${skipped})` : '') +
        (fail ? ` (failed ${fail})` : '') +
        (attempt > 1 ? ` after attempt ${attempt}` : ''),
    );
  }
}
