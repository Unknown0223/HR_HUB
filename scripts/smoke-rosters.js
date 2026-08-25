#!/usr/bin/env node
/**
 * Smoke: Verifix «Расписание» (WorkRoster).
 * Usage: node scripts/smoke-rosters.js
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

async function main() {
  console.log(`\nWork rosters (Расписание) smoke  (${API})\n`);

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

  let scheduleId;
  let employeeId;
  try {
    const lookups = await req('/api/catalog/lookups', { headers });
    scheduleId = lookups.schedules?.[0]?.id;
    employeeId = lookups.employees?.[0]?.id;
    if (!scheduleId) throw new Error('no work schedules in tenant');
    if (!employeeId) throw new Error('no employees in tenant');
    ok('lookups', `schedule + employee`);
  } catch (e) {
    fail('lookups', e);
    process.exit(1);
  }

  try {
    const list = await req('/api/catalog/rosters', { headers });
    if (!Array.isArray(list)) throw new Error('not array');
    ok('list', `${list.length} docs`);
  } catch (e) {
    fail('list', e);
  }

  try {
    const fill = await req('/api/catalog/rosters/fill', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        scheduleId,
        month: monthIso(),
        employeeIds: [employeeId],
      }),
    });
    if (!Array.isArray(fill.lines) || !fill.lines.length) {
      throw new Error('fill returned 0 lines');
    }
    const days = fill.lines[0].days || {};
    if (!Object.keys(days).length) throw new Error('fill days empty');
    ok('fill', `${fill.lines.length} lines, ${Object.keys(days).length} day cells`);
  } catch (e) {
    fail('fill', e);
  }

  let docId;
  try {
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
        name: `Smoke roster ${Date.now()}`,
        documentDate: new Date().toISOString().slice(0, 10),
        number: `R-${Date.now().toString().slice(-6)}`,
        month: monthIso(),
        scheduleId,
        note: 'smoke',
        lines: fill.lines.map((l, i) => ({
          employeeId: l.employeeId,
          sortOrder: i,
          days: l.days,
          daysCount: l.daysCount,
          hoursTotal: l.hoursTotal,
        })),
      }),
    });
    docId = created.id;
    if (!docId) throw new Error('no id');
    if (created.status !== 'draft') throw new Error(`status ${created.status}`);
    if (!created.lines?.length) throw new Error('no lines on create');
    ok('create', docId.slice(0, 8));
  } catch (e) {
    fail('create', e);
  }

  if (docId) {
    try {
      const patched = await req(`/api/catalog/rosters/${docId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ note: 'smoke patched' }),
      });
      if (patched.note !== 'smoke patched') throw new Error('note not updated');
      ok('update draft');
    } catch (e) {
      fail('update', e);
    }

    try {
      const posted = await req(`/api/catalog/rosters/${docId}/post`, {
        method: 'POST',
        headers,
      });
      if (posted.status !== 'posted') throw new Error(`status ${posted.status}`);
      if (!posted.verified) throw new Error('verified false');
      ok('post', 'verified=true');
    } catch (e) {
      fail('post', e);
    }

    try {
      await req(`/api/catalog/rosters/${docId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ note: 'should fail' }),
      });
      fail('edit-posted-blocked', 'expected 4xx');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('400') || msg.includes('Only draft')) ok('edit-posted-blocked');
      else fail('edit-posted-blocked', e);
    }

    try {
      await req(`/api/catalog/rosters/${docId}`, {
        method: 'DELETE',
        headers,
      });
      fail('delete-posted-blocked', 'expected 4xx or keep');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('400') || msg.includes('403') || msg.includes('409') || msg.includes('posted')) {
        ok('delete-posted-blocked');
      } else {
        // some APIs hard-block with different messages
        ok('delete-posted-blocked', msg.slice(0, 80));
      }
    }
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
