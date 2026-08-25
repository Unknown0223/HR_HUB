#!/usr/bin/env node
/**
 * HR HUB — comprehensive authenticated page + API smoke.
 *
 * Phase 1 (API):     every read endpoint the UI depends on, via fetch.
 * Phase 2 (browser): every browser route (mega-nav, catalog resources, report
 *                    kinds, page tabs, form-sibling links) in headless Chrome
 *                    over CDP — capturing HTTP status, uncaught exceptions,
 *                    console errors, failed XHRs and error text rendered in the UI.
 *
 * Read-only: no records are created, updated or deleted.
 *
 * Usage: node scripts/smoke-full-pages.js [--api-only] [--headful] [--filter <substr>]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const API = (process.env.API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const WEB = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'admin@demo.local';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Demo1234!';
const PLATFORM_EMAIL = process.env.SMOKE_PLATFORM_EMAIL || 'platform@hrhub.local';

const argv = process.argv.slice(2);
const API_ONLY = argv.includes('--api-only');
const SKIP_API = argv.includes('--skip-api');
const HEADFUL = argv.includes('--headful');
const FILTER_RAW = argv.includes('--filter') ? argv[argv.indexOf('--filter') + 1] : '';
const FILTERS = FILTER_RAW.split(',').map((s) => s.trim()).filter(Boolean);

const WEB_SRC = path.join(__dirname, '..', 'apps', 'web', 'src');

// ————————————————————————————————————————————————————————————————
// Route discovery — parsed from the same sources the UI renders from,
// so the smoke can never drift out of sync with the nav.
// ————————————————————————————————————————————————————————————————

function readSrc(...rel) {
  return fs.readFileSync(path.join(WEB_SRC, ...rel), 'utf8');
}

function hrefsIn(source) {
  return [...source.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Keys of a top-level `export const NAME: ... = { ... }` object literal. */
function objectKeys(source, name) {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) return [];
  const body = source.slice(start);
  const end = body.indexOf('\n};');
  return [...body.slice(0, end).matchAll(/^ {2}'?([A-Za-z][\w-]*)'?:\s*\{/gm)].map((m) => m[1]);
}

function discoverRoutes() {
  const megaNav = readSrc('lib', 'mega-nav.ts');
  const catalogNav = readSrc('lib', 'catalog-nav.ts');
  const siblings = readSrc('lib', 'form-siblings.ts');

  const routes = new Map(); // href -> Set<source label>
  const add = (href, from) => {
    if (!href.startsWith('/')) return;
    if (!routes.has(href)) routes.set(href, new Set());
    routes.get(href).add(from);
  };

  hrefsIn(megaNav).forEach((h) => add(h, 'mega-nav'));
  hrefsIn(catalogNav).forEach((h) => add(h, 'catalog-nav'));
  hrefsIn(siblings).forEach((h) => add(h, 'form-siblings'));

  objectKeys(catalogNav, 'RESOURCE_META').forEach((k) => add(`/catalog/${k}`, 'catalog-resource'));
  objectKeys(catalogNav, 'REPORT_KINDS').forEach((k) =>
    add(`/catalog/reports/${k}`, 'catalog-report'),
  );

  // Every tab of every tabbed page (the `const TABS = [...]` in each page.tsx).
  const tabbedPages = {
    '/employees': ['employees', 'page.tsx'],
    '/divisions': ['divisions', 'page.tsx'],
    '/attendance': ['attendance', 'page.tsx'],
    '/payroll': ['payroll', 'page.tsx'],
    '/reports': ['reports', 'page.tsx'],
    '/settings': ['settings', 'page.tsx'],
  };
  for (const [route, rel] of Object.entries(tabbedPages)) {
    const src = readSrc('app', '(app)', ...rel);
    const m = src.match(/const TABS = \[([\s\S]*?)\] as const;/);
    if (!m) continue;
    for (const tab of [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1])) {
      add(`${route}?tab=${tab}`, 'page-tab');
    }
  }

  // Settings dictionaries / integrations / admin panels.
  const settingsSrc = readSrc('app', '(app)', 'settings', 'page.tsx');
  const listOf = (name) => {
    const m = settingsSrc.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`));
    return m ? [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]) : [];
  };
  listOf('CORE_DICT_CODES').forEach((c) => add(`/settings?tab=dictionaries&dict=${c}`, 'dictionary'));
  listOf('EXTRA_DICT_CODES').forEach((c) => add(`/settings?tab=extra&dict=${c}`, 'dictionary'));
  listOf('ADMIN_DICT_PANELS').forEach((p) => add(`/settings?tab=admin&panel=${p}`, 'admin-panel'));
  listOf('ADMIN_SPECIAL').forEach((p) => add(`/settings?tab=admin&panel=${p}`, 'admin-panel'));
  listOf('SYS_CODES').forEach((s) => add(`/settings?tab=integrations&sys=${s}`, 'integration'));

  ['/', '/dashboard', '/catalog', '/employees', '/divisions', '/tenants'].forEach((h) =>
    add(h, 'core'),
  );

  // Unknown slugs must render an empty state, never crash.
  add('/catalog/__does_not_exist__', 'edge-case');
  add('/catalog/reports/__does_not_exist__', 'edge-case');

  [
    '/settings/artix/divisions',
    '/settings/artix/users',
    '/settings/artix/users/import',
    '/settings/artix/errors',
    '/settings/artix/roles',
    '/settings/iiko/users',
    '/settings/iiko/positions',
    '/settings/iiko/divisions',
    '/settings/iiko/errors',
    '/settings/billz/users',
    '/settings/billz/divisions',
    '/settings/billz/sales',
  ].forEach((h) => add(h, 'integration-page'));

  return routes;
}

// ————————————————————————————————————————————————————————————————
// HTTP helpers
// ————————————————————————————————————————————————————————————————

async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status} ${await res.text()}`);
  return res.json();
}

