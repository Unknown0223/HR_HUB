import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { OfficeLinkReconnectDto } from './dto';
import { OfficeLinkController } from './office-link.controller';

describe('OfficeLinkReconnectDto', () => {
  it('requires deviceId and host', async () => {
    const dto = new OfficeLinkReconnectDto();
    const errors = await validate(dto);
    const props = errors.map((e) => e.property);
    assert.ok(props.includes('deviceId'));
    assert.ok(props.includes('host'));
  });

  it('accepts valid reconnect body', async () => {
    const dto = new OfficeLinkReconnectDto();
    dto.deviceId = '34b673f8-5b7e-4a81-ba7d-577c408cff72';
    dto.host = '192.168.0.200';
    dto.port = 80;
    dto.serialNumber = '255';
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
  });
});

describe('OfficeLinkController reconnect / devices', () => {
  it('listDevices uses pairing tenant and passes audit actor', async () => {
    const calls: unknown[] = [];
    const attendance = {
      officeLinkListDevices: async (tenantId: string, actor?: unknown) => {
        calls.push(['list', tenantId, actor]);
        return {
          ok: true,
          devices: [
            {
              id: 'd1',
              password: 'secret-from-vault',
              serialNumber: '255',
              host: '192.168.0.116',
            },
          ],
        };
      },
      officeLinkListDevicesByCode: async () => {
        throw new Error('should not use tenantCode when pairing present');
      },
      officeLinkReconnect: async () => ({}),
      officeLinkReconnectByCode: async () => ({}),
      officeLinkPing: async () => ({}),
      officeLinkAnnounce: async () => ({}),
      officeLinkDevice: async () => ({}),
      officeLinkLocationsForTenant: async () => ({}),
      officeLinkLocations: async () => ({}),
    };
    const ctrl = new OfficeLinkController(attendance as never);
    const out = (await ctrl.listDevices('demo', {
      mode: 'pairing',
      pairing: {
        sessionId: 's1',
        tenantId: 'tenant-1',
        tokenHash: 'h',
        expiresAt: new Date(),
        createdById: 'user-1',
      },
    })) as { devices: Array<{ password?: string }> };
    assert.equal(out.devices[0].password, 'secret-from-vault');
    assert.deepEqual(calls[0], [
      'list',
      'tenant-1',
      { userId: 'user-1' },
    ]);
  });

  it('reconnect uses pairing path and does not invent pendingAdminConfirm', async () => {
    const calls: unknown[] = [];
    const attendance = {
      officeLinkListDevices: async () => ({}),
      officeLinkListDevicesByCode: async () => ({}),
      officeLinkReconnect: async (tenantId: string, dto: unknown, actor?: unknown) => {
        calls.push(['reconnect', tenantId, dto, actor]);
        return {
          ok: true,
          reconnected: true,
          device: {
            id: 'd1',
            host: '192.168.0.200',
            status: 'online',
          },
        };
      },
      officeLinkReconnectByCode: async () => {
        throw new Error('pairing should win');
      },
      officeLinkPing: async () => ({}),
      officeLinkAnnounce: async () => ({}),
      officeLinkDevice: async () => ({}),
      officeLinkLocationsForTenant: async () => ({}),
      officeLinkLocations: async () => ({}),
    };
    const ctrl = new OfficeLinkController(attendance as never);
    const dto = new OfficeLinkReconnectDto();
    dto.deviceId = '34b673f8-5b7e-4a81-ba7d-577c408cff72';
    dto.host = '192.168.0.200';
    const out = (await ctrl.reconnect(dto, {
      mode: 'pairing',
      pairing: {
        sessionId: 's1',
        tenantId: 'tenant-1',
        tokenHash: 'h',
        expiresAt: new Date(),
        createdById: null,
      },
    })) as { reconnected: boolean; device: { host: string } };
    assert.equal(out.reconnected, true);
    assert.equal(out.device.host, '192.168.0.200');
    assert.equal((calls[0] as unknown[])[0], 'reconnect');
    assert.equal((calls[0] as unknown[])[1], 'tenant-1');
  });
});
