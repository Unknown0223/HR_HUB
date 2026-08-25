/**
 * Allowance Policies — API persist + authenticated Chrome pages.
 * Usage: node scripts/smoke-allowance-policies-fullstack.js
 * Needs API :3001, web :3000, Chrome/Edge.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const API = (process.env.API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const WEB = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = 'admin@demo.local';
const PASSWORD = 'Demo1234!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(method, p, { token, tenant, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  const res = await fetch(`${API}${p}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean).find((p) => {
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
  if (!bin) throw new Error('Chrome/Edge topilmadi — CHROME_PATH ni belgilang');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrhub-fp-'));
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
    const m = stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+/i);
    if (m) {
      wsUrl = m[0];
      break;
    }
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
    throw new Error(`browser debug port ochilmadi (${port})\n${stderr.slice(0, 400)}`);
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

async function openPage(cdp, sessionId, href) {
  await cdp.send('Page.navigate', { url: `${WEB}${href}` }, sessionId);
  await sleep(2200);
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const body = document.body ? document.body.innerText || '' : '';
      const href = location.pathname + location.search;
      const err = [...document.querySelectorAll('[class*="error"]')]
        .map((e) => (e.textContent || '').trim())
        .filter((t) => t && t.length < 200 && !/Нет данных|error/i.test(t) === false);
      return {
        href,
        title: document.title,
        body,
        bodyLen: body.length,
        hasHeader: !!document.querySelector('header'),
        stillLoading: /^\\s*(Загрузка…|Переход)/.test(body.trim()),
      };
    })()`,
  );
}

function fold(s) {
  return String(s || '')
    .toLocaleLowerCase('ru')
    .replace(/\s+/g, ' ')
    .trim();
}

function mustHave(body, labels, where) {
  const hay = fold(body);
  const missing = labels.filter((l) => !hay.includes(fold(l)));
  if (missing.length) {
    throw new Error(`${where}: yo‘q — ${missing.join(', ')}\n---\n${String(body).slice(0, 500)}`);
  }
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

  console.log('—— 1) API smoke:allowance-policies ——');
  const apiSmoke = spawnSync(process.execPath, [path.join('scripts', 'smoke-allowance-policies.js')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (apiSmoke.status !== 0) {
    throw new Error(`API smoke fail:\n${apiSmoke.stdout}\n${apiSmoke.stderr}`);
  }
  pass('API persist (create/get/patch/copy/scopes/bulk-delete)');

  console.log('\n—— 2) Live API + web pages ——');
  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  assert(login.ok, `login ${login.status}`);
  const session = login.data;
  const token = session.accessToken;
  const tenant = session.tenant?.id || session.user?.tenantId;
  assert(token && tenant, 'token/tenant');
  const auth = { token, tenant };

  const web = await fetch(WEB);
  assert(web.ok, `web ${web.status}`);
  pass('web :3000 javob beradi');

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  const division = (lookups.data.divisions || [])[0];
  const schedule = (lookups.data.schedules || [])[0];
  assert(division && schedule, 'lookups yetarli emas');

  const leftovers = await req('GET', '/api/payroll/allowance-policies', auth);
  const leftoverIds = (leftovers.data || [])
    .filter((r) => /^(UI_|SMOKE_AP_|DIV_)/.test(r.name || ''))
    .map((r) => r.id);
  if (leftoverIds.length) {
    await req('POST', '/api/payroll/allowance-policies/bulk-delete', {
      ...auth,
      body: { ids: leftoverIds },
    });
  }

  const stamp = Date.now().toString(36);
  const created = await req('POST', '/api/payroll/allowance-policies', {
    ...auth,
    body: {
      scope: 'company',
      month: '2024-03-01',
      name: `UI_${stamp}`,
      rules: [{ startTime: '18:00', endTime: '22:00', coefficient: 1.5 }],
    },
  });
  assert(created.ok, `ui create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;

  const payrollStill = await req('GET', '/api/payroll/policies', auth);
  assert(payrollStill.ok && Array.isArray(payrollStill.data), 'PayrollPolicy buzilmasin');
  pass('PayrollPolicy (calc) hali ishlaydi');

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
      `localStorage.setItem('hrhub_session', ${JSON.stringify(JSON.stringify(session))}); 'ok'`,
    );

    await check('list /payroll/allowance-policies', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/allowance-policies');
      assert(!p.stillLoading, 'loadingda qolib ketdi');
      mustHave(
        p.body,
        [
          'Политика доплат',
          'По компании',
          'По подразделениям',
          'По графикам работы',
          'Добавить',
        ],
        'list',
      );
      mustHave(p.body, ['Март 2024', `UI_${stamp}`], 'created row');
      const search = await evaluate(
        cdp,
        sessionId,
        `!!document.querySelector('input[placeholder="Поиск..."]')`,
      );
      assert(search, 'Поиск... input yo‘q');
    });

    await check('tabs division/schedule', async () => {
      for (const [tab, extra] of [
        ['division', 'Подразделение'],
        ['schedule', 'График работы'],
      ]) {
        const p = await openPage(cdp, sessionId, `/payroll/allowance-policies?tab=${tab}`);
        mustHave(p.body, ['Политика доплат', 'Добавить', extra], tab);
        assert(p.href.includes(`tab=${tab}`), `url tab=${tab} ${p.href}`);
      }
    });

    await check('create form company', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/allowance-policies/new');
      mustHave(p.body, [
        'Политика доплат (создание)',
        'Сохранить',
        'Закрыть',
        'Общая информация',
        'Месяц',
        'Название',
        'Статус',
        'Активный',
        'Правила',
        'Нет данных',
        'Добавить',
        'Время начала',
        'Время конца',
        'Коэффициент Доплаты',
      ], 'new');
    });

    await check('create form division/schedule fields', async () => {
      const d = await openPage(cdp, sessionId, '/payroll/allowance-policies/new?tab=division');
      mustHave(d.body, ['Подразделение'], 'div form');
      const sch = await openPage(cdp, sessionId, '/payroll/allowance-policies/new?tab=schedule');
      mustHave(sch.body, ['График работы'], 'sch form');
    });

    await check('edit form + add rule row', async () => {
      const p = await openPage(cdp, sessionId, `/payroll/allowance-policies/${id}/edit`);
      mustHave(p.body, ['Политика доплат (изменение)'], 'edit');
      const vals = await evaluate(
        cdp,
        sessionId,
        `[...document.querySelectorAll('input')].map((i) => i.value).join(' | ')`,
      );
      assert(fold(vals).includes(fold(`UI_${stamp}`)), `name input ${vals}`);
      assert(vals.includes('18:00') && vals.includes('22:00'), `times ${vals}`);
      assert(vals.includes('1.5'), `coef ${vals}`);
      const added = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            (b.textContent || '').trim() === 'Добавить' || (b.textContent || '').includes('Добавить'),
          );
          if (!btn) return { ok: false, why: 'add missing' };
          btn.click();
          return { ok: true };
        })()`,
      );
      assert(added.ok, added.why || 'add rule');
      await sleep(300);
      const times = await evaluate(
        cdp,
        sessionId,
        `document.querySelectorAll('input[type="time"]').length`,
      );
      assert(times >= 4, `time inputs ${times}`);
    });

    await check('redirect /payroll?tab=policies&kind=allowance', async () => {
      await openPage(cdp, sessionId, '/payroll?tab=policies&kind=allowance');
      await sleep(800);
      const href = await evaluate(cdp, sessionId, `location.pathname + location.search`);
      assert(
        href.startsWith('/payroll/allowance-policies'),
        `redirect emas: ${href}`,
      );
    });

    await check('row actions Изменить / Удалить / Скопировать', async () => {
      await openPage(cdp, sessionId, '/payroll/allowance-policies');
      const clicked = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const row = [...document.querySelectorAll('tr')].find((tr) =>
            (tr.innerText || '').includes(${JSON.stringify(`UI_${stamp}`)}),
          );
          if (!row) return { ok: false, why: 'row missing' };
          row.click();
          return { ok: true };
        })()`,
      );
      assert(clicked.ok, clicked.why || 'row click');
      await sleep(300);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(body, ['Изменить', 'Удалить', 'Скопировать'], 'row actions');
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    await req('POST', '/api/payroll/allowance-policies/bulk-delete', {
      ...auth,
      body: { ids: [id] },
    });
  }

  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.error('  ' + f);
    process.exit(1);
  }
  console.log('✓ allowance-policies fullstack: API + browser pages ready');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