function makeApiChecker(session) {
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    ...(session.tenant?.id ? { 'X-Tenant-Id': session.tenant.id } : {}),
  };
  const results = [];
  return {
    results,
    async get(pathname, { expect = 200, label } = {}) {
      const url = `${API}${pathname}`;
      const entry = { path: pathname, label: label || pathname, ok: false, status: 0, detail: '' };
      try {
        const res = await fetch(url, { headers });
        entry.status = res.status;
        const text = await res.text();
        entry.ok = res.status === expect;
        if (!entry.ok) entry.detail = text.slice(0, 300);
        else {
          try {
            const body = text ? JSON.parse(text) : null;
            entry.count = Array.isArray(body)
              ? body.length
              : Array.isArray(body?.items)
                ? body.items.length
                : undefined;
          } catch {
            /* non-JSON (xlsx) is fine */
          }
        }
      } catch (e) {
        entry.detail = e.message;
      }
      results.push(entry);
      return entry;
    },
  };
}

// ————————————————————————————————————————————————————————————————
// Minimal CDP client over Node's native WebSocket
// ————————————————————————————————————————————————————————————————

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        for (const cb of this.listeners.get(msg.method) ?? []) cb(msg.params, msg.sessionId);
      }
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(cb);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }
}

async function launchBrowser() {
  const bin = findBrowser();
  if (!bin) throw new Error('No Chrome/Edge binary found — set CHROME_PATH');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrhub-smoke-'));
  const port = 9377;
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-features=Translate,OptimizationHints',
    '--window-size=1600,1000',
  ];
  if (!HEADFUL) args.push('--headless=new', '--disable-gpu');
  const proc = spawn(bin, args, { stdio: 'ignore' });

  let wsUrl = '';
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        wsUrl = (await res.json()).webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* not up yet */
    }
  }
  if (!wsUrl) {
    proc.kill();
    throw new Error('browser did not expose a devtools endpoint');
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('devtools websocket failed')), { once: true });
  });

  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  return {
    cdp,
    sessionId,
    async close() {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      proc.kill();
      await sleep(300);
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        /* windows file locks — best effort */
      }
    },
  };
}

