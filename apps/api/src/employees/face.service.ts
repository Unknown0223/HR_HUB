import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FaceSyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DeviceGwClient } from '../device-gw/device-gw.client';

@Injectable()
export class FaceService {
  private readonly logger = new Logger(FaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly gw: DeviceGwClient,
  ) {}

  async uploadFace(
    tenantId: string,
    employeeId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Photo file required');
    }
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const ext = (file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const key = `faces/${tenantId}/${employeeId}/${Date.now()}.${ext}`;
    const { url, key: storedKey } = await this.storage.putObject(
      key,
      file.buffer,
      file.mimetype,
    );

    const profile = await this.prisma.faceProfile.upsert({
      where: { employeeId },
      create: {
        tenantId,
        employeeId,
        photoUrl: url,
        photoKey: storedKey,
        contentType: file.mimetype,
        syncStatus: FaceSyncStatus.pending,
        lastError: null,
      },
      update: {
        photoUrl: url,
        photoKey: storedKey,
        contentType: file.mimetype,
        syncStatus: FaceSyncStatus.pending,
        lastError: null,
      },
    });

    return profile;
  }

  async syncToDevices(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { faceProfile: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (!emp.externalId) {
      throw new BadRequestException(
        'Employee externalId (Face ID / employeeNo) required',
      );
    }
    if (!emp.faceProfile?.photoUrl && !emp.faceProfile?.photoKey) {
      throw new BadRequestException('Upload face photo first');
    }

    const faceB64 = await this.resolveFaceBase64(emp.faceProfile);
    if (!faceB64) {
      throw new BadRequestException('Could not read face image');
    }

    await this.prisma.faceProfile.update({
      where: { employeeId },
      data: { syncStatus: FaceSyncStatus.syncing, lastError: null },
    });

    const allDevices = await this.prisma.device.findMany({
      where: { tenantId, isActive: true },
    });
    const hasReal = allDevices.some((d) => (d.adapterType || 'mock') !== 'mock');
    const devices = hasReal
      ? allDevices.filter((d) => (d.adapterType || 'mock') !== 'mock')
      : allDevices;

    if (devices.length === 0) {
      await this.prisma.faceProfile.update({
        where: { employeeId },
        data: {
          syncStatus: FaceSyncStatus.failed,
          lastError: 'No active devices',
        },
      });
      throw new BadRequestException('No active devices to sync');
    }

    const name = `${emp.lastName} ${emp.firstName}`.trim();
    const results: {
      deviceId: string;
      name: string;
      ok: boolean;
      error?: string;
    }[] = [];

    for (const device of devices) {
      let gatewayRef = device.gatewayRef;

      const ensureRegistered = async () => {
        const reg = await this.gw.registerFromDevice(device);
        if (reg?.id) {
          gatewayRef = reg.id;
          await this.prisma.device.update({
            where: { id: device.id },
            data: { gatewayRef, status: reg.status || 'online' },
          });
          return true;
        }
        return false;
      };

      if (!gatewayRef) {
        const okReg = await ensureRegistered();
        if (!okReg) {
          results.push({
            deviceId: device.id,
            name: device.name,
            ok: false,
            error: 'Device gateway not registered',
          });
          await this.upsertDeviceSync(
            tenantId,
            device.id,
            emp.faceProfile!.id,
            employeeId,
            FaceSyncStatus.failed,
            'Device gateway not registered',
          );
          continue;
        }
      }

      try {
        const res = await this.gw.syncFace(gatewayRef!, {
          employee_external_id: emp.externalId,
          employee_name: name,
          face_image_base64: faceB64,
        });
        const ok = Boolean(res.synced && res.face_enrolled);
        results.push({
          deviceId: device.id,
          name: device.name,
          ok,
          error: ok ? undefined : 'Adapter returned face_enrolled=false',
        });
        await this.upsertDeviceSync(
          tenantId,
          device.id,
          emp.faceProfile!.id,
          employeeId,
          ok ? FaceSyncStatus.synced : FaceSyncStatus.failed,
          ok ? null : 'Adapter returned face_enrolled=false',
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Stale gatewayRef after GW restart — re-register and retry once
        if (msg.includes('404') || msg.includes('not found')) {
          const okReg = await ensureRegistered();
          if (okReg && gatewayRef) {
            try {
              const res = await this.gw.syncFace(gatewayRef, {
                employee_external_id: emp.externalId,
                employee_name: name,
                face_image_base64: faceB64,
              });
              const ok = Boolean(res.synced && res.face_enrolled);
              results.push({
                deviceId: device.id,
                name: device.name,
                ok,
                error: ok ? undefined : 'Adapter returned face_enrolled=false',
              });
              await this.upsertDeviceSync(
                tenantId,
                device.id,
                emp.faceProfile!.id,
                employeeId,
                ok ? FaceSyncStatus.synced : FaceSyncStatus.failed,
                ok ? null : 'Adapter returned face_enrolled=false',
              );
              continue;
            } catch (e2) {
              const msg2 = e2 instanceof Error ? e2.message : String(e2);
              this.logger.warn(`Face sync retry failed device=${device.id}: ${msg2}`);
              results.push({
                deviceId: device.id,
                name: device.name,
                ok: false,
                error: msg2,
              });
              await this.upsertDeviceSync(
                tenantId,
                device.id,
                emp.faceProfile!.id,
                employeeId,
                FaceSyncStatus.failed,
                msg2,
              );
              continue;
            }
          }
        }
        this.logger.warn(`Face sync failed device=${device.id}: ${msg}`);
        results.push({
          deviceId: device.id,
          name: device.name,
          ok: false,
          error: msg,
        });
        await this.upsertDeviceSync(
          tenantId,
          device.id,
          emp.faceProfile!.id,
          employeeId,
          FaceSyncStatus.failed,
          msg,
        );
      }
    }

    const allOk = results.length > 0 && results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);
    const profile = await this.prisma.faceProfile.update({
      where: { employeeId },
      data: {
        syncStatus: allOk ? FaceSyncStatus.synced : FaceSyncStatus.failed,
        lastSyncedAt: anyOk ? new Date() : undefined,
        lastError: allOk
          ? null
          : results
              .filter((r) => !r.ok)
              .map((r) => `${r.name}: ${r.error}`)
              .join('; ')
              .slice(0, 1000),
      },
      include: { deviceSyncs: { include: { device: { select: { id: true, name: true } } } } },
    });

    return { profile, results };
  }

  async getFaceStatus(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: {
        faceProfile: {
          include: {
            deviceSyncs: {
              include: { device: { select: { id: true, name: true, serialNumber: true } } },
            },
          },
        },
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp.faceProfile;
  }

  async clearFace(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { faceProfile: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (!emp.faceProfile) return { ok: true };
    if (emp.faceProfile.photoKey) {
      await this.storage.deleteObject(emp.faceProfile.photoKey);
    }
    await this.prisma.faceProfile.update({
      where: { id: emp.faceProfile.id },
      data: {
        photoUrl: null,
        photoKey: null,
        contentType: null,
        syncStatus: FaceSyncStatus.pending,
        lastError: null,
      },
    });
    return { ok: true };
  }

  /**
   * Soft-purge face photos for employees dismissed ≥ `days` ago.
   * Clears MinIO object + FaceProfile photo fields; writes audit_logs entry.
   * Does not remove the FaceProfile row or device sync history.
   */
  async purgeDismissedFaces(days: number): Promise<{
    candidates: number;
    purged: number;
    errors: number;
    days: number;
  }> {
    if (!Number.isFinite(days) || days < 1) {
      return { candidates: 0, purged: 0, errors: 0, days };
    }
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);

    const profiles = await this.prisma.faceProfile.findMany({
      where: {
        OR: [{ photoKey: { not: null } }, { photoUrl: { not: null } }],
        employee: {
          status: 'dismissed',
          dismissedAt: { lte: cutoff },
        },
      },
      include: {
        employee: { select: { id: true, tenantId: true, dismissedAt: true } },
      },
      take: 500,
    });

    let purged = 0;
    let errors = 0;
    const byTenant = new Map<string, string[]>();

    for (const profile of profiles) {
      try {
        if (profile.photoKey) {
          await this.storage.deleteObject(profile.photoKey);
        }
        await this.prisma.faceProfile.update({
          where: { id: profile.id },
          data: {
            photoKey: null,
            photoUrl: null,
            contentType: null,
            syncStatus: FaceSyncStatus.pending,
            lastError: `purged by retention (${days}d after dismiss)`,
            lastSyncedAt: null,
          },
        });
        const tid = profile.employee.tenantId;
        const list = byTenant.get(tid) ?? [];
        list.push(profile.employeeId);
        byTenant.set(tid, list);
        purged += 1;
      } catch (e) {
        errors += 1;
        this.logger.warn(
          `Face purge failed employee=${profile.employeeId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    for (const [tenantId, employeeIds] of byTenant) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'face.retention_purge',
          entity: 'FaceProfile',
          meta: {
            days,
            cutoff: cutoff.toISOString().slice(0, 10),
            count: employeeIds.length,
            employeeIds: employeeIds.slice(0, 100),
          },
        },
      });
    }

    if (purged || errors) {
      this.logger.log(
        `Face retention purge: candidates=${profiles.length} purged=${purged} errors=${errors} days=${days}`,
      );
    }

    return { candidates: profiles.length, purged, errors, days };
  }

  private async resolveFaceBase64(profile: {
    photoKey: string | null;
    photoUrl: string | null;
  }): Promise<string | null> {
    if (profile.photoUrl?.startsWith('data:')) {
      const idx = profile.photoUrl.indexOf('base64,');
      return idx >= 0 ? profile.photoUrl.slice(idx + 7) : null;
    }
    if (profile.photoKey) {
      const buf = await this.storage.getObjectBuffer(profile.photoKey);
      if (buf) return buf.toString('base64');
    }
    if (profile.photoUrl?.startsWith('http')) {
      try {
        const res = await fetch(profile.photoUrl);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return Buffer.from(ab).toString('base64');
      } catch {
        return null;
      }
    }
    return null;
  }

  private upsertDeviceSync(
    tenantId: string,
    deviceId: string,
    faceProfileId: string,
    employeeId: string,
    syncStatus: FaceSyncStatus,
    lastError: string | null,
  ) {
    return this.prisma.deviceFaceSync.upsert({
      where: {
        deviceId_faceProfileId: { deviceId, faceProfileId },
      },
      create: {
        tenantId,
        deviceId,
        faceProfileId,
        employeeId,
        syncStatus,
        lastError,
        lastSyncedAt: syncStatus === FaceSyncStatus.synced ? new Date() : null,
      },
      update: {
        syncStatus,
        lastError,
        lastSyncedAt: syncStatus === FaceSyncStatus.synced ? new Date() : undefined,
      },
    });
  }
}
