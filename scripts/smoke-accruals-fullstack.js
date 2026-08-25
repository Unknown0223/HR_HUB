/**
 * Все начисления — API persist + authenticated Chrome pages.
 * Usage: node scripts/smoke-accruals-fullstack.js
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrhub-acc-'));
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

  console.log('—— 1) API smoke:accruals ——');
  const apiSmoke = spawnSync(process.execPath, [path.join('scripts', 'smoke-accruals.js')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (apiSmoke.status !== 0) {
    throw new Error(`API smoke fail:\n${apiSmoke.stdout}\n${apiSmoke.stderr}`);
  }
  pass('API persist (list/fill/create/post/entries/cancel/kinds/bulk)');

  console.log('\n—— 2) Authenticated web pages ——');
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

  const list = await req('GET', '/api/payroll/accruals', auth);
  const seeded = (list.data || []).find((r) => r.number === '0000000001');
  assert(seeded, 'seeded 0000000001 yo‘q');

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

    await check('list /payroll/accruals', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/accruals');
      assert(!p.stillLoading, 'loadingda qolib ketdi');
      mustHave(
        p.body,
        [
          'Все начисления',
          'Поручения',
          'Создать +',
          'месяц',
          'Месяц начисления',
          'Номер',
          'Тип документа',
          'Начислено в базовой валюте',
          'Удержано в базовой валюте',
          'Проведен',
          '0000000001',
          'Начисление всех видов',
        ],
        'list',
      );
      const search = await evaluate(
        cdp,
        sessionId,
        `!!document.querySelector('input[placeholder="Поиск..."]')`,
      );
      assert(search, 'Поиск... input yo‘q');
    });

    await check('create menu 5 kinds', async () => {
      await openPage(cdp, sessionId, '/payroll/accruals');
      const clicked = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            (b.innerText || '').toLocaleLowerCase('ru').includes('создать'),
          );
          if (!btn) return { ok: false, why: 'create btn' };
          btn.click();
          return { ok: true };
        })()`,
      );
      assert(clicked.ok, clicked.why || 'create');
      await sleep(250);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(
        body,
        [
          'Начисление зарплаты и взносов',
          'Начисление больничных',
          'Начисление командировочных',
          'Начисление отпускных',
          'Начисление всех видов',
        ],
        'create menu',
      );
    });

    await check('new form all_types', async () => {
      const p = await openPage(cdp, sessionId, '/payroll/accruals/new?kind=all_types');
      assert(!p.stillLoading, 'loadingda qolib ketdi');
      mustHave(
        p.body,
        [
          'Начисление всех видов (создание)',
          'Сохранить',
          'Провести',
          'Закрыть',
          'Месяц начисления',
          'Дата',
          'Номер',
          'Название документа',
          'Подразделение',
          'Валюта',
          'Примечание',
          'Начислено',
          'Удержано',
          'НДФЛ',
          'ИНПС',
          'ЕСП',
          'Объединение начислений',
          'Начисления',
          'Удержания',
          'Добавить',
          'Заполнить',
          'Выбрать',
        ],
        'new',
      );
    });

    await check('view seeded doc', async () => {
      const p = await openPage(cdp, sessionId, `/payroll/accruals/${seeded.id}`);
      assert(!p.stillLoading, 'loadingda qolib ketdi');
      mustHave(
        p.body,
        [
          'Начисление всех видов (просмотр)',
          'Отменить',
          'Закрыть',
          'Основная информация',
          'Операции',
          'История изменений',
          'Проведен',
          '0000000001',
          'Месяц начисления',
          'Начислено',
          'Удержано',
        ],
        'view',
      );
    });

    await check('view operations tab', async () => {
      await openPage(cdp, sessionId, `/payroll/accruals/${seeded.id}`);
      const clicked = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            (b.innerText || '').trim() === 'Операции',
          );
          if (!btn) return { ok: false, why: 'ops tab' };
          btn.click();
          return { ok: true };
        })()`,
      );
      assert(clicked.ok, clicked.why);
      await sleep(300);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(
        body,
        ['Сотрудник', 'Начисление', 'Сумма выдачи', 'Тип операции', 'Проводки'],
        'operations',
      );
    });

    await check('view history tab', async () => {
      const clicked = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            (b.innerText || '').includes('История'),
          );
          if (!btn) return { ok: false, why: 'history tab' };
          btn.click();
          return { ok: true };
        })()`,
      );
      assert(clicked.ok, clicked.why);
      await sleep(250);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(body, ['Дата события', 'Пользователь', 'Событие', 'Проведен'], 'history');
    });

    await check('проводки entries', async () => {
      const p = await openPage(cdp, sessionId, `/payroll/accruals/${seeded.id}/entries`);
      assert(!p.stillLoading, 'loadingda qolib ketdi');
      mustHave(
        p.body,
        [
          'Проводки',
          '0000000001',
          'Дата создания',
          'Дата транзакции',
          'Дебет',
          'Кредит',
          'Примечание',
          'Сумма',
          'Курс валют',
          'Сумма в валюте',
          '9420',
          '6710',
        ],
        'entries',
      );
    });

    await check('row actions Проводки', async () => {
      await openPage(cdp, sessionId, '/payroll/accruals');
      const opened = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const cell = [...document.querySelectorAll('td')].find((td) =>
            (td.textContent || '').includes('0000000001'),
          );
          if (!cell) return { ok: false, why: 'row 0000000001' };
          cell.closest('tr')?.click();
          return { ok: true };
        })()`,
      );
      assert(opened.ok, opened.why);
      await sleep(250);
      const body = await evaluate(cdp, sessionId, `document.body.innerText`);
      mustHave(body, ['Просмотреть', 'Проводки', 'Отменить'], 'row actions');
    });
  } finally {
    if (browser) await browser.close();
  }

  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    throw new Error(failed.join('\n'));
  }
  console.log('✓ accruals fullstack ok');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
