import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoreZip,
  decodeConnectionHrhub,
  encodeConnectionHrhub,
  signOfficeLinkBind,
  verifyOfficeLinkBind,
} from './office-link-bind';

describe('office-link-bind', () => {
  it('signs and verifies bind payload', () => {
    const payload = {
      v: 1 as const,
      apiUrl: 'https://api.example.com',
      webUrl: 'https://web.example.com',
      tenantCode: 'acme',
      tenantName: 'Acme LLC',
      issuedAt: '2026-09-10T00:00:00.000Z',
      installerUrl: 'https://cdn.example.com/link.zip',
      version: '1.2.0',
    };
    const file = signOfficeLinkBind(payload, 'test-secret-min-32-chars!!!!!!!!');
    assert.equal(verifyOfficeLinkBind(file, 'test-secret-min-32-chars!!!!!!!!'), true);
    assert.equal(verifyOfficeLinkBind(file, 'wrong-secret'), false);
    const encoded = encodeConnectionHrhub(file);
    const decoded = decodeConnectionHrhub(encoded);
    assert.ok(decoded);
    assert.equal(decoded!.payload.tenantCode, 'acme');
    assert.equal(
      verifyOfficeLinkBind(decoded!, 'test-secret-min-32-chars!!!!!!!!'),
      true,
    );
  });

  it('builds a readable store zip', () => {
    const zip = buildStoreZip([
      { name: 'config.json', content: '{"ok":true}' },
      { name: 'OQISH.txt', content: 'hello' },
    ]);
    assert.ok(zip.length > 40);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
  });
});
