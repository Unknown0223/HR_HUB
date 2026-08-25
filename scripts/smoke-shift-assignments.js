#!/usr/bin/env node
/**
 * Smoke: Список смен расписания (ScheduleShiftAssignment).
 * Usage: node scripts/smoke-shift-assignments.js
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

function monthIso(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function monthBounds(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

async function main() {
  console.log(`\nShift assignments (Список смен) smoke  (${API})\n`);

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

  try {
    const list = await req('/api/catalog/shift-assignments', { headers });
    if (!Array.isArray(list)) throw new Error('not array');
    ok('list', `${list.length} rows`);
  } catch (e) {
    fail('list', e);
  }

  // Ensure a posted roster exists for rebuild
  try {
    const lookups = await req('/api/catalog/lookups', { headers });
    const scheduleId = lookups.schedules?.[0]?.id;
    const employeeId = lookups.employees?.[0]?.id;
    if (!scheduleId || !employeeId) throw new Error('missing schedule/employee');
    const fill = await req('/api/catalog/rosters/fill', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        scheduleId,
        month: monthIso(),
        employeeIds: [employeeId],
      }),
    });
    const created = await req('/api/catalog/rosters', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `Shift list smoke ${Date.now()}`,
        documentDate: new Date().toISOString().slice(0, 10),
        month: monthIso(),
        scheduleId,
        lines: (fill.lines || []).map((l, i) => ({
          employeeId: l.employeeId,
          sortOrder: i,
          days: l.days,
          daysCount: l.daysCount,
          hoursTotal: l.hoursTotal,
        })),
      }),
    });
    await req(`/api/catalog/rosters/${created.id}/post`, {
      method: 'POST',
      headers,
    });
    ok('post roster for fill');
  } catch (e) {
    fail('post roster', e);
  }

  const { from, to } = monthBounds();
  try {
    const rebuilt = await req('/api/catalog/shift-assignments/rebuild', {
      method: 'POST',
      headers,
      body: JSON.stringify({ from, to }),
    });
    if (!rebuilt.created && !rebuilt.rosters) {
      // still ok if empty but endpoint works
    }
    ok('rebuild', `created=${rebuilt.created} rosters=${rebuilt.rosters}`);
  } catch (e) {
    fail('rebuild', e);
  }

  try {
    const list = await req(
      `/api/catalog/shift-assignments?from=${from}&to=${to}`,
      { headers },
    );
    if (!Array.isArray(list)) throw new Error('not array');
    if (!list.length) throw new Error('expected shift rows after rebuild');
    const row = list[0];
    for (const k of ['employee', 'workDate', 'shiftLabel', 'source', 'status']) {
      if (row[k] == null && k !== 'status') throw new Error(`missing ${k}`);
    }
    ok('list after rebuild', `${list.length}`);
  } catch (e) {
    fail('list after rebuild', e);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