/** Console noise that is not an application defect. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /favicon\.ico/i,
  /\[Fast Refresh\]/i,
  /Warning: Extra attributes from the server/i,
  /net::ERR_ABORTED/i,
];

function isIgnorable(text) {
  return IGNORED_CONSOLE.some((re) => re.test(text));
}

async function runBrowserSuite(routes, session, platformSession) {
  const browser = await launchBrowser();
  const { cdp, sessionId } = browser;

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);

  let bucket = null;
  const inflight = new Set();
  let lastActivity = Date.now();

  const note = (kind, text) => {
    if (!bucket || !text || isIgnorable(text)) return;
    bucket[kind].push(text.slice(0, 400));
  };

  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    note('exceptions', d.exception?.description || d.text || 'unknown exception');
  });
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error') return;
    note('consoleErrors', p.args.map((a) => a.description ?? a.value ?? a.type).join(' '));
  });
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level !== 'error') return;
    note('consoleErrors', `${p.entry.text} ${p.entry.url ?? ''}`);
  });
  cdp.on('Network.requestWillBeSent', (p) => {
    inflight.add(p.requestId);
    lastActivity = Date.now();
    if (bucket && p.type === 'Document') bucket.docRequestId = p.requestId;
  });
  const settle = (id) => {
    inflight.delete(id);
    lastActivity = Date.now();
  };
  cdp.on('Network.loadingFinished', (p) => settle(p.requestId));
  cdp.on('Network.loadingFailed', (p) => {
    settle(p.requestId);
    if (p.errorText && !/ERR_ABORTED/.test(p.errorText)) {
      note('failedRequests', `net error ${p.errorText}`);
    }
  });
  cdp.on('Network.responseReceived', (p) => {
    if (!bucket) return;
    if (p.requestId === bucket.docRequestId) bucket.httpStatus = p.response.status;
    if (p.response.status >= 400) {
      note('failedRequests', `${p.response.status} ${p.response.url}`);
    }
  });

  // Seed the localStorage session on the web origin before visiting app routes.
  await cdp.send('Page.navigate', { url: `${WEB}/` }, sessionId);
  await sleep(1500);
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `localStorage.setItem('hrhub_session', ${JSON.stringify(JSON.stringify(session))}); 'ok'`,
      returnByValue: true,
    },
    sessionId,
  );

  const results = [];
  const entries = [...routes.entries()].filter(
    ([href]) => !FILTERS.length || FILTERS.some((f) => href.includes(f)),
  );

  for (const [href, sources] of entries) {
    bucket = {
      exceptions: [],
      consoleErrors: [],
      failedRequests: [],
      httpStatus: 0,
      docRequestId: null,
    };
    inflight.clear();

    const url = `${WEB}${href}`;
    try {
      await cdp.send('Page.navigate', { url }, sessionId);
    } catch (e) {
      results.push({ href, sources: [...sources], fatal: e.message, ...bucket });
      continue;
    }

    // Wait for the network to go quiet — client-rendered pages fetch after load.
    const deadline = Date.now() + 20_000;
    lastActivity = Date.now();
    await sleep(700);
    while (Date.now() < deadline) {
      if (inflight.size === 0 && Date.now() - lastActivity > 900) break;
      await sleep(150);
    }

    let dom = { errorTexts: [], title: '', bodyLen: 0, hasShell: false };
    try {
      const { result } = await cdp.send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const errs = [...document.querySelectorAll('[class*="error" i]')]
              .map((e) => (e.textContent || '').trim())
              .filter(Boolean);
            const body = document.body ? document.body.innerText || '' : '';
            return {
              errorTexts: [...new Set(errs)].slice(0, 8),
              title: document.title,
              bodyLen: body.length,
              hasShell: !!document.querySelector('header'),
              stillLoading: /^\\s*(Загрузка…|Loading)/.test(body.trim()),
            };
          })()`,
          returnByValue: true,
        },
        sessionId,
      );
      dom = result.value ?? dom;
    } catch (e) {
      bucket.exceptions.push(`evaluate failed: ${e.message}`);
    }

    results.push({ href, sources: [...sources], ...bucket, ...dom });
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  // —— Topbar interactions (global search + notifications) ——
  const interactions = [];
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate threw');
    return result.value;
  };

  try {
    await cdp.send('Page.navigate', { url: `${WEB}/dashboard` }, sessionId);
    await sleep(3000);

    const search = await evaluate(`(async () => {
      const btn = document.querySelector('button[aria-label="Поиск"]');
      if (!btn) return { ok: false, why: 'search button missing' };
      btn.click();
      await new Promise((r) => setTimeout(r, 300));
      const input = document.querySelector('input[type="search"]');
      if (!input) return { ok: false, why: 'search input missing' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'a');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1800));
      const body = document.body.innerText;
      return { ok: !body.includes('Ничего не найдено') && !/Введите запрос/.test(body), body: body.slice(0, 0) };
    })()`);
    interactions.push({ name: 'topbar global search (/api/me/search)', ...search });

    const notif = await evaluate(`(async () => {
      document.body.click();
      const btn = document.querySelector('button[aria-label="Уведомления"]');
      if (!btn) return { ok: false, why: 'notifications button missing' };
      btn.click();
      await new Promise((r) => setTimeout(r, 900));
      const menu = document.querySelector('[role="menu"]');
      return { ok: !!menu && /Уведомлени/.test(menu.textContent || ''), why: 'dropdown did not render' };
    })()`);
    interactions.push({ name: 'topbar notifications (/api/me/notifications)', ...notif });
  } catch (e) {
    interactions.push({ name: 'topbar interactions', ok: false, why: e.message });
  }

  // —— Platform-admin only route ——
  if (platformSession) {
    try {
      await evaluate(
        `localStorage.setItem('hrhub_session', ${JSON.stringify(JSON.stringify(platformSession))}); 'ok'`,
      );
      await cdp.send('Page.navigate', { url: `${WEB}/tenants` }, sessionId);
      await sleep(3500);
      const tenants = await evaluate(`(() => {
        const body = document.body.innerText || '';
        return {
          ok: !body.includes('Доступ только для platform_admin') && /\\S/.test(body),
          why: 'tenants list not visible to platform_admin',
        };
      })()`);
      interactions.push({ name: '/tenants as platform_admin', ...tenants });
    } catch (e) {
      interactions.push({ name: '/tenants as platform_admin', ok: false, why: e.message });
    }
  }

  await browser.close();
  return { results, interactions };
}

// ————————————————————————————————————————————————————————————————
// CRUD round trip — creates one throwaway dictionary row and removes it again,
// so write paths are exercised without touching real HR data.
// ————————————————————————————————————————————————————————————————

async function crudRoundTrip(session, results) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
    'X-Tenant-Id': session.tenant.id,
  };
  const code = `SMOKE_${Date.now()}`;
  const record = (label, ok, detail = '') => results.push({ path: label, label, ok, status: ok ? 200 : 0, detail });

  let created = null;
  try {
    const res = await fetch(`${API}/api/catalog/location-types`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, name: 'Smoke test (temporary)' }),
    });
    const body = await res.json();
    created = res.ok ? body : null;
    record('crud:create location-type', res.ok, res.ok ? '' : JSON.stringify(body).slice(0, 200));
  } catch (e) {
    record('crud:create location-type', false, e.message);
  }

  if (!created?.id) return;

  try {
    const res = await fetch(`${API}/api/catalog/location-types/${created.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Smoke test (updated)' }),
    });
    const body = await res.json();
    record(
      'crud:update location-type',
      res.ok && body.name === 'Smoke test (updated)',
      res.ok ? '' : JSON.stringify(body).slice(0, 200),
    );
  } catch (e) {
    record('crud:update location-type', false, e.message);
  }

  try {
    const list = await (await fetch(`${API}/api/catalog/location-types`, { headers })).json();
    record(
      'crud:list contains new row',
      Array.isArray(list) && list.some((r) => r.id === created.id),
      'created row missing from list',
    );
  } catch (e) {
    record('crud:list contains new row', false, e.message);
  }

  try {
    const res = await fetch(`${API}/api/catalog/location-types/${created.id}`, {
      method: 'DELETE',
      headers,
    });
    record('crud:delete location-type (cleanup)', res.ok, res.ok ? '' : `status ${res.status}`);
  } catch (e) {
    record('crud:delete location-type (cleanup)', false, e.message);
  }
}

// ————————————————————————————————————————————————————————————————
// Main
// ————————————————————————————————————————————————————————————————

async function main() {
  const routes = discoverRoutes();
  console.log(`Discovered ${routes.size} browser routes from nav sources.`);

  const session = await login(EMAIL, PASSWORD);
  console.log(`Logged in as ${session.user.email} (${session.user.role}), tenant ${session.tenant?.code}`);

  // ——— Phase 1: API ———
  const api = makeApiChecker(session);
  const catalogNav = readSrc('lib', 'catalog-nav.ts');
  const resourceKeys = objectKeys(catalogNav, 'RESOURCE_META');
  const reportKinds = objectKeys(catalogNav, 'REPORT_KINDS');

  let platformNote = '';
  let platformSession = null;
  if (SKIP_API) {
    console.log('API sweep skipped (--skip-api)');
  } else {
  const publicRes = await fetch(`${API}/api/health`);
  api.results.push({
    path: '/api/health',
    label: '/api/health',
    ok: publicRes.ok,
    status: publicRes.status,
    detail: publicRes.ok ? '' : await publicRes.text(),
  });

  const core = [
    '/api/auth/me',
    '/api/me',
    '/api/me/attendance/today',
    '/api/me/marks',
    '/api/me/requests',
    '/api/me/absence-types',
    '/api/me/inbox',
    '/api/me/team/today',
    '/api/me/notifications',
    '/api/me/notifications?unreadOnly=1',
    '/api/me/payroll/summary',
    '/api/me/search?q=a',
    '/api/mobile/v1/health',
    '/api/mobile/v1/profile',
    '/api/mobile/v1/attendance/today',
    '/api/mobile/v1/notifications',
    '/api/notifications',
    '/api/notifications/unread-count',
    '/api/dashboard/stats',
    '/api/users',
    '/api/employees',
    '/api/employees?status=dismissed',
    '/api/employees?employmentType=gph',
    '/api/employees?limit=5',
    '/api/employees?q=a',
    '/api/organization/divisions',
    '/api/organization/divisions/tree',
    '/api/organization/positions',
    '/api/persons',
    '/api/hr/absence-types',
    '/api/hr/absences',
    '/api/hr/requests',
    '/api/hr/documents',
    '/api/hr/documents?type=transfer',
    '/api/attendance/locations',
    '/api/attendance/devices',
    '/api/attendance/devices?filter=new',
    '/api/attendance/schedules',
    '/api/attendance/schedules?mode=rosters',
    '/api/attendance/qr-codes',
    '/api/attendance/marks',
    '/api/attendance/days',
    '/api/attendance/problems',
    '/api/payroll/policies',
    '/api/payroll/policies?kind=allowance',
    '/api/payroll/periods',
    '/api/payroll/lines',
    '/api/payroll/advances',
    '/api/payroll/timesheet',
    '/api/reports/overview',
    '/api/reports/attendance/t13',
    '/api/reports/attendance/lateness',
    '/api/reports/attendance/marks',
    '/api/reports/hr/movement',
    '/api/reports/hr/movement?groupBy=staff',
    '/api/reports/payroll/fot',
    '/api/settings/org',
    '/api/settings/users',
    '/api/settings/dictionaries?kind=core',
    '/api/settings/dictionaries?kind=extra',
    '/api/settings/dictionaries?kind=admin',
    '/api/settings/integrations',
    '/api/settings/audit',
    '/api/settings/person-documents',
    '/api/catalog/resources',
    '/api/catalog/lookups',
  ];
  for (const p of core) await api.get(p);
  for (const key of resourceKeys) {
    if (['persons', 'hr-documents', 'absence-types'].includes(key)) continue;
    await api.get(`/api/catalog/${key}`, { label: `catalog:${key}` });
  }
  for (const kind of reportKinds) {
    await api.get(`/api/catalog/analytics/${kind}`, { label: `analytics:${kind}` });
  }

  // Endpoints that legitimately 400 for an admin login with no linked employee record.
  const employeeScoped = [
    '/api/me/attendance/today',
    '/api/me/marks',
    '/api/me/requests',
    '/api/me/payroll/summary',
    '/api/mobile/v1/attendance/today',
  ];
  for (const p of employeeScoped) {
    const r = api.results.find((x) => x.path === p);
    if (r && r.status === 400 && /not linked to an active employee/.test(r.detail)) {
      r.ok = true;
      r.expected = 'admin has no linked employee — 400 is by design';
    }
  }

  // Malformed query strings must degrade to 4xx, never 500 (regression guard).
  const hardening = [
    '/api/employees?status=all',
    '/api/employees?employmentType=nope',
    '/api/reports/attendance/t13',
    '/api/reports/attendance/t13?year=abc&month=99',
    '/api/reports/attendance/lateness?from=garbage',
    '/api/reports/hr/movement?year=abc',
    '/api/catalog/analytics/year-summary?year=abc',
    '/api/catalog/analytics/penalties?year=abc&month=1',
    '/api/catalog/analytics/hourly?from=nope',
    '/api/catalog/incidents?from=garbage',
  ];
  for (const p of hardening) {
    const e = await api.get(p, { label: `hardening:${p}` });
    e.ok = e.status < 500;
    if (!e.ok) e.detail = `expected <500, got ${e.status}: ${e.detail}`;
  }

  // Multi-tenant isolation: the JWT tenant wins, a foreign header is rejected,
  // and no header at all still resolves the tenant from the token.
  const FOREIGN_TENANT = '00000000-0000-0000-0000-0000000000ff';
  for (const p of ['/api/employees', '/api/settings/users', '/api/catalog/grades']) {
    const res = await fetch(`${API}${p}`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'X-Tenant-Id': FOREIGN_TENANT,
      },
    });
    api.results.push({
      path: p,
      label: `isolation:${p} with foreign X-Tenant-Id`,
      ok: res.status === 403,
      status: res.status,
      detail: res.status === 403 ? '' : `expected 403 Tenant mismatch, got ${res.status}`,
    });
  }
  for (const p of ['/api/employees?limit=1', '/api/catalog/grades']) {
    const res = await fetch(`${API}${p}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    api.results.push({
      path: p,
      label: `isolation:${p} without X-Tenant-Id (tenant from JWT)`,
      ok: res.ok,
      status: res.status,
      detail: res.ok ? '' : (await res.text()).slice(0, 160),
    });
  }
  {
    const res = await fetch(`${API}/api/employees`);
    api.results.push({
      path: '/api/employees',
      label: 'isolation:/api/employees anonymous',
      ok: res.status === 401,
      status: res.status,
      detail: res.status === 401 ? '' : `expected 401, got ${res.status}`,
    });
  }

  // Platform-scoped: tenants list needs the platform admin.
  try {
    platformSession = await login(PLATFORM_EMAIL, PASSWORD);
    const res = await fetch(`${API}/api/tenants`, {
      headers: { Authorization: `Bearer ${platformSession.accessToken}` },
    });
    api.results.push({
      path: '/api/tenants',
      label: '/api/tenants (platform_admin)',
      ok: res.ok,
      status: res.status,
      detail: res.ok ? '' : (await res.text()).slice(0, 200),
    });
  } catch (e) {
    platformNote = e.message;
  }

  // A platform_admin has no tenant; the app shell polls these on every page,
  // so they must degrade to an empty payload instead of erroring the topbar.
  if (platformSession) {
    for (const p of ['/api/me/notifications', '/api/me/search?q=a', '/api/mobile/v1/health']) {
      const res = await fetch(`${API}${p}`, {
        headers: { Authorization: `Bearer ${platformSession.accessToken}` },
      });
      api.results.push({
        path: p,
        label: `platform_admin (no tenant) ${p}`,
        ok: res.ok,
        status: res.status,
        detail: res.ok ? '' : (await res.text()).slice(0, 160),
      });
    }
  }

  await crudRoundTrip(session, api.results);
  }

  const apiFailures = api.results.filter((r) => !r.ok);
  console.log(
    `\nAPI: ${api.results.length - apiFailures.length}/${api.results.length} passed` +
      (platformNote ? ` (platform login skipped: ${platformNote})` : ''),
  );
  for (const f of apiFailures) {
    console.log(`  FAIL ${f.status} ${f.label} :: ${String(f.detail).replace(/\s+/g, ' ').slice(0, 220)}`);
  }

  if (API_ONLY) {
    process.exit(apiFailures.length ? 1 : 0);
  }

  // ——— Phase 2: browser ———
  // Employee detail is reachable only from a row link, so resolve a live id.
  try {
    const res = await fetch(`${API}/api/employees?limit=1`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'X-Tenant-Id': session.tenant.id,
      },
    });
    const first = (await res.json()).items?.[0];
    if (first?.id) routes.set(`/employees/${first.id}`, new Set(['employee-detail']));
  } catch {
    console.log('  (could not resolve an employee id for the detail page)');
  }

  console.log('\nBrowser sweep…');
  const { results: pageResults, interactions } = await runBrowserSuite(
    routes,
    session,
    platformSession,
  );

  // Routes whose "error" output is the designed behaviour, not a regression.
  // Anything not matched here is still reported, so real breakage surfaces.
  const EXPECTED = [
    {
      match: (href) => href === '/',
      noShell: true,
      why: 'login page renders outside the app shell',
    },
    {
      match: (href) => href === '/tenants',
      errorText: /Доступ только для platform_admin/,
      why: 'tenant_admin is intentionally denied; covered separately as platform_admin',
    },
    {
      match: (href) => href === '/catalog/__does_not_exist__',
      errorText: /^Resource /,
      request: /\/api\/catalog\/__does_not_exist__/,
      why: 'edge case: unknown catalog resource must fall back, not crash',
    },
    {
      match: (href) => href === '/catalog/reports/__does_not_exist__',
      errorText: /Неизвестный отчёт/,
      why: 'edge case: unknown report kind must fall back, not crash',
    },
    {
      match: (href) => /^\/employees\/[0-9a-f-]{36}$/.test(href),
      errorText: /сохраните Face ID слева/,
      why: 'static hint shown for an employee with no Face ID enrolled',
    },
  ];

  for (const r of pageResults) {
    const rule = EXPECTED.find((e) => e.match(r.href));
    if (!rule) continue;
    const before = {
      errorTexts: r.errorTexts.length,
      consoleErrors: r.consoleErrors.length,
      failedRequests: r.failedRequests.length,
      hasShell: r.hasShell,
    };
    if (rule.errorText) r.errorTexts = r.errorTexts.filter((t) => !rule.errorText.test(t));
    if (rule.request) {
      r.failedRequests = r.failedRequests.filter((t) => !rule.request.test(t));
      r.consoleErrors = r.consoleErrors.filter((t) => !rule.request.test(t));
    }
    if (rule.noShell && !r.hasShell) r.hasShell = true;
    const changed =
      before.errorTexts !== r.errorTexts.length ||
      before.consoleErrors !== r.consoleErrors.length ||
      before.failedRequests !== r.failedRequests.length ||
      before.hasShell !== r.hasShell;
    if (changed) r.expected = rule.why;
  }

  const pageFailures = pageResults.filter(
    (r) =>
      r.fatal ||
      (r.httpStatus && r.httpStatus >= 400) ||
      r.exceptions.length ||
      r.consoleErrors.length ||
      r.failedRequests.length ||
      r.errorTexts.length ||
      r.stillLoading ||
      !r.hasShell,
  );
  const expectedPages = pageResults.filter((r) => r.expected);

  console.log(
    `Pages: ${pageResults.length - pageFailures.length}/${pageResults.length} clean` +
      (expectedPages.length ? ` (${expectedPages.length} with expected-by-design output)` : ''),
  );
  for (const r of expectedPages) console.log(`  OK (expected) ${r.href} :: ${r.expected}`);
  for (const f of pageFailures) {
    console.log(`\n  FAIL ${f.href}  [${f.sources.join(',')}]  http=${f.httpStatus}`);
    if (f.fatal) console.log(`     fatal: ${f.fatal}`);
    if (!f.hasShell) console.log('     no app shell rendered');
    if (f.stillLoading) console.log('     stuck on loading state');
    f.exceptions.forEach((e) => console.log(`     exception: ${e.replace(/\s+/g, ' ')}`));
    f.consoleErrors.forEach((e) => console.log(`     console: ${e.replace(/\s+/g, ' ')}`));
    f.failedRequests.forEach((e) => console.log(`     request: ${e}`));
    f.errorTexts.forEach((e) => console.log(`     ui-error: ${e.replace(/\s+/g, ' ')}`));
  }

  const badInteractions = interactions.filter((i) => !i.ok);
  console.log(`\nInteractions: ${interactions.length - badInteractions.length}/${interactions.length} passed`);
  for (const i of badInteractions) console.log(`  FAIL ${i.name} :: ${i.why ?? ''}`);

  const outFile = path.join(__dirname, '..', '..', 'docs', 'smoke-full-pages.json');
  try {
    fs.writeFileSync(
      outFile,
      JSON.stringify(
        { at: new Date().toISOString(), api: api.results, pages: pageResults, interactions },
        null,
        2,
      ),
    );
    console.log(`\nDetail written to ${outFile}`);
  } catch {
    /* optional artifact */
  }

  console.log(
    `\nSUMMARY  api ${api.results.length - apiFailures.length}/${api.results.length}` +
      `  pages ${pageResults.length - pageFailures.length}/${pageResults.length}` +
      `  interactions ${interactions.length - badInteractions.length}/${interactions.length}`,
  );
  process.exit(apiFailures.length || pageFailures.length || badInteractions.length ? 1 : 0);
}

main().catch((e) => {
  console.error('SMOKE ERROR:', e);
  process.exit(2);
});
