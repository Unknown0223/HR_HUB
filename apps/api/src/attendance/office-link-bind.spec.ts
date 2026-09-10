import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoreZip,
  decodeConnectionHrhub,
  encodeConnectionHrhub,
  injectBoundConfigIntoPortableZip,
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

  it('injects bound config into portable zip (root + ilova)', async () => {
    const JSZip = (await import('jszip')).default;
    const base = new JSZip();
    base.file('BOSHLASH.bat', '@echo off\n');
    base.file('config.json', '{"apiUrl":"old"}');
    base.file('ilova/HRHUB-Qurilma.exe', Buffer.from('MZ-fake'));
    const baseBuf = Buffer.from(
      await base.generateAsync({ type: 'nodebuffer', compression: 'STORE' }),
    );
    const out = await injectBoundConfigIntoPortableZip(baseBuf, {
      configJson: '{"apiUrl":"https://api.example.com","tenantCode":"demo"}\n',
      connectionHrhub: 'token-abc\n',
      readme: 'bound readme\n',
    });
    const loaded = await JSZip.loadAsync(out);
    assert.equal(
      await loaded.file('config.json')!.async('string'),
      '{"apiUrl":"https://api.example.com","tenantCode":"demo"}\n',
    );
    assert.equal(await loaded.file('connection.hrhub')!.async('string'), 'token-abc\n');
    assert.equal(
      await loaded.file('ilova/config.json')!.async('string'),
      '{"apiUrl":"https://api.example.com","tenantCode":"demo"}\n',
    );
    assert.equal(
      await loaded.file('ilova/connection.hrhub')!.async('string'),
      'token-abc\n',
    );
    assert.ok(loaded.file('ilova/HRHUB-Qurilma.exe'));
  });

  it('injects into Windows-style zip paths (backslash)', async () => {
    const JSZip = (await import('jszip')).default;
    const base = new JSZip();
    base.file('BOSHLASH.bat', '@echo off\n');
    base.file('config.json', '{"apiUrl":"old"}');
    base.file('ilova\\_internal\\config.json', '{"pyinstaller":true}');
    base.file('ilova\\HRHUB-Qurilma.exe', Buffer.from('MZ-fake'));
    const baseBuf = Buffer.from(
      await base.generateAsync({ type: 'nodebuffer', compression: 'STORE' }),
    );
    const out = await injectBoundConfigIntoPortableZip(baseBuf, {
      configJson: '{"tenantCode":"demo"}\n',
      connectionHrhub: 'tok\n',
      readme: 'r\n',
    });
    const loaded = await JSZip.loadAsync(out);
    const names = Object.keys(loaded.files);
    assert.ok(names.includes('config.json'));
    assert.ok(names.includes('connection.hrhub'));
    assert.ok(
      names.includes('ilova\\config.json') || names.includes('ilova/config.json'),
    );
    assert.ok(
      names.includes('ilova\\connection.hrhub') ||
        names.includes('ilova/connection.hrhub'),
    );
    // Must not overwrite PyInstaller internal config as package root
    assert.equal(
      await loaded.file('ilova\\_internal\\config.json')!.async('string'),
      '{"pyinstaller":true}',
    );
  });
});
