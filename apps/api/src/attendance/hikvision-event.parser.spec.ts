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

  it('parses multipart JSON + JPEG into photoBase64', () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(3000, 0x41),
      Buffer.from([0xff, 0xd9]),
    ]);
    const boundary = 'MIME_boundary';
    const jsonPart =
      '{\n\t"dateTime":\t"2026-09-17T12:00:00+05:00",\n\t"AccessControllerEvent":\t{\n\t\t"employeeNoString":\t"3491884",\n\t\t"majorEventType":\t5,\n\t\t"subEventType":\t75,\n\t\t"attendanceStatus":\t"checkIn"\n\t}\n}';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonPart}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
      jpeg,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const punches = parseHikvisionEventBody(
      body,
      `multipart/form-data; boundary=${boundary}`,
    );
    assert.equal(punches.length, 1);
    assert.equal(punches[0].employeeExternalId, '3491884');
    assert.ok(punches[0].photoBase64);
    assert.ok(punches[0].photoBase64!.length > 100);
  });
});
