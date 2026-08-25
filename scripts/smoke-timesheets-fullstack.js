/**
 * Timesheets — API persist + authenticated Chrome pages.
 * Usage: node scripts/smoke-timesheets-fullstack.js
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

  console.log('—— 1) API smoke:timesheets ——');
  const apiSmoke = spawnSync(process.execPath, [path.join('scripts', 'smoke-timesheets.js')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (apiSmoke.status !== 0) {
    throw new Error(`API smoke fail:\n${apiSmoke.stdout}\n${apiSmoke.stderr}`);
  }
  pass('API persist (create/get/patch/post/cancel/fill/settings/bulk)');

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

  const leftovers = await req('GET', '/api/payroll/timesheets', auth);
  const leftoverIds = (leftovers.data || [])
    .filter((r) => String(r.note || '').startsWith('UI_'))
    .map((r) => r.id);
  if (leftoverIds.length) {
    await req('POST', '/api/payroll/timesheets/bulk-delete', {
      ...auth,
      body: { ids: leftoverIds },
    });
  }

  const stamp = Date.now().toString(36);
  const created = await req('POST', '/api/payroll/timesheets', {
    ...auth,
    body: {
      docDate: '2024-07-02',
      month: '2024-07-01',
      note: `UI_${stamp}`,
    },
  });
  assert(created.ok, `ui create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  const number = created.data.number;

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

    await check('list /payroll/timesheets', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/timesheets');
      assert(!p.stillLoading, 'loadingda qolib ketdi');
      mustHave(
        p.body,
        ['Табель', 'Корректировки табеля', 'СОЗДАТЬ', 'НАСТРОЙКИ', 'месяц'],
        'list',
      );
      mustHave(p.body, ['Июль 2024', number], 'created row');
      const search = await evaluate(
        cdp,
        sessionId,
        `!!document.querySelector('input[placeholder="Поиск..."]')`,
      );
      assert(search, 'Поиск... input yo‘q');
      const monthPh = await evaluate(
        cdp,
        sessionId,
        `!!document.querySelector('input[type="date"]')`,
      );
      assert(monthPh, 'месяц date input yo‘q');
    });

    await check('settings modal', async () => {
      await openPage(cdp, sessionId, '/payroll/timesheets');
      const clicked = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            (b.innerText || '').includes('НАСТРОЙКИ'),
          );
          if (!btn) return { ok: false, why: 'settings btn' };
          btn.click();
          return { ok: true };
        })()`,
      );
      assert(clicked.ok, clicked.why || 'settings');
      await sleep(300);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(
        body,
        [
          'Настройки табеля',
          'Выберите виды рабочего времени',
          'Все виды рабочего времени',
          'Настройки по детали',
          'По плану (дней)',
          'По плану (часы)',
          'Отработано часов',
          'Отработано дней',
          'Сохранить',
          'Закрыть',
        ],
        'settings modal',
      );
    });

    await check('create form', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/timesheets/new');
      mustHave(
        p.body,
        [
          'Табель (создание)',
          'СОХРАНИТЬ',
          'ПРОВЕСТИ',
          'ЗАКРЫТЬ',
          'Дата',
          'Номер',
          'Месяц',
          'Подразделение',
          'Тип периода',
          'Полный месяц',
          'Примечание',
          'Итого',
          'Детали',
          'Добавить',
          'Заполнить',
          'Выбрать',
          'нет данных',
        ],
        'new',
      );
      const search = await evaluate(
        cdp,
        sessionId,
        `!!document.querySelector('input[placeholder="Поиск"]') || !!document.querySelector('input[placeholder="Поиск..."]')`,
      );
      assert(search, 'Поиск lookup yo‘q');
    });

    await check('details tab + picker', async () => {
      await openPage(cdp, sessionId, '/payroll/timesheets/new');
      const clicked = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const tab = [...document.querySelectorAll('button')].find((b) =>
            (b.innerText || '').trim() === 'Детали',
          );
          if (!tab) return { ok: false, why: 'details tab' };
          tab.click();
          return { ok: true };
        })()`,
      );
      assert(clicked.ok, clicked.why);
      await sleep(200);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(body, ['Виды рабочего времени'], 'details');
      const pick = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            (b.innerText || '').trim() === 'Выбрать',
          );
          if (!btn) return { ok: false, why: 'select btn' };
          btn.click();
          return { ok: true };
        })()`,
      );
      assert(pick.ok, pick.why);
      await sleep(800);
      const picker = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(picker, ['Сотрудники', 'Табельный номер', 'ФИО', 'ЗАКРЫТЬ'], 'picker');
    });

    await check('corrections tab', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/timesheets?tab=corrections');
      mustHave(p.body, ['Корректировки табеля', 'СОЗДАТЬ'], 'corr tab');
    });

    await check('correction create single', async () => {
      const p = await openPage(cdp, sessionId, '/catalog/timesheet-adjustments/new');
      mustHave(
        p.body,
        [
          'Корректировка табеля (создание)',
          'СОХРАНИТЬ',
          'ПРОВЕСТИ',
          'ЗАКРЫТЬ',
          'Фильтровать по Департаментам',
          'Дата корректировки',
          'Сотрудники с посещениями',
          'Сотрудники без посещения',
          'Выбрать',
        ],
        'corr new',
      );
    });

    await check('correction create list', async () => {
      const p = await openPage(cdp, sessionId, '/catalog/timesheet-adjustments/new?batch=1');
      mustHave(
        p.body,
        [
          'Корректировка табеля списком (создание)',
          'Период корректировки',
          'Обеденное время',
          'Учитывать',
          'Подбор',
          'Наполнение плана',
        ],
        'batch new',
      );
      const vals = await evaluate(
        cdp,
        sessionId,
        `[...document.querySelectorAll('input')].map((i) => i.value).join(' | ')`,
      );
      assert(fold(vals).includes(fold('Без ограничений')), `limits ${vals}`);
    });

    await check('redirect /payroll?tab=timesheet', async () => {
      await openPage(cdp, sessionId, '/payroll?tab=timesheet');
      await sleep(800);
      const href = await evaluate(cdp, sessionId, `location.pathname + location.search`);
      assert(href.startsWith('/payroll/timesheets'), `redirect emas: ${href}`);
    });

    await check('row actions Просмотреть / Изменить', async () => {
      await openPage(cdp, sessionId, '/payroll/timesheets');
      const clicked = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const row = [...document.querySelectorAll('tr')].find((tr) =>
            (tr.innerText || '').includes(${JSON.stringify(number)}),
          );
          if (!row) return { ok: false, why: 'row missing' };
          row.click();
          return { ok: true };
        })()`,
      );
      assert(clicked.ok, clicked.why || 'row click');
      await sleep(300);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(body, ['Просмотреть', 'Изменить'], 'row actions');
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    await req('POST', '/api/payroll/timesheets/bulk-delete', {
      ...auth,
      body: { ids: [id] },
    });
  }

  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.error('  ' + f);
    process.exit(1);
  }
  console.log('✓ timesheets fullstack: API + browser pages ready');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
