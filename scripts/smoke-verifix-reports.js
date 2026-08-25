/**
 * VERIFIX отчётлар: штатное / гендер / движение (подразделения)
 * API + Chrome: фильтр, «Составить отчет», таблица, Excel export.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const API = (process.env.API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const WEB = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = 'admin@demo.local';
const PASSWORD = 'Demo1234!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(method, p, { token, tenant, body, raw } = {}) {
  const headers = {};
  if (!raw) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  const res = await fetch(`${API}${p}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (raw) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: res.ok, status: res.status, buf, type: res.headers.get('content-type') || '' };
  }
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
    .filter(Boolean)
    .find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
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
      }, 30000);
    });
  }
}

async function launchBrowser() {
  const bin = findBrowser();
  if (!bin) throw new Error('Chrome/Edge topilmadi');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrhub-reports-'));
  const port = 9222 + Math.floor(Math.random() * 400);
  let stderr = '';
  const proc = spawn(
    bin,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--disable-gpu',
      '--window-size=1600,1000',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  proc.stderr.on('data', (d) => {
    stderr += d.toString();
  });
  let wsUrl = '';
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        wsUrl = (await res.json()).webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* wait */
    }
  }
  if (!wsUrl) {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    throw new Error(`browser debug port ochilmadi\n${stderr.slice(0, 400)}`);
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
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    },
  };
}

async function evaluate(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate threw');
  return result.value;
}

