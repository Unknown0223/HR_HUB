import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHikPushHostConfig,
  parseHikvisionEventBody,
} from './hikvision-event.parser';

describe('hikvision-event.parser', () => {
  it('parses AccessControllerEvent JSON', () => {
    const punches = parseHikvisionEventBody({
      dateTime: '2026-09-14T10:00:00+05:00',
      AccessControllerEvent: {
        employeeNoString: '0003',
        majorEventType: 5,
        subEventType: 75,
        attendanceStatus: 'checkIn',
      },
    });
    assert.equal(punches.length, 1);
    assert.equal(punches[0].employeeExternalId, '0003');
    assert.equal(punches[0].direction, 'IN');
  });

  it('parses XML employeeNo', () => {
    const xml = `<?xml version="1.0"?>
<EventNotificationAlert>
  <dateTime>2026-09-14T11:00:00</dateTime>
  <employeeNoString>42</employeeNoString>
  <attendanceStatus>checkOut</attendanceStatus>
</EventNotificationAlert>`;
    const punches = parseHikvisionEventBody(xml, 'application/xml');
    assert.equal(punches.length, 1);
    assert.equal(punches[0].employeeExternalId, '42');
    assert.equal(punches[0].direction, 'OUT');
  });

  it('builds HTTPS host config', () => {
    const cfg = buildHikPushHostConfig(
      'https://hr-hubapi-production.up.railway.app',
      'abc123token',
    );
    assert.equal(cfg.hostName, 'hr-hubapi-production.up.railway.app');
    assert.equal(cfg.portNo, 443);
    assert.ok(cfg.urlPath.includes('/api/attendance/hikvision/events/abc123token'));
  });
});
