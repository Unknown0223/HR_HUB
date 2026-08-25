#!/usr/bin/env node
/**
 * Smoke: Запросы на изменение расписания (roster_change).
 * Usage: node scripts/smoke-roster-change-requests.js
 */
const API = process.env.API_URL || 'http://localhost:3001';
const EMAIL = process.env.EMAIL || 'admin@demo.local';
const PASSWORD = process.env.PASSWORD || 'Demo1234!';

let passed = 0;
let failed = 0;

function ok(n, d = '') {
  passed += 1;
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ''}`);
}
function fail(n, e) {
  failed += 1;
  console.error(`  ✗ ${n} — ${e instanceof Error ? e.message : e}`);
}

async function req(p, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API}${p}`, { ...options, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${p} → ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log(`\nRoster change requests smoke  (${API})\n`);

  try {
    await req('/api/health');
    ok('health');
  } catch (e) {
    fail('health', e);
    process.exit(1);
  }

  let headers;
  try {
    const login = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    headers = {
      Authorization: `Bearer ${login.accessToken}`,
      'X-Tenant-Id': login.tenant?.id || '',
    };
    ok('login');
  } catch (e) {
    fail('login', e);
    process.exit(1);
  }

  let employeeId;
  let recommendedId;
  let shiftId;
  let scheduleId;

  try {
    const emps = await req('/api/employees?status=active&limit=20', { headers });
    const list = Array.isArray(emps) ? emps : emps.items || [];
    if (list.length < 2) throw new Error('need >=2 employees');
    employeeId = list[0].id;
    recommendedId = list[1].id;
    ok('employees', `${list.length}`);
  } catch (e) {
    fail('employees', e);
    process.exit(1);
  }

  try {
    const shifts = await req('/api/catalog/schedule-shifts', { headers });
    const list = Array.isArray(shifts) ? shifts : shifts.items || [];
    if (list.length) {
      shiftId = list[0].id;
      scheduleId = list[0].scheduleId;
      ok('shifts', String(list.length));
    } else {
      // create a shift from first work schedule
      const lookups = await req('/api/catalog/lookups', { headers });
      scheduleId = lookups.schedules?.[0]?.id;
      if (!scheduleId) throw new Error('no schedules and no shifts');
      const created = await req('/api/catalog/schedule-shifts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scheduleId,
          code: `S${Date.now().toString().slice(-4)}`,
          name: 'Smoke shift',
          startTime: '09:00',
          endTime: '18:00',
          isActive: true,
        }),
      });
      shiftId = created.id;
      ok('shift created', shiftId.slice(0, 8));
    }
  } catch (e) {
    fail('shifts', e);
    process.exit(1);
  }

  try {
    const list = await req('/api/hr/requests?type=roster_change&scope=available', {
      headers,
    });
    if (!Array.isArray(list)) throw new Error('not array');
    ok('list available', `${list.length}`);
  } catch (e) {
    fail('list', e);
  }

  let reqId;
  try {
    const requestDate = new Date().toISOString().slice(0, 10);
    const created = await req('/api/hr/requests', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        employeeId,
        type: 'roster_change',
        title: `Smoke roster change ${Date.now()}`,
        visibility: 'shared',
        payload: {
          changeKind: 'roster_substitute',
          requestDate,
          shiftId,
          scheduleId,
          shiftName: 'Smoke shift',
          recommendedEmployeeId: recommendedId,
          recommendedEmployeeName: 'Smoke Rec',
          note: 'smoke',
        },
      }),
    });
    reqId = created.id;
    if (!reqId) throw new Error('no id');
    ok('create', reqId.slice(0, 8));
  } catch (e) {
    fail('create', e);
  }

  if (reqId) {
    try {
      const mine = await req('/api/hr/requests?type=roster_change&scope=my_requests', {
        headers,
      });
      if (!Array.isArray(mine)) throw new Error('not array');
      if (!mine.some((r) => r.id === reqId)) throw new Error('created not in my_requests');
      ok('scope my_requests includes created');
    } catch (e) {
      fail('my_requests', e);
    }

    try {
      const posted = await req(`/api/hr/requests/${reqId}/review`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'approved' }),
      });
      if (posted.status !== 'approved') throw new Error(`status ${posted.status}`);
      ok('approve');
    } catch (e) {
      fail('approve', e);
    }
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
