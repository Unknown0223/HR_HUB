#!/usr/bin/env node
/**
 * Phase 2 smoke — health, login, face sync, NATS punch → attendance mark.
 * Usage: node scripts/smoke-test.js
 * Requires: API :3001, device-gw :8000, infra (Postgres/NATS/MinIO)
 */
const API = process.env.API_URL || 'http://localhost:3001';
const GW = process.env.DEVICE_GW_URL || 'http://localhost:8000';

async function req(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${url} → ${res.status}: ${text}`);
  }
  return body;
}

function tinyJpeg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('1) Health');
  console.log('   ', await req(`${API}/api/health`));

  console.log('2) Login');
  const login = await req(`${API}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@demo.local',
      password: 'Demo1234!',
    }),
  });
  console.log('   ', login.user.email, login.tenant?.code);
  const headers = {
    Authorization: `Bearer ${login.accessToken}`,
    'X-Tenant-Id': login.tenant.id,
  };

  console.log('3) Register devices → GW');
  const reg = await req(`${API}/api/attendance/devices/register-gw`, {
    method: 'POST',
    headers,
  });
  console.log('   registered=', reg.registered);

  console.log('4) Face upload + sync');
  const empsPage = await req(`${API}/api/employees?limit=100`, { headers });
  const emps = empsPage.items || empsPage;
  const emp = emps.find((e) => e.externalId === 'face-0001') || emps[0];
  if (!emp?.externalId) {
    await req(`${API}/api/employees/${emp.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ externalId: 'face-0001' }),
    });
  }
  const fd = new FormData();
  fd.append('file', new Blob([tinyJpeg()], { type: 'image/jpeg' }), 'face.jpg');
  const uploaded = await req(`${API}/api/employees/${emp.id}/face`, {
    method: 'POST',
    headers: {
      Authorization: headers.Authorization,
      'X-Tenant-Id': headers['X-Tenant-Id'],
    },
    body: fd,
  });
  console.log('   upload status=', uploaded.syncStatus);

  const sync = await req(`${API}/api/employees/${emp.id}/face/sync`, {
    method: 'POST',
    headers,
  });
  const okSync = (sync.results || []).filter((r) => r.ok).length;
  console.log('   sync ok=', okSync, 'profile=', sync.profile?.syncStatus);
  if (okSync < 1) throw new Error('No device accepted face sync');

  console.log('5) Mock punch via Nest device id → NATS');
  const devices = await req(`${API}/api/attendance/devices`, { headers });
  const mock =
    devices.find((d) => d.adapterType === 'mock' && d.gatewayRef) ||
    devices.find((d) => d.adapterType === 'mock');
  if (!mock?.gatewayRef) throw new Error('No mock device with gatewayRef');

  await req(
    `${GW}/devices/${mock.gatewayRef}/emit-mock-punch?employee_external_id=${encodeURIComponent(emp.externalId || 'face-0001')}&direction=IN`,
    { method: 'POST' },
  );

  console.log('6) Wait for NATS consumer → marks');
  let markFound = false;
  for (let i = 0; i < 10; i++) {
    await sleep(400);
    const marksPage = await req(`${API}/api/attendance/marks?limit=100`, { headers });
    const marks = marksPage.items || marksPage;
    markFound = Array.isArray(marks)
      ? marks.some(
          (m) =>
            m.employeeExternalId === (emp.externalId || 'face-0001') ||
            m.employeeId === emp.id,
        )
      : false;
    if (markFound) {
      console.log('   mark count sample=', marks.length);
      break;
    }
  }
  if (!markFound) throw new Error('Attendance mark not created from NATS punch');

  console.log('\nOK — Phase 2 smoke passed (face → sync → punch → mark)');
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
