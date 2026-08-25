import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, NatsConnection, StringCodec, Subscription } from 'nats';
import { PunchDirection } from '@prisma/client';
import { AttendanceService } from './attendance.service';

const SUBJECT = 'hrhub.punch.raw';

@Injectable()
export class PunchConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PunchConsumerService.name);
  private nc: NatsConnection | null = null;
  private sub: Subscription | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly attendance: AttendanceService,
  ) {}

  async onModuleInit() {
    const url = this.config.get<string>('NATS_URL') || 'nats://127.0.0.1:4222';
    try {
      this.nc = await connect({ servers: url });
      const sc = StringCodec();
      this.sub = this.nc.subscribe(SUBJECT);
      this.logger.log(`Subscribed to ${SUBJECT} @ ${url}`);
      (async () => {
        for await (const msg of this.sub!) {
          try {
            const raw = JSON.parse(sc.decode(msg.data));
            if (raw.type === 'heartbeat' || raw.source === 'device_heartbeat') {
              await this.attendance.recordDeviceHeartbeat({
                tenantId: raw.tenantId ?? raw.tenant_id,
                deviceId: raw.deviceId ?? raw.device_id,
                deviceNow: raw.deviceNow ?? raw.device_now,
                clockDriftSeconds: Number(raw.clockDriftSeconds ?? raw.clock_drift_seconds ?? 0),
                punchLocked: raw.punchLocked === true || raw.punch_locked === true,
                adminLoginDetected:
                  raw.adminLoginDetected === true || raw.admin_login_detected === true,
                adminLoginAt: raw.adminLoginAt ?? raw.admin_login_at ?? null,
                adminLoginSerial: Number(raw.adminLoginSerial ?? raw.admin_login_serial ?? 0),
                authFailed: raw.authFailed === true || raw.auth_failed === true,
              });
              continue;
            }
            // Accept both camelCase (Nest) and snake_case (device-gw PunchEvent)
            const tenantId = raw.tenantId ?? raw.tenant_id;
            const deviceId = raw.deviceId ?? raw.device_id;
            const employeeExternalId =
              raw.employeeExternalId ?? raw.employee_external_id;
            const employeeId = raw.employeeId ?? raw.employee_id;
            const occurredAt =
              raw.occurredAt ?? raw.occurred_at ?? new Date().toISOString();
            await this.attendance.ingestPunch({
              tenantId,
              deviceId,
              gatewayRef: deviceId,
              employeeExternalId,
              employeeId,
              direction: (raw.direction as PunchDirection) || PunchDirection.AUTO,
              occurredAt,
              source: raw.source || 'mock',
              photoBase64: raw.photoBase64 ?? raw.photo_base64,
              raw,
            });
          } catch (e) {
            this.logger.error(`Punch consume failed: ${e}`);
          }
        }
      })();
    } catch (e) {
      this.logger.warn(`NATS unavailable (${url}): ${e}. Punch consumer offline.`);
    }
  }

  async onModuleDestroy() {
    await this.sub?.drain();
    await this.nc?.drain();
  }
}
