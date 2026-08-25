/**
 * Settings section — API smokes + leftover live probes (1C / e-sign / Mehnat / dicts / audit).
 * Usage: node scripts/smoke-settings-fullstack.js
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const API = process.env.API_URL || 'http://127.0.0.1:3001';

const SMOKES = [
  'smoke-system-settings.js',
  'smoke-account-settings.js',
  'smoke-organizations.js',
  'smoke-users-admin.js',
  'smoke-countries.js',
  'smoke-banks.js',
  'smoke-quickstart.js',
  'smoke-photos.js',
  'smoke-person-docs.js',
  'smoke-employment-sources.js',
  'smoke-indicators.js',
  'smoke-avg-salaries.js',
  'smoke-coa.js',
  'smoke-cashboxes.js',
  'smoke-currencies.js',
  'smoke-nationality.js',
  'smoke-artix.js',
  'smoke-iiko.js',
  'smoke-iiko-sales.js',
  'smoke-billz.js',
  'smoke-billz1.js',
];

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runSmoke(file) {
  const r = spawnSync(process.execPath, [path.join('scripts', file)], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  const last = out.split('\n').filter(Boolean).slice(-2).join(' | ');
  return { ok: r.status === 0, last, status: r.status };
}

async function leftoverProbes() {
  const login = await req('POST', '/api/auth/login', {
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  assert(login.ok, `login ${login.status}`);
  const token = login.data.accessToken;
  let tenant = login.data.user?.tenantId || login.data.tenantId;
  if (!tenant) {
    const me = await req('GET', '/api/me', { token });
    tenant = me.data?.tenantId || me.data?.tenant?.id;
  }
  const auth = { token, tenant };
  const notes = [];

  const org = await req('GET', '/api/settings/org', auth);
  assert(org.ok, `org ${org.status}`);

  const system = await req('GET', '/api/settings/system', auth);
  assert(system.ok, `system ${system.status}`);

  const payroll = await req('GET', '/api/settings/payroll-calc', auth);
  assert(payroll.ok, `payroll-calc ${payroll.status}`);

  const account = await req('GET', '/api/settings/account-settings', auth);
  assert(account.ok, `account-settings ${account.status}`);

  const core = await req('GET', '/api/settings/dictionaries?kind=core', auth);
  assert(core.ok && Array.isArray(core.data) && core.data.length >= 10, `core dicts ${core.status}`);

  const extra = await req('GET', '/api/settings/dictionaries?kind=extra', auth);
  assert(extra.ok && Array.isArray(extra.data), `extra dicts ${extra.status}`);

  const edu = (core.data || []).find((d) => d.code === 'edu');
  assert(edu, 'edu dict missing');
  const item = await req('POST', `/api/settings/dictionaries/${edu.id}/items`, {
    ...auth,
    body: { code: `SMK-EDU-${Date.now()}`, name: 'Smoke edu', isActive: true },
  });
  assert(item.ok, `dict item create ${item.status} ${JSON.stringify(item.data)}`);
  const patched = await req('PATCH', `/api/settings/dictionaries/${edu.id}/items/${item.data.id}`, {
    ...auth,
    body: { name: 'Smoke edu 2' },
  });
  assert(patched.ok, `dict item patch ${patched.status}`);
  const del = await req('POST', `/api/settings/dictionaries/${edu.id}/items/${item.data.id}/delete`, auth);
  assert(del.ok, `dict item delete ${del.status}`);

  const users = await req('GET', '/api/settings/users', auth);
  assert(users.ok && Array.isArray(users.data), `users ${users.status}`);

  const access = await req('GET', '/api/settings/role-access', auth);
  assert(access.ok, `role-access ${access.status}`);

  const audit = await req('GET', '/api/settings/audit', auth);
  assert(audit.ok && Array.isArray(audit.data), `audit ${audit.status}`);

  const ints = await req('GET', '/api/settings/integrations', auth);
  assert(ints.ok && Array.isArray(ints.data), `integrations ${ints.status}`);
  const bySys = {};
  for (const i of ints.data) {
    const sys = i.config && typeof i.config === 'object' ? i.config.sys : '';
    if (sys) bySys[sys] = i;
  }
  for (const sys of ['artix', 'iiko', 'billz2', 'onec', 'esign', 'mehnat']) {
    if (!bySys[sys]) notes.push(`integration ${sys}: no seeded row (generic panel still works)`);
  }

  for (const sys of ['onec', 'esign', 'mehnat']) {
    let row = bySys[sys];
    if (!row) {
      const created = await req('POST', '/api/settings/integrations', {
        ...auth,
        body: {
          type: sys === 'onec' ? 'onec' : 'custom',
          name: sys === 'onec' ? '1С:Предприятие' : sys === 'esign' ? 'Электронная подпись' : 'Mehnat.gov.uz',
          config: { sys, stub: true },
        },
      });
      assert(created.ok, `create ${sys} ${created.status} ${JSON.stringify(created.data)}`);
      row = created.data;
      notes.push(`${sys}: created stub integration`);
    }
    const prev = row.config || {};
    const saved = await req('PATCH', `/api/settings/integrations/${row.id}`, {
      ...auth,
      body: { isActive: true, config: { sys, stub: true, note: 'smoke' } },
    });
    assert(saved.ok, `patch ${sys} ${saved.status}`);
    await req('PATCH', `/api/settings/integrations/${row.id}`, {
      ...auth,
      body: { config: prev },
    });
  }

  const qs = await req('GET', '/api/settings/quickstart', auth);
  assert(qs.ok && qs.data.total === 10, `quickstart ${qs.status}`);

  const pdi = await req('GET', '/api/settings/person-docs-import', auth);
  assert(pdi.ok && pdi.data.fields.length === 11, `person-docs-import ${pdi.status}`);

  return notes;
}

async function main() {
  const failed = [];
  const passed = [];
  for (const file of SMOKES) {
    process.stdout.write(`→ ${file} … `);
    const r = runSmoke(file);
    if (r.ok) {
      passed.push(file);
      console.log('OK');
    } else {
      failed.push({ file, last: r.last, status: r.status });
      console.log(`FAIL (${r.status}) ${r.last}`);
    }
  }

  console.log('\n—— leftover live probes ——');
  const notes = await leftoverProbes();
  console.log('✓ leftover probes: org/system/payroll/account/dicts/users/audit/integrations/quickstart/person-docs');
  for (const n of notes) console.log(`  · ${n}`);

  console.log(`\nAPI smokes: ${passed.length}/${SMOKES.length} passed`);
  if (failed.length) {
    console.error('Failed:');
    for (const f of failed) console.error(`  ${f.file}: ${f.last}`);
    process.exit(1);
  }
  console.log('✓ settings fullstack API layer');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
