#!/usr/bin/env node
/**
 * Smoke: Verifix-style «Индивидуальные графики» full document lifecycle.
 *
 * Usage:
 *   node scripts/smoke-individual-schedules.js
 *
 * Env:
 *   API_URL=http://localhost:3001
 *   EMAIL=admin@demo.local
 *   PASSWORD=Demo1234!
 *
 * Requires: API running on :3001 with demo seed data.
 */
const API = process.env.API_URL || 'http://localhost:3001';
const EMAIL = process.env.EMAIL || 'admin@demo.local';
const PASSWORD = process.env.PASSWORD || 'Demo1234!';

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`  ✗ ${name} — ${err instanceof Error ? err.message : err}`);
}

async function req(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return body;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function monthIso(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function countWorkCells(days) {
  let n = 0;
  let hours = 0;
  for (const v of Object.values(days || {})) {
    if (v == null || v === '' || v === 'В' || v === 'R') continue;
    if (/^\d+(\.\d+)?$/.test(String(v))) {
      n += 1;
      hours += Number(v);
    }
  }
  return { n, hours: Math.round(hours * 100) / 100 };
}

async function main() {
  console.log(`\nИндивидуальные графики smoke  (${API})\n`);

  // 1) Health
  try {
    const h = await req('/api/health');
    assert(h, 'empty health');
    ok('health');
  } catch (e) {
    fail('health', e);
    console.error('\nAPI ishlamayapti. Avval: npm run dev\n');
    process.exit(1);
  }

  // 2) Login
  let headers;
  try {
    const login = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    assert(login.accessToken, 'no accessToken');
    headers = {
      Authorization: `Bearer ${login.accessToken}`,
      'X-Tenant-Id': login.tenant?.id || login.user?.tenantId || '',
    };
    ok('login', login.user?.email || EMAIL);
  } catch (e) {
    fail('login', e);
    process.exit(1);
  }

  // 3) List empty-or-array
  try {
    const list = await req('/api/catalog/schedule-overrides', { headers });
    assert(Array.isArray(list), 'list is not array');
    ok('list', `${list.length} doc(s)`);
  } catch (e) {
    fail('list', e);
  }

  // 4) Lookups
  let emp;
  let divisionId;
  try {
    const lookups = await req('/api/catalog/lookups', { headers });
    assert(Array.isArray(lookups.employees) && lookups.employees.length > 0, 'no employees');
    emp = lookups.employees[0];
    divisionId = lookups.divisions?.[0]?.id;
    ok('lookups', `emp=${emp.label}${divisionId ? ` div=${divisionId.slice(0, 8)}…` : ''}`);
  } catch (e) {
    fail('lookups', e);
    process.exit(1);
  }

  // 5) Fill grid for one + multi employee paths
  let fill;
  try {
    fill = await req('/api/catalog/schedule-overrides/fill', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        month: monthIso(),
        employeeIds: [emp.id],
        dayNorm: 8,
        weekPattern: '5/2',
        kind: 'ordinary',
        displayMode: 'hours',
      }),
    });
    assert(Array.isArray(fill.lines) && fill.lines.length === 1, 'fill lines');
    const { n, hours } = countWorkCells(fill.lines[0].days);
    assert(n >= 18 && n <= 23, `unexpected work days ${n}`);
    assert(hours === n * 8, `hours ${hours} != ${n}*8`);
    ok('fill ordinary 5/2', `${n} days / ${hours}h`);
  } catch (e) {
    fail('fill ordinary 5/2', e);
    process.exit(1);
  }

  // 6) Create draft for each kind (ordinary only full post; others save/delete)
  const kinds = ['ordinary', 'hourly', 'advanced', 'multi_shift'];
  const createdIds = [];

  for (const kind of kinds) {
    try {
      const doc = await req('/api/catalog/schedule-overrides', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind,
          documentDate: new Date().toISOString().slice(0, 10),
          month: monthIso(),
          number: `SMOKE-${kind.toUpperCase().slice(0, 4)}-${Date.now().toString(36)}`,
          divisionId: divisionId || undefined,
          note: `smoke ${kind}`,
          settings: {
            intervalType: 'first_in_first_out',
            displayMode: kind === 'advanced' ? 'time_range' : 'hours',
            weekPattern: '5/2',
            dayNorm: 8,
            startTime: '09:00',
            endTime: '18:00',
            byLocation: kind === 'multi_shift',
            advancedLateEarly: kind === 'advanced' || kind === 'multi_shift',
          },
          normDays: fill.lines[0].daysCount,
          normHours: fill.lines[0].hoursTotal,
          lines: [
            {
              employeeId: emp.id,
              days: fill.lines[0].days,
              daysCount: fill.lines[0].daysCount,
              hoursTotal: fill.lines[0].hoursTotal,
            },
          ],
        }),
      });
      assert(doc.id, 'no id');
      assert(doc.status === 'draft', `status=${doc.status}`);
      assert(doc.kind === kind, `kind=${doc.kind}`);
      assert(Array.isArray(doc.lines) && doc.lines.length === 1, 'lines');
      createdIds.push({ id: doc.id, kind });
      ok(`create ${kind}`, doc.id.slice(0, 8));
    } catch (e) {
      fail(`create ${kind}`, e);
    }
  }

  // 7) Get + PATCH draft
  const ordinary = createdIds.find((c) => c.kind === 'ordinary');
  if (ordinary) {
    try {
      const got = await req(`/api/catalog/schedule-overrides/${ordinary.id}`, { headers });
      assert(got.id === ordinary.id, 'get id mismatch');
      ok('get by id');

      const patched = await req(`/api/catalog/schedule-overrides/${ordinary.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          note: 'smoke updated',
          number: got.number || 'SMOKE-PATCH',
        }),
      });
      assert(patched.note === 'smoke updated', 'note not updated');
      ok('patch draft');
    } catch (e) {
      fail('get/patch', e);
    }
  }

  // 8) Post ordinary → verified + plannedHours
  if (ordinary) {
    try {
      const posted = await req(`/api/catalog/schedule-overrides/${ordinary.id}/post`, {
        method: 'POST',
        headers,
      });
      assert(posted.status === 'posted', `status=${posted.status}`);
      assert(posted.verified === true, 'not verified');
      ok('post ordinary', 'verified=true');

      // second post should fail
      let secondFailed = false;
      try {
        await req(`/api/catalog/schedule-overrides/${ordinary.id}/post`, {
          method: 'POST',
          headers,
        });
      } catch {
        secondFailed = true;
      }
      assert(secondFailed, 'double-post should fail');
      ok('reject double post');

      // cannot delete posted
      let delFailed = false;
      try {
        await req(`/api/catalog/schedule-overrides/${ordinary.id}`, {
          method: 'DELETE',
          headers,
        });
      } catch {
        delFailed = true;
      }
      assert(delFailed, 'delete posted should fail');
      ok('reject delete posted');
    } catch (e) {
      fail('post ordinary', e);
    }
  }

  // 9) Cancel a remaining draft + delete drafts
  for (const c of createdIds.filter((x) => x.kind !== 'ordinary')) {
    try {
      if (c.kind === 'hourly') {
        const cancelled = await req(`/api/catalog/schedule-overrides/${c.id}/cancel`, {
          method: 'POST',
          headers,
        });
        assert(cancelled.status === 'cancelled', `status=${cancelled.status}`);
        ok('cancel hourly draft');
        // cancelled can still delete unless we block — remove may succeed
        try {
          await req(`/api/catalog/schedule-overrides/${c.id}`, {
            method: 'DELETE',
            headers,
          });
          ok('delete cancelled');
        } catch {
          ok('delete cancelled skipped', 'blocked ok');
        }
      } else {
        await req(`/api/catalog/schedule-overrides/${c.id}`, {
          method: 'DELETE',
          headers,
        });
        ok(`delete draft ${c.kind}`);
      }
    } catch (e) {
      fail(`cleanup ${c.kind}`, e);
    }
  }

  // 10) List includes posted
  try {
    const list = await req('/api/catalog/schedule-overrides', { headers });
    const found = list.find((r) => r.id === ordinary?.id);
    assert(found, 'posted doc missing from list');
    assert(found.status === 'posted' || found.verified, 'list row not posted');
    ok('list shows posted doc', found.number || found.id.slice(0, 8));
  } catch (e) {
    fail('list posted', e);
  }

  // 11) Empty create then fill by division (if any)
  if (divisionId) {
    try {
      const filled = await req('/api/catalog/schedule-overrides/fill', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          month: monthIso(),
          divisionId,
          dayNorm: 8,
          weekPattern: '5/2',
          kind: 'ordinary',
        }),
      });
      assert(Array.isArray(filled.lines), 'division fill lines');
      ok('fill by division', `${filled.lines.length} employee(s)`);
    } catch (e) {
      fail('fill by division', e);
    }
  }

  console.log(`\n──── result: ${passed} passed, ${failed} failed ────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
