#!/usr/bin/env node
/**
 * Smoke: 4 clock anti-fraud protections on punch ingest.
 * Usage: node scripts/smoke-clock-guard.js
 * Requires: API on API_URL (default http://localhost:3002)
 */
const API = process.env.API_URL || 'http://localhost:3002';

async function req(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
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
  return { ok: res.ok, status: res.status, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('API', API);

  const login = await req(`${API}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@demo.local',
      password: 'Demo1234!',
    }),
  });
  assert(login.ok, `login failed: ${login.status} ${JSON.stringify(login.body)}`);
  const token = login.body.accessToken;
  const tenantId = login.body.tenant.id;
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
  };
  console.log('✓ login', login.body.user.email, tenantId);

  const devices = await req(`${API}/api/attendance/devices?limit=50`, { headers });
  assert(devices.ok, `devices failed: ${devices.status}`);
  const list = devices.body.items || devices.body || [];
  const device =
    list.find((d) => /hikvision|access/i.test(String(d.name || d.model || ''))) ||
    list.find((d) => d.isActive) ||
    list[0];
  assert(device?.id, 'no device found');
  console.log('✓ device', device.name, device.id);

  const empsPage = await req(`${API}/api/employees?limit=50`, { headers });
  assert(empsPage.ok, `employees failed: ${empsPage.status}`);
  const emps = (empsPage.body.items || empsPage.body || []).filter(
    (e) => e.tabNumber || e.externalId,
  );
  assert(emps.length >= 1, 'no employee found');
  const pickEmp = (i) => emps[i % emps.length];
  console.log('✓ employees', emps.length);

  async function ingest(emp, occurredAt, extra = {}) {
    const externalId = String(emp.tabNumber || emp.externalId || emp.id);
    const body = {
      tenantId,
      deviceId: device.id,
      serialNumber: device.serialNumber || undefined,
      employeeExternalId: externalId,
      direction: 'IN',
      occurredAt:
        typeof occurredAt === 'string' ? occurredAt : occurredAt.toISOString(),
      source: extra.source || 'hikvision_http_host',
      raw: {
        serialNo: extra.serialNo ?? Math.floor(Date.now() / 1000),
        ...(extra.raw || {}),
      },
    };
    return req(`${API}/api/attendance/punches/ingest`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function fetchMark(markId) {
    const res = await req(`${API}/api/attendance/marks/${markId}`, { headers });
    assert(res.ok, `mark ${markId} fetch failed: ${res.status}`);
    return res.body;
  }

  const results = {};
  const runId = Date.now();

  // --- (0) Clean / trusted punch ---
  const cleanEmp = pickEmp(0);
  const cleanAt = new Date(runId + 3 * 60_000);
  const clean = await ingest(cleanEmp, cleanAt, { serialNo: 910001 + (runId % 1000) });
  assert(clean.ok && clean.body?.ok, `clean ingest failed: ${JSON.stringify(clean.body)}`);
  assert(clean.body.markId, 'clean markId missing');
  const cleanMark = await fetchMark(clean.body.markId);
  assert(cleanMark.isValid !== false, 'clean punch must be valid');
  results.clean = clean.body.markId;
  console.log(
    '✓ 0 clean punch → valid',
    cleanEmp.tabNumber || cleanEmp.externalId,
    clean.body.deduped ? '(deduped ok)' : '',
  );

  // --- (1) Online skew (>3 min) ---
  const skewEmp = pickEmp(1);
  const skewPast = new Date(Date.now() - 12 * 60_000);
  const skew = await ingest(skewEmp, skewPast, { serialNo: 920002 + (runId % 1000) });
  assert(skew.ok && skew.body?.ok, `skew ingest: ${JSON.stringify(skew.body)}`);
  assert(skew.body.markId, 'skew markId missing');
  const skewMark = await fetchMark(skew.body.markId);
  assert(skewMark.isValid === false, `skew must be invalid, got ${skewMark.isValid}`);
  assert(skewMark.clockTamper === true, 'skew must set clockTamper');
  results.skew = skew.body.markId;
  console.log('✓ 1 online skew → invalid', skewEmp.tabNumber || skewEmp.externalId);

  // --- (2) Rollback behind device watermark (any employee on same device) ---
  const rollbackEmp = pickEmp(4);
  const rollbackAt = new Date(cleanAt.getTime() - 5 * 60_000);
  const rollback = await ingest(rollbackEmp, rollbackAt, {
    serialNo: 930010 + (runId % 1000),
  });
  assert(rollback.ok && rollback.body?.ok, `rollback ingest: ${JSON.stringify(rollback.body)}`);
  assert(rollback.body.markId, 'rollback markId missing');
  const rollbackMark = await fetchMark(rollback.body.markId);
  assert(rollbackMark.isValid === false, `rollback must be invalid`);
  assert(rollbackMark.clockTamper === true, 'rollback must set clockTamper');
  results.rollback = rollback.body.markId;
  console.log('✓ 2 rollback → invalid', rollbackEmp.tabNumber || rollbackEmp.externalId);

  // --- (4) Admin login lock ---
  const adminEmp = pickEmp(2);
  const adminAt = new Date(Date.now() - 45_000);
  const admin = await ingest(adminEmp, adminAt, {
    serialNo: 940020 + (runId % 1000),
    raw: { admin_login_blocked: true },
  });
  assert(admin.ok && admin.body?.ok, `admin ingest: ${JSON.stringify(admin.body)}`);
  assert(admin.body.markId, 'admin markId missing');
  const adminMark = await fetchMark(admin.body.markId);
  assert(adminMark.isValid === false, 'admin-blocked must be invalid');
  results.admin = admin.body.markId;
  console.log('✓ 4 admin login blocked → invalid', adminEmp.tabNumber || adminEmp.externalId);

  // --- (3) Offline unverified ---
  let offlineOk = false;
  const offlineEmp = pickEmp(3);
  const patch = await req(`${API}/api/attendance/devices/${device.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      meta: {
        ...(device.meta || {}),
        clockGuard: {
          lastHeartbeatAt: new Date(Date.now() - 20 * 60_000).toISOString(),
          lastEventAt: new Date(Date.now() - 20 * 60_000).toISOString(),
          lastTrustedDeviceClockAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        },
      },
    }),
  });
  if (patch.ok) {
    const mid = new Date(Date.now() - 10 * 60_000);
    const offline = await ingest(offlineEmp, mid, {
      serialNo: 950030 + (runId % 1000),
      source: 'device_gw_pull',
    });
    if (offline.ok && offline.body?.markId) {
      const offlineMark = await fetchMark(offline.body.markId);
      if (offlineMark.isValid === false && offlineMark.clockTamper) {
        offlineOk = true;
        results.offline = offline.body.markId;
        console.log('✓ 3 offline unverified → invalid');
      } else {
        console.log('~ 3 offline partial', offlineMark.isValid, offlineMark.note);
      }
    } else {
      console.log('~ 3 offline ingest', JSON.stringify(offline.body));
    }
  } else {
    console.log('~ 3 offline skipped (PATCH', patch.status, ')');
  }

  assert(results.clean, 'missing clean');
  assert(results.skew, 'missing skew');
  assert(results.rollback, 'missing rollback');
  assert(results.admin, 'missing admin');
  assert(offlineOk, 'offline protection did not fire');

  console.log('');
  console.log('RESULT: clock-guard smoke OK (4/4 protections)');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('FAIL', e.message || e);
  process.exit(1);
});
