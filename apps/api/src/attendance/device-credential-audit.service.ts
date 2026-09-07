import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export type DeviceCredentialAuditAction =
  | 'view'
  | 'change'
  | 'sync'
  | 'vault_write';

export type AuditActor = {
  userId?: string | null;
  ip?: string | null;
};

@Injectable()
export class DeviceCredentialAuditService {
  private readonly logger = new Logger(DeviceCredentialAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  static clientIp(req?: Request | null): string | null {
    if (!req) return null;
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      ?.trim();
    const ip = forwarded || req.ip || req.socket?.remoteAddress || '';
    return ip || null;
  }

  async record(
    tenantId: string,
    deviceId: string,
    action: DeviceCredentialAuditAction,
    actor?: AuditActor,
  ): Promise<void> {
    try {
      await this.prisma.deviceCredentialAudit.create({
        data: {
          tenantId,
          deviceId,
          action,
          userId: actor?.userId ?? null,
          ip: actor?.ip ?? null,
        },
      });
    } catch (e) {
      // Never block password flows on audit failure
      this.logger.warn(
        `credential audit ${action} failed for ${deviceId}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  async listForDevice(
    tenantId: string,
    deviceId: string,
    limit = 50,
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.deviceCredentialAudit.findMany({
      where: { tenantId, deviceId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        userId: true,
        ip: true,
        createdAt: true,
      },
    });
  }
}