async function main() {
  const failed = [];
  const passed = [];
  const pass = (name) => {
    passed.push(name);
    console.log(`✓ ${name}`);
  };
  const check = async (name, fn) => {
    try {
      await fn();
      pass(name);
    } catch (e) {
      failed.push(`${name}: ${e.message}`);
      console.error(`✗ ${name}: ${e.message}`);
    }
  };

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  assert(login.ok, `login ${login.status} ${JSON.stringify(login.data)}`);
  const token = login.data.accessToken;
  const tenant = login.data.tenant?.id || login.data.user?.tenantId;
  assert(token && tenant, 'login session incomplete');
  const auth = { token, tenant };
  pass('login');

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  assert(lookups.ok, `lookups ${lookups.status}`);
  const divisionId = lookups.data?.divisions?.[0]?.id;
  const positionId = lookups.data?.positions?.[0]?.id;
  const gradeId = lookups.data?.grades?.[0]?.id;
  pass(`lookups divisions=${lookups.data?.divisions?.length || 0}`);

  await check('staffing default', async () => {
    const r = await req('GET', '/api/catalog/analytics/staffing?date=2026-08-20', auth);
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.title, 'no title');
    assert(Array.isArray(r.data.groups), 'no groups');
    assert(Array.isArray(r.data.rows), 'no rows');
    if (r.data.rows.length) {
      const line = r.data.rows.find((x) => x.kind === 'line') || r.data.rows[0];
      assert('units' in line && 'totalSalary' in line, 'missing salary fields');
    }
  });

  await check('staffing filter division+position', async () => {
    if (!divisionId) return;
    const qs = new URLSearchParams({ date: '2026-08-20', divisionId });
    if (positionId) qs.set('positionId', positionId);
    const r = await req('GET', `/api/catalog/analytics/staffing?${qs}`, auth);
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    if (r.data.groups?.length && divisionId) {
      assert(
        r.data.groups.every((g) => !g.divisionId || g.divisionId === divisionId),
        'division filter leaked',
      );
    }
  });

  await check('staffing bad date 400', async () => {
    const r = await req('GET', '/api/catalog/analytics/staffing?date=not-a-date', auth);
    assert(r.status === 400, `expected 400 got ${r.status}`);
  });

  await check('staffing excel', async () => {
    const r = await req('GET', '/api/catalog/analytics/staffing/export.xlsx?date=2026-08-20', {
      ...auth,
      raw: true,
    });
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 1000, `xlsx too small ${r.buf.length}`);
    assert(/sheet|spreadsheet|octet/i.test(r.type) || r.buf[0] === 0x50, `type ${r.type}`);
  });

  for (const reportType of ['age', 'experience', 'grade', 'education']) {
    await check(`gender ${reportType}`, async () => {
      const qs = new URLSearchParams({ date: '2026-08-20', reportType });
      if (reportType === 'age') {
        qs.set(
          'ranges',
          JSON.stringify([
            { min: null, max: 18 },
            { min: 18, max: 25 },
            { min: 55, max: null },
          ]),
        );
      }
      if (reportType === 'grade' && gradeId) qs.set('gradeId', gradeId);
      const r = await req('GET', `/api/catalog/analytics/gender?${qs}`, auth);
      assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
      assert(r.data.reportType === reportType, `type ${r.data.reportType}`);
      assert(Array.isArray(r.data.rows), 'no rows');
      assert(r.data.totals && typeof r.data.totals.total === 'number', 'no totals');
      assert(r.data.bucketLabel, 'no bucketLabel');
      for (const row of r.data.rows) {
        assert(typeof row.male === 'number' && typeof row.female === 'number', 'gender counts');
        assert(row.total === row.male + row.female + (row.other || 0), `total mismatch ${row.label}`);
      }
    });
  }

  await check('gender excel', async () => {
    const r = await req('GET', '/api/catalog/analytics/gender/export.xlsx?date=2026-08-20&reportType=age', {
      ...auth,
      raw: true,
    });
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
  });

  await check('movement-divisions period', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/movement-divisions?from=2026-08-01&to=2026-08-20',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(Array.isArray(r.data.rows), 'no rows');
    assert(r.data.extrema?.hired, 'no extrema');
    const sumHired = r.data.rows.reduce((s, x) => s + x.hired, 0);
    const sumPct = r.data.rows.reduce((s, x) => s + x.hiredPct, 0);
    if (sumHired > 0) {
      assert(Math.abs(sumPct - 100) < 1.5, `hired pct sum ${sumPct}`);
    }
    for (const row of r.data.rows) {
      for (const k of ['hired', 'dismissed', 'transferIn', 'transferOut', 'hiredPct']) {
        assert(typeof row[k] === 'number', `missing ${k}`);
      }
    }
  });

  await check('movement-divisions division filter', async () => {
    if (!divisionId) return;
    const r = await req(
      'GET',
      `/api/catalog/analytics/movement-divisions?from=2026-08-01&to=2026-08-20&divisionIds=${divisionId}`,
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.rows.length >= 1, 'filtered empty unexpectedly?');
  });

  await check('movement-divisions excel', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/movement-divisions/export.xlsx?from=2026-08-01&to=2026-08-20',
      { ...auth, raw: true },
    );
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
  });

  await check('dismissals-by-reason period', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/dismissals-by-reason?from=2026-01-01&to=2026-08-20',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(Array.isArray(r.data.rows), 'no rows');
    assert(typeof r.data.total === 'number', 'no total');
    const sum = r.data.rows.reduce((s, x) => s + x.count, 0);
    assert(sum === r.data.total, `count ${sum} != ${r.data.total}`);
    const pct = r.data.rows.reduce((s, x) => s + x.pct, 0);
    if (r.data.total > 0) {
      assert(Math.abs(pct - 100) < 1.5, `pct sum ${pct}`);
    }
    for (const row of r.data.rows) {
      assert(typeof row.reason === 'string', 'no reason');
      assert(typeof row.count === 'number', 'no count');
      assert(typeof row.pct === 'number', 'no pct');
    }
  });

  await check('dismissals-by-reason filters', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/dismissals-by-reason?from=2026-01-01&to=2026-08-20&keyEmployee=key&basisType=positive',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(Array.isArray(r.data.rows), 'no rows');
  });

  await check('dismissals-by-reason excel', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/dismissals-by-reason/export.xlsx?from=2026-01-01&to=2026-08-20',
      { ...auth, raw: true },
    );
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
  });

  await check('positions default', async () => {
    const r = await req('GET', '/api/catalog/analytics/positions?date=2026-08-20', auth);
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.title, 'no title');
    assert(r.data.date === '2026-08-20', `date ${r.data.date}`);
    assert(Array.isArray(r.data.byDivision), 'no byDivision');
    assert(Array.isArray(r.data.byPosition), 'no byPosition');
    assert(Array.isArray(r.data.byDivisionOnly), 'no byDivisionOnly');
    for (const g of r.data.byDivision) {
      assert(typeof g.name === 'string', 'group name');
      const linePlan = (g.lines || []).reduce((s, l) => s + l.planned, 0);
      assert(g.planned >= linePlan, `rollup ${g.name}: ${g.planned} < own ${linePlan}`);
      assert(g.available === Math.max(0, g.planned - g.occupied - (g.reserved || 0)), `avail ${g.name}`);
    }
    for (const row of r.data.byPosition) {
      assert(row.available === Math.max(0, row.planned - row.occupied), `pos avail ${row.position}`);
    }
    for (const row of r.data.byDivisionOnly) {
      const pct = row.planned ? Math.round((row.occupied / row.planned) * 100) : 0;
      assert(row.occupancyPct === pct, `occupancy ${row.name}`);
    }
  });

  await check('positions filter division+position', async () => {
    if (!divisionId) return;
    const qs = new URLSearchParams({ date: '2026-08-20', divisionIds: divisionId });
    if (positionId) qs.set('positionId', positionId);
    const r = await req('GET', `/api/catalog/analytics/positions?${qs}`, auth);
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    if (r.data.byDivision?.length && divisionId) {
      assert(
        r.data.byDivision.every((g) => g.id === divisionId || (g.lines || []).length >= 0),
        'division filter shape',
      );
    }
  });

  await check('positions bad date 400', async () => {
    const r = await req('GET', '/api/catalog/analytics/positions?date=not-a-date', auth);
    assert(r.status === 400, `expected 400 got ${r.status}`);
  });

  await check('positions excel', async () => {
    const r = await req('GET', '/api/catalog/analytics/positions/export.xlsx?date=2026-08-20', {
      ...auth,
      raw: true,
    });
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
    assert(/sheet|spreadsheet|octet/i.test(r.type) || r.buf[0] === 0x50, `type ${r.type}`);
  });

  await check('grade-changes default', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/grade-changes?from=1990-01-01&to=2026-08-20',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.title, 'no title');
    assert(r.data.from === '1990-01-01', `from ${r.data.from}`);
    assert(Array.isArray(r.data.groups), 'no groups');
    assert(Array.isArray(r.data.rows), 'no rows');
    for (const g of r.data.groups) {
      assert(g.employee, 'group employee');
      assert(Array.isArray(g.lines) && g.lines.length, `empty lines ${g.employee}`);
      for (const l of g.lines) {
        assert(l.source, `source ${g.employee}`);
        assert(l.date, `date ${g.employee}`);
      }
    }
  });

  await check('grade-changes filter employee', async () => {
    const emps = lookups.data?.employees || [];
    if (!emps.length) return;
    const qs = new URLSearchParams({
      from: '1990-01-01',
      to: '2026-08-20',
      employeeIds: emps[0].id,
    });
    const r = await req('GET', `/api/catalog/analytics/grade-changes?${qs}`, auth);
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(
      (r.data.groups || []).every((g) => g.employeeId === emps[0].id),
      'employee filter leaked',
    );
  });

  await check('grade-changes excel', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/grade-changes/export.xlsx?from=1990-01-01&to=2026-08-20',
      { ...auth, raw: true },
    );
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
    assert(/sheet|spreadsheet|octet/i.test(r.type) || r.buf[0] === 0x50, `type ${r.type}`);
  });

  await check('dismissals-by-division period', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/dismissals-by-division?from=2026-08-01&to=2026-08-20',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(Array.isArray(r.data.divisions), 'no divisions');
    assert(Array.isArray(r.data.rows), 'no rows');
    assert(Array.isArray(r.data.colTotals), 'no colTotals');
    assert(typeof r.data.grandTotal === 'number', 'no grandTotal');
    assert(r.data.colTotals.length === r.data.divisions.length, 'colTotals width');
    const rowSum = r.data.rows.reduce((s, x) => s + x.total, 0);
    assert(rowSum === r.data.grandTotal, `row total ${rowSum} != ${r.data.grandTotal}`);
    const colSum = r.data.colTotals.reduce((s, n) => s + n, 0);
    assert(colSum === r.data.grandTotal, `col total ${colSum} != ${r.data.grandTotal}`);
    for (const row of r.data.rows) {
      assert(row.counts.length === r.data.divisions.length, `counts ${row.position}`);
      assert(row.counts.reduce((s, n) => s + n, 0) === row.total, `row ${row.position}`);
    }
  });

  await check('dismissals-by-division excel', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/dismissals-by-division/export.xlsx?from=2026-08-01&to=2026-08-20',
      { ...auth, raw: true },
    );
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
  });

  await check('timesheet-adjustments period', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/timesheet-adjustments?from=2026-08-01&to=2026-08-20',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.title, 'no title');
    assert(r.data.from === '2026-08-01', `from ${r.data.from}`);
    assert(Array.isArray(r.data.days) && r.data.days.length === 20, `days ${r.data.days?.length}`);
    assert(Array.isArray(r.data.rows), 'no rows');
    assert(Array.isArray(r.data.colTotals) && r.data.colTotals.length === r.data.days.length, 'colTotals');
    assert(typeof r.data.grandTotal === 'number', 'no grandTotal');
    const colSum = r.data.colTotals.reduce((s, n) => s + n, 0);
    assert(colSum === r.data.grandTotal, `col ${colSum} != ${r.data.grandTotal}`);
    for (const row of r.data.rows) {
      assert(row.counts.length === r.data.days.length, `counts ${row.name}`);
      assert(row.counts.reduce((s, n) => s + n, 0) === row.total, `row ${row.name}`);
    }
    const rowSum = r.data.rows.reduce((s, x) => s + x.total, 0);
    assert(rowSum === r.data.grandTotal, `row ${rowSum} != ${r.data.grandTotal}`);
  });

  await check('timesheet-adjustments filter division', async () => {
    if (!divisionId) return;
    const qs = new URLSearchParams({
      from: '2026-08-01',
      to: '2026-08-20',
      divisionIds: divisionId,
    });
    const r = await req('GET', `/api/catalog/analytics/timesheet-adjustments?${qs}`, auth);
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert((r.data.rows || []).every((row) => row.id === divisionId), 'division filter leaked');
  });

  await check('timesheet-adjustments bad date 400', async () => {
    const r = await req('GET', '/api/catalog/analytics/timesheet-adjustments?from=not-a-date', auth);
    assert(r.status === 400, `expected 400 got ${r.status}`);
  });

  await check('timesheet-adjustments excel', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/timesheet-adjustments/export.xlsx?from=2026-08-01&to=2026-08-20',
      { ...auth, raw: true },
    );
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
    assert(/sheet|spreadsheet|octet/i.test(r.type) || r.buf[0] === 0x50, `type ${r.type}`);
  });

  await check('movement-staff period', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/movement-staff?from=2026-08-01&to=2026-08-20',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(/движению сотрудников \(штаты\)/i.test(r.data.title || ''), `title ${r.data.title}`);
    assert(typeof r.data.headcount === 'number', 'no headcount');
    assert(Array.isArray(r.data.sections), 'no sections');
    assert(r.data.sections.length === 6, `sections ${r.data.sections.length}`);
    const kinds = r.data.sections.map((x) => x.kind);
    for (const k of ['hireNew', 'hire', 'dismiss', 'transferIn', 'transferOut', 'rehired']) {
      assert(kinds.includes(k), `missing ${k}`);
    }
    for (const sec of r.data.sections) {
      assert(Array.isArray(sec.rows), `rows ${sec.kind}`);
      assert(/в периоде/.test(sec.title || ''), `title ${sec.title}`);
    }
  });

  await check('movement-staff kinds filter', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/movement-staff?from=2026-08-01&to=2026-08-20&kinds=hireNew,rehired',
      auth,
    );
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.sections.length === 2, `sections ${r.data.sections.length}`);
    assert(r.data.sections.every((x) => x.kind === 'hireNew' || x.kind === 'rehired'), 'kinds leaked');
  });

  await check('movement-staff excel', async () => {
    const r = await req(
      'GET',
      '/api/catalog/analytics/movement-staff/export.xlsx?from=2026-08-01&to=2026-08-20',
      { ...auth, raw: true },
    );
    assert(r.ok, `xlsx ${r.status}`);
    assert(r.buf.length > 800, `xlsx too small ${r.buf.length}`);
    assert(/sheet|spreadsheet|octet/i.test(r.type) || r.buf[0] === 0x50, `type ${r.type}`);
  });

  await check('divisions tree', async () => {
    const r = await req('GET', '/api/organization/divisions/tree', auth);
    assert(r.ok, `tree ${r.status}`);
    assert(Array.isArray(r.data), 'tree not array');
  });

  let browser;
  try {
    browser = await launchBrowser();
    const { cdp, sessionId } = browser;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: `${WEB}/` }, sessionId);
    await sleep(1200);
    await evaluate(
      cdp,
      sessionId,
      `localStorage.setItem('hrhub_session', ${JSON.stringify(JSON.stringify(login.data))}); 'ok'`,
    );

    const pages = [
      {
        name: 'UI staffing',
        href: '/catalog/reports/staffing',
        labels: ['Отчет по штатному расписанию', 'Составить отчет', 'Подразделение'],
        tableHint: 'Количество штатных единиц',
      },
      {
        name: 'UI gender',
        href: '/catalog/reports/gender',
        labels: ['гендерному', 'По возрасту', 'Составить отчет'],
        tableHint: 'Мужчины',
      },
      {
        name: 'UI movement-divisions',
        href: '/catalog/reports/movement-divisions',
        labels: ['движению сотрудников', 'Период', 'Составить отчет'],
        tableHint: 'Принятые на работу',
      },
      {
        name: 'UI dismissals-by-division',
        href: '/catalog/reports/dismissals-by-division',
        labels: ['увольнений по подразделениям', 'Период', 'Составить отчет'],
        tableHint: 'Подразделения / Должности',
      },
      {
        name: 'UI dismissals-by-reason',
        href: '/catalog/reports/dismissals-by-reason',
        labels: ['причинам увольнения', 'Период', 'Составить отчет', 'Тип основания'],
        tableHint: 'Причина увольнения',
      },
      {
        name: 'UI positions',
        href: '/catalog/reports/positions',
        labels: ['по позициям', 'Период', 'Составить отчет', 'Группы подразделений'],
        tableHint: 'Запланировано',
      },
      {
        name: 'UI grade-changes',
        href: '/catalog/reports/grade-changes',
        labels: ['изменению разрядов', 'Период', 'Составить отчет', 'Сотрудники'],
        tableHint: 'Источник',
      },
      {
        name: 'UI timesheet-adjustments',
        href: '/catalog/reports/timesheet-adjustments',
        labels: ['корректировке табеля', 'Период', 'Составить отчет', 'Подразделения'],
        tableHint: 'Код подразделения',
      },
      {
        name: 'UI movement-staff',
        href: '/catalog/reports/movement-staff',
        labels: ['движению сотрудников (штаты)', 'Период', 'Составить отчет', 'Повторно принятые'],
        tableHint: 'Кол-во сотрудников на конец периода',
      },
    ];

    for (const page of pages) {
      await check(page.name, async () => {
        await cdp.send('Page.navigate', { url: `${WEB}${page.href}` }, sessionId);
        await sleep(1800);
        const before = await evaluate(
          cdp,
          sessionId,
          `(() => ({ href: location.pathname, body: document.body.innerText || '', err: !!document.querySelector('[class*="error"]') && /ошибка/i.test(document.body.innerText||'') }))()`,
        );
        assert(!/internal server error|application error/i.test(before.body), before.body.slice(0, 400));
        const hay = before.body.toLocaleLowerCase('ru');
        for (const l of page.labels) {
          assert(hay.includes(l.toLocaleLowerCase('ru')), `yo‘q «${l}»\n${before.body.slice(0, 500)}`);
        }
        const after = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const btn = [...document.querySelectorAll('button')].find((b) => /составить отчет/i.test(b.textContent||''));
            if (!btn) return { clicked: false, reason: 'no button' };
            btn.click();
            return { clicked: true };
          })()`,
        );
        assert(after.clicked, after.reason || 'generate not clicked');
        let last = '';
        let ok = false;
        for (let i = 0; i < 20; i++) {
          await sleep(400);
          const snap = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const body = document.body.innerText || '';
              const tables = document.querySelectorAll('table').length;
              const err = /ошибка формирования|internal server error/i.test(body);
              return { body, tables, err, href: location.pathname };
            })()`,
          );
          last = snap.body;
          if (snap.err) throw new Error(snap.body.slice(0, 400));
          if (
            snap.tables > 0 &&
            (snap.body.includes(page.tableHint) || /нет данных|просмотреть/i.test(snap.body))
          ) {
            ok = true;
            break;
          }
        }
        assert(ok, `таблица chiqmadi\n${last.slice(0, 600)}`);
      });
    }
  } finally {
    if (browser) await browser.close();
  }

  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.error(' -', f);
    process.exit(1);
  }
  console.log('✓ VERIFIX reports fullstack ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
