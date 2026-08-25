/**
 * Full-stack smoke: Посещения reports (before Зарплата).
 * Usage: node scripts/smoke-attendance-reports.js
 */
const fs = require('node:fs');
const path = require('node:path');

const API = (process.env.API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const WEB = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'admin@demo.local';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Demo1234!';

const REPORTS = [
  { id: 'attendance-overview', page: 'attendance-overview', api: 'attendance-overview', exportKind: 'attendance-overview' },
  { id: 'attendance-t13', page: 'attendance-t13', api: 'attendance-overview', exportKind: 'attendance-overview' },
  { id: 'discipline', page: 'discipline', api: 'discipline', exportKind: 'discipline' },
  { id: 'division-mode', page: 'division-mode', api: 'division-mode', exportKind: 'division-mode' },
  { id: 'marks-detail', page: 'marks-detail', api: 'marks-detail', exportKind: 'marks-detail' },
  { id: 'distance', page: 'distance', api: 'distance', exportKind: 'distance' },
  { id: 'hourly', page: 'hourly', api: 'hourly', exportKind: 'hourly' },
  { id: 'shifts', page: 'shifts', api: 'shifts', exportKind: 'shifts' },
  { id: 'multi-shift', page: 'multi-shift', api: 'multi-shift', exportKind: 'multi-shift' },
  { id: 'time-types', page: 'time-types', api: 'time-types', exportKind: 'time-types' },
  { id: 'lateness', page: 'lateness', api: 'lateness', exportKind: 'lateness' },
  { id: 'schedules', page: 'schedules', api: 'schedules', exportKind: 'schedules' },
  { id: 'schedule-plan', page: 'schedule-plan', api: 'schedule-plan', exportKind: 'schedule-plan' },
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function req(method, p, { token, tenant, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  const res = await fetch(`${API}${p}`, { method, headers });
  if (raw) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: res.ok, status: res.status, buf, type: res.headers.get('content-type') || '' };
  }
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function checkFiles() {
  const root = path.join(__dirname, '..', 'apps', 'web', 'src');
  const reportsNav = fs.readFileSync(path.join(root, 'lib', 'reports-nav.ts'), 'utf8');
  const catalogNav = fs.readFileSync(path.join(root, 'lib', 'catalog-nav.ts'), 'utf8');
  const megaNav = fs.readFileSync(path.join(root, 'lib', 'mega-nav.ts'), 'utf8');
  return REPORTS.map((r) => {
    const pagePath = path.join(root, 'app', '(app)', 'catalog', 'reports', r.page, 'page.tsx');
    const cssPath = path.join(root, 'app', '(app)', 'catalog', 'reports', r.page, 'page.module.css');
    return {
      id: r.id,
      hasPage: fs.existsSync(pagePath),
      hasCss: fs.existsSync(cssPath),
      inReportsNav: reportsNav.includes(`/catalog/reports/${r.page}`),
      inCatalog: catalogNav.includes(r.api) || catalogNav.includes(`'${r.id}'`) || catalogNav.includes(`"${r.id}"`),
      inMega: megaNav.includes(`/reports/${r.page}`),
    };
  });
}

function summarizePayload(data) {
  if (!data || typeof data !== 'object') return { keys: '', rows: '-' };
  const keys = Object.keys(data).slice(0, 8).join(',');
  const arr = data.rows || data.items || data.employees || data.days || data.divisions || null;
  const rows = Array.isArray(arr) ? arr.length : '-';
  return { keys, rows };
}

async function main() {
  const now = new Date();
  const from = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = isoDay(now);
  let failed = 0;

  console.log('=== Посещения reports full-stack smoke ===');
  console.log(`API=${API}  WEB=${WEB}  period=${from}..${to}\n`);

  const health = await req('GET', '/api/health');
  assert(health.ok && health.data?.status === 'ok', `health ${health.status}`);
  console.log('OK  health');

  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginData = await loginRes.json().catch(() => null);
  assert(loginRes.ok, `login ${loginRes.status} ${JSON.stringify(loginData)}`);
  const token = loginData.accessToken;
  const tenant = loginData.tenant?.id || loginData.user?.tenantId;
  assert(token && tenant, 'login session incomplete');
  console.log('OK  login', loginData.user?.email || EMAIL);

  console.log('\n--- files + nav ---');
  for (const row of checkFiles()) {
    const ok = row.hasPage && row.inReportsNav && row.inCatalog;
    if (!ok) failed += 1;
    console.log(
      `${ok ? 'OK ' : 'FAIL'} ${row.id.padEnd(22)} page=${row.hasPage} css=${row.hasCss} reports-nav=${row.inReportsNav} catalog=${row.inCatalog} mega=${row.inMega}`,
    );
  }

  console.log('\n--- API analytics ---');
  for (const r of REPORTS) {
    const url = `/api/catalog/analytics/${r.api}?from=${from}&to=${to}`;
    const res = await req('GET', url, { token, tenant });
    const ok = res.ok && res.data && typeof res.data === 'object';
    if (!ok) failed += 1;
    const { keys, rows } = summarizePayload(res.data);
    console.log(`${ok ? 'OK ' : 'FAIL'} ${r.id.padEnd(22)} HTTP ${res.status} rows=${rows} keys=[${keys}]`);
    if (!ok) console.log('     ', JSON.stringify(res.data)?.slice(0, 280));
  }

  console.log('\n--- XLSX export ---');
  const seen = new Set();
  for (const r of REPORTS) {
    if (seen.has(r.exportKind)) continue;
    seen.add(r.exportKind);
    const url = `/api/catalog/analytics/${r.exportKind}/export.xlsx?from=${from}&to=${to}`;
    const res = await req('GET', url, { token, tenant, raw: true });
    const ok = res.ok && res.buf.length > 80;
    if (!ok) failed += 1;
    console.log(
      `${ok ? 'OK ' : 'FAIL'} ${r.exportKind.padEnd(22)} HTTP ${res.status} bytes=${res.buf.length} type=${res.type}`,
    );
  }

  console.log('\n--- Web pages ---');
  for (const r of REPORTS) {
    const url = `${WEB}/catalog/reports/${r.page}`;
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const ok = [200, 302, 307, 308].includes(res.status);
      if (!ok) failed += 1;
      console.log(`${ok ? 'OK ' : 'FAIL'} ${r.id.padEnd(22)} HTTP ${res.status}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${r.id.padEnd(22)} ${e.message}`);
    }
  }

  console.log('\n--- Lookups ---');
  {
    const res = await req('GET', '/api/catalog/lookups', { token, tenant });
    const ok = res.ok && res.data;
    if (!ok) failed += 1;
    console.log(`${ok ? 'OK ' : 'FAIL'} lookups`, {
      employees: res.data?.employees?.length ?? 0,
      positions: res.data?.positions?.length ?? 0,
      schedules: res.data?.schedules?.length ?? 0,
      divisions: res.data?.divisions?.length ?? 0,
    });
  }

  console.log('\n=== SUMMARY ===');
  console.log(`failed=${failed}`);
  if (failed) {
    process.exitCode = 1;
    console.log('NOT READY — fix FAIL before Зарплата');
  } else {
    console.log('READY — Посещения full-stack OK; can start Зарплата');
  }
}

main().catch((e) => {
  console.error('SMOKE ERROR', e);
  process.exit(1);
});
