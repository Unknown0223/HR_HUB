#!/usr/bin/env node
/**
 * Smoke for PARTIAL-gap fixes (mega-nav full-stack audit).
 * Usage: node scripts/smoke-gap-fixes.js
 * Requires: API :3001 + seeded demo tenant.
 */
const API = process.env.API_URL || 'http://localhost:3001';

async function req(url, headers = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...headers } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${text.slice(0, 200)}`);
  return body;
}

function assert(cond, label) {
  if (!cond) throw new Error(`ASSERT FAIL: ${label}`);
  console.log('   OK —', label);
}

async function main() {
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.local', password: 'Demo1234!' }),
  });
  if (!loginRes.ok) throw new Error(`login → ${loginRes.status}`);
  const login = await loginRes.json();
  const h = {
    Authorization: `Bearer ${login.accessToken}`,
    'X-Tenant-Id': login.tenant.id,
  };
  console.log('login OK:', login.user.email);

  console.log('1) division-stats → divisions[] non-empty (FE extractRows uses it)');
  const ds = await req(`${API}/api/catalog/analytics/division-stats`, h);
  assert(Array.isArray(ds.divisions) && ds.divisions.length > 0, `divisions rows=${ds.divisions?.length}`);

  console.log('2) attendance problems non-empty');
  const problems = await req(`${API}/api/attendance/problems`, h);
  assert(Array.isArray(problems) && problems.length >= 3, `problems=${problems.length}`);

  console.log('3) devices filter=new stricter than all');
  const allDev = await req(`${API}/api/attendance/devices`, h);
  const newDev = await req(`${API}/api/attendance/devices?filter=new`, h);
  assert(newDev.length >= 1 && newDev.length < allDev.length, `new=${newDev.length} < all=${allDev.length}`);
  assert(newDev.every((d) => d.lastSeenAt == null), 'all "new" devices never seen');

  console.log('4) schedules modes differ');
  const sched = await req(`${API}/api/attendance/schedules`, h);
  const rosters = await req(`${API}/api/attendance/schedules?mode=rosters`, h);
  assert(sched.length > 0 && sched.every((s) => !('employees' in s)), 'plain mode has no employees');
  const assignments = rosters.flatMap((s) => s.employees ?? []);
  assert(assignments.length > 0, `rosters mode returns assignments=${assignments.length}`);

  console.log('5) gps-tracks non-empty (GPS tab data)');
  const tracks = await req(`${API}/api/catalog/gps-tracks`, h);
  assert(Array.isArray(tracks) && tracks.length >= 3, `gpsTracks=${tracks.length}`);

  console.log('6) grade-changes rows non-empty');
  const gc = await req(`${API}/api/catalog/analytics/grade-changes`, h);
  assert(Array.isArray(gc.rows) && gc.rows.length >= 2, `gradeChanges=${gc.rows?.length}`);

  console.log('7) lateness summary + details non-empty');
  const late = await req(`${API}/api/reports/attendance/lateness`, h);
  assert(late.summary?.length > 0, `lateness summary=${late.summary?.length}`);
  assert(late.details?.length > 0, `lateness details=${late.details?.length}`);

  console.log('8) settings audit non-empty');
  const audit = await req(`${API}/api/settings/audit`, h);
  assert(Array.isArray(audit) && audit.length >= 5, `audit=${audit.length}`);

  console.log('9) payroll timesheet without year/month → 200');
  const ts = await req(`${API}/api/payroll/timesheet`, h);
  assert(Array.isArray(ts), `timesheet rows=${ts.length}`);

  console.log('10) platform_admin login (tenants page access)');
  const platRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'platform@hrhub.local', password: 'Demo1234!' }),
  });
  assert(platRes.ok, `platform login → ${platRes.status}`);
  const plat = await platRes.json();
  const tenants = await req(`${API}/api/tenants`, {
    Authorization: `Bearer ${plat.accessToken}`,
  });
  const tenantList = tenants.items || tenants;
  assert(Array.isArray(tenantList) && tenantList.length > 0, `tenants=${tenantList.length}`);

  console.log('\nOK — all gap-fix smokes passed');
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
