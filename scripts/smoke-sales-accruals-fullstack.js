/**
 * Начисления процентов от продаж — API persist + authenticated Chrome pages.
 * Usage: node scripts/smoke-sales-accruals-fullstack.js
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
  if (!bin) throw new Error('Chrome/Edge topilmadi — CHROME_PATH ni belgilang');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrhub-sales-'));
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
      return {
        href: location.pathname + location.search,
        body,
        stillLoading: /^\\s*(Загрузка…|Переход)/.test(body.trim()),
        hasServerError: /internal server error|application error|ошибка загрузки/i.test(body),
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
    throw new Error(`${where}: yo‘q — ${missing.join(', ')}\n---\n${String(body).slice(0, 700)}`);
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

  console.log('—— 1) API smoke:sales-accruals ——');
  const apiSmoke = spawnSync(process.execPath, [path.join('scripts', 'smoke-sales-accruals.js')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (apiSmoke.status !== 0) {
    throw new Error(`API smoke fail:\n${apiSmoke.stdout}\n${apiSmoke.stderr}`);
  }
  pass('API persist + rates/fill/post');

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  assert(login.ok, `login ${login.status}`);
  const session = login.data;
  const token = session.accessToken;
  const tenant = session.tenant?.id || session.user?.tenantId;
  const auth = { token, tenant };

  const emps = await req('GET', '/api/employees?status=active&limit=20', auth);
  const empItems = Array.isArray(emps.data) ? emps.data : emps.data.items || [];
  const emp = empItems[0];
  assert(emp, 'employee');

  const seeded = await req('POST', '/api/payroll/sales-accruals', {
    ...auth,
    body: {
      docDate: '2026-08-18',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-18',
      paymentType: 'cash',
      cashbox: 'Основная касса',
      note: 'SMOKE_SALES_UI',
      lines: [{ employeeId: emp.id, percent: 5, salesAmount: 100000 }],
    },
  });
  assert(seeded.ok, `seed ${seeded.status} ${JSON.stringify(seeded.data)}`);
  const docId = seeded.data.id;
  const docNumber = seeded.data.number;

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

    await check('list Начисления процентов от продаж', async () => {
      const p = await openPage(cdp, sessionId, '/catalog/sales-accruals');
      assert(!p.stillLoading && !p.hasServerError, p.body.slice(0, 400));
      mustHave(
        p.body,
        [
          'Начисления процентов от продаж',
          'Настройка процентов продаж',
          'Дата',
          'Номер',
          'Дата начала',
          'Дата окончания',
          'Тип начисление',
          'Сумма',
          'Проведен',
          docNumber,
          'Наличные',
        ],
        'list',
      );
    });

    await check('new form', async () => {
      const p = await openPage(cdp, sessionId, '/catalog/sales-accruals/new');
      assert(!p.hasServerError, p.body.slice(0, 400));
      mustHave(
        p.body,
        [
          'Начисление процентов от продаж (создание)',
          'Сохранить',
          'Провести',
          'Закрыть',
          'Дата начала',
          'Тип оплаты',
          'Наличные',
          'Безналичные',
          'Касса',
          'Рассчитать',
          'Выбрать сотрудников',
          'Заполнить',
        ],
        'new',
      );
    });

    await check('settings Настройка процентов продаж', async () => {
      const p = await openPage(cdp, sessionId, '/catalog/sales-policies');
      assert(!p.hasServerError, p.body.slice(0, 400));
      mustHave(p.body, ['Настройка процентов продаж', 'Должность', 'Личные продажи', 'Продажи подразделения'], 'settings');
    });

    await check('regression Договор ГПХ', async () => {
      const p = await openPage(cdp, sessionId, '/catalog/gph-contracts');
      assert(!p.hasServerError, p.body.slice(0, 300));
      mustHave(p.body, ['Договор ГПХ'], 'gph-contracts');
    });

    await check('regression Ведомость', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/vedomost');
      assert(!p.hasServerError, p.body.slice(0, 300));
      mustHave(p.body, ['Ведомость'], 'vedomost');
    });
  } finally {
    if (browser) await browser.close();
    if (docId) {
      await req('POST', `/api/payroll/sales-accruals/${docId}/unpost`, auth);
      await req('DELETE', `/api/payroll/sales-accruals/${docId}`, auth);
    }
  }

  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length) throw new Error(failed.join('\n'));
  console.log('✓ sales-accruals fullstack + regression ok');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
