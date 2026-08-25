/**
 * Зарплата — barcha API smoke + bog‘langan kataloglar + Chrome list/new.
 * Usage: node scripts/smoke-payroll-fullstack.js
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
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrhub-payroll-'));
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
  let last = { body: '', stillLoading: true, hasServerError: false, href };
  for (let i = 0; i < 20; i++) {
    await sleep(i === 0 ? 1500 : 400);
    last = await evaluate(
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
    if (!last.stillLoading && /(создать|сохранить|добавить|провести)/i.test(fold(last.body))) break;
  }
  return last;
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

  const apiSmokes = [
    'smoke-fine-policies.js',
    'smoke-allowance-policies.js',
    'smoke-timesheets.js',
    'smoke-accruals.js',
    'smoke-settlements.js',
    'smoke-vedomost.js',
    'smoke-manual-ops.js',
    'smoke-gph-services.js',
    'smoke-sales-accruals.js',
    'smoke-one-time-accruals.js',
    'smoke-loans.js',
    'smoke-payment-orders.js',
    'smoke-travel-expenses.js',
    'smoke-bonus-accruals.js',
    'smoke-payroll-links.js',
  ];

  console.log('—— 1) API smokes (Зарплата + bog‘lanishlar) ——');
  for (const file of apiSmokes) {
    const r = spawnSync(process.execPath, [path.join('scripts', file)], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    if (r.status !== 0) {
      failed.push(`API ${file}: ${(r.stdout || r.stderr || '').slice(-500)}`);
      console.error(`✗ API ${file}`);
      if (r.stdout) console.error(r.stdout.slice(-800));
      if (r.stderr) console.error(r.stderr.slice(-400));
    } else {
      pass(`API ${file}`);
    }
  }

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  assert(login.ok, `login ${login.status}`);
  const session = login.data;

  const pages = [
    ['list Политики штрафов', '/payroll/fine-policies', ['Политики штрафов', 'Создать']],
    ['new Политика штрафов', '/payroll/fine-policies/new', ['Сохранить', 'Закрыть']],
    ['list Политики выплат', '/payroll/allowance-policies', ['Политики выплат', 'Добавить']],
    ['new Политика выплат', '/payroll/allowance-policies/new', ['Сохранить', 'Закрыть']],
    ['list Табель', '/payroll/timesheets', ['Табель', 'Создать']],
    ['new Табель', '/payroll/timesheets/new', ['Сохранить', 'Закрыть']],
    ['list Все начисления', '/payroll/accruals', ['Все начисления', 'Создать']],
    ['new Все начисления', '/payroll/accruals/new', ['Сохранить', 'Провести', 'Закрыть']],
    ['list Взаиморасчеты', '/catalog/settlements', ['Взаиморасчеты', 'Создать']],
    ['new Взаиморасчеты', '/catalog/settlements/new', ['Взаимозачет', 'Провести', 'Закрыть']],
    ['sibling Парные счета', '/catalog/account-pairs', ['Парные счета']],
    ['list Ведомость', '/payroll/vedomost', ['Ведомость', 'Добавить ведомость']],
    ['new Ведомость', '/payroll/vedomost/new', ['Сохранить', 'Закрыть']],
    ['list Ручные операции', '/payroll/manual', ['Ручные операции', 'Создать']],
    ['new Ручные операции', '/payroll/manual/new', ['Сохранить', 'Закрыть']],
    ['list ГПХ услуги', '/catalog/gph-services', ['услуг']],
    ['sibling Договор ГПХ', '/catalog/gph-contracts', ['Договор ГПХ']],
    ['list Проценты от продаж', '/catalog/sales-accruals', ['продаж', 'Создать']],
    ['new Проценты от продаж', '/catalog/sales-accruals/new', ['Сохранить', 'Провести', 'Закрыть']],
    ['sibling Настройка процентов', '/catalog/sales-policies', ['процент']],
    ['list Разовые начисления', '/catalog/one-time-accruals', ['Разовые начисления', 'Создать']],
    ['new Разовые начисления', '/catalog/one-time-accruals/new', ['Сохранить', 'Провести', 'Закрыть']],
    ['list Займы', '/catalog/loans', ['Займы', 'Создать']],
    ['new Заем', '/catalog/loans/new', ['Сохранить', 'Завершить', 'Закрыть']],
    ['list Поручения', '/catalog/payment-orders', ['Поручения', 'Создать']],
    ['new Поручение', '/catalog/payment-orders/new', ['Сохранить', 'Закрыть']],
    ['list Авансовый отчет', '/catalog/travel-expenses', ['Авансовый отчет по командировке', 'Создать']],
    ['new Авансовый отчет', '/catalog/travel-expenses/new', ['Сохранить', 'Завершить', 'Закрыть']],
    ['sibling Командировки', '/catalog/internal-trips', ['командиров']],
    ['list Бонусные начисления', '/catalog/bonus-accruals', ['Бонусные начисления', 'Создать']],
    ['new Бонус Факт', '/catalog/bonus-accruals/new?kind=fact', ['Бонусное начисление - Факт', 'Сохранить', 'Провести', 'Тип факта']],
    ['new Бонус КПЭ', '/catalog/bonus-accruals/new?kind=kpi', ['Бонусные начисления - КПЭ', 'Сохранить', 'Провести']],
    ['sibling Начисления (справочник)', '/catalog/accrual-types', ['Начисления']],
    ['sibling Удержания', '/catalog/deduction-types', ['Удержания']],
    ['sibling Типы фактов', '/catalog/fact-types', ['факт']],
    ['payroll dashboard', '/payroll', ['Табель']],
    ['payroll periods', '/payroll?tab=periods', ['период']],
    ['payroll vedomost tab', '/payroll?tab=vedomost', ['Ведомость']],
    ['payroll advances', '/payroll?tab=advances', ['Аванс']],
  ];

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
    await cdp.send('Page.reload', {}, sessionId);
    await sleep(1500);

    console.log('—— 2) Chrome Зарплата pages + siblings ——');
    for (const [name, href, labels] of pages) {
      await check(name, async () => {
        const p = await openPage(cdp, sessionId, href);
        assert(!p.hasServerError, p.body.slice(0, 400));
        mustHave(p.body, labels, href);
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
  console.log('✓ Зарплата fullstack + bog‘lanishlar ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
