/** Full ACL grant/revoke test: assign role, grant all, revoke one-by-one. */
const API = process.env.API_URL || 'http://127.0.0.1:3002';

async function req(method, path, { token, tenant, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  const res = await fetch(`${API}${path}`, {
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

async function login(email) {
  const r = await req('POST', '/api/auth/login', {
    body: { email, password: 'Demo1234!' },
  });
  assert(r.ok, `login ${email} ${r.status}`);
  const token = r.data.accessToken;
  const tenant = r.data.user?.tenantId || r.data.tenant?.id;
  assert(token && tenant, `no token/tenant for ${email}`);
  return { token, tenant, user: r.data.user };
}

async function main() {
  const admin = await login('admin@demo.local');

  const dicts = await req('GET', '/api/settings/dictionaries?kind=admin', admin);
  assert(dicts.ok, `dicts ${dicts.status}`);
  const roleDict = (dicts.data || []).find((d) => d.code === 'app_roles');
  assert(roleDict, 'app_roles missing');
  const mgrRole =
    (roleDict.items || []).find((r) => r.code === 'MGR') ||
    (roleDict.items || []).find((r) => /руковод/i.test(r.name)) ||
    roleDict.items[0];
  assert(mgrRole?.id, 'MGR role missing');

  // Collect every mega-nav href from source + critical payroll pages.
  const fs = require('fs');
  const megaSrc = fs.readFileSync('apps/web/src/lib/mega-nav.ts', 'utf8');
  const found = [...megaSrc.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
  const critical = [
    '/dashboard',
    '/news',
    '/employees',
    '/payroll/accruals',
    '/payroll/timesheets',
    '/positions',
    '/divisions?tab=divisions',
    '/catalog/devices',
    '/settings/users',
  ];
  const allHrefs = [...new Set([...found, ...critical])].filter(Boolean);
  const openKeys = allHrefs.map((h) => `${h}::*`);

  // 1) Ensure manager@demo.local exists with MGR catalog role
  const users = await req('GET', '/api/settings/users', admin);
  assert(users.ok, `users ${users.status}`);
  const rows = Array.isArray(users.data)
    ? users.data
    : users.data?.items || users.data?.users || [];
  let manager = rows.find((u) => u.email === 'manager@demo.local');
  if (!manager) {
    const created = await req('POST', '/api/settings/users', {
      ...admin,
      body: {
        email: 'manager@demo.local',
        fullName: 'Dilnoza Rahimova',
        password: 'Demo1234!',
        role: 'manager',
        meta: {
          catalogRoleIds: [mgrRole.id],
          catalogRoleNames: [mgrRole.name],
          login: 'manager',
        },
      },
    });
    assert(created.ok, `create manager ${created.status} ${JSON.stringify(created.data)}`);
    manager = created.data;
  } else {
    const meta = {
      ...(manager.meta && typeof manager.meta === 'object' ? manager.meta : {}),
      catalogRoleIds: [mgrRole.id],
      catalogRoleNames: [mgrRole.name],
    };
    const upd = await req('PATCH', `/api/settings/users/${manager.id}`, {
      ...admin,
      body: { meta, role: 'manager', isActive: true, password: 'Demo1234!' },
    });
    assert(upd.ok, `assign role ${upd.status} ${JSON.stringify(upd.data)}`);
    manager = upd.data;
  }

  // 2) Grant ALL open keys to MGR
  const allTrue = {};
  for (const k of openKeys) allTrue[k] = true;
  const grantAll = await req('PATCH', '/api/settings/role-access', {
    ...admin,
    body: { grants: { [mgrRole.id]: allTrue } },
  });
  assert(grantAll.ok, `grant all ${grantAll.status}`);
  assert(
    grantAll.data.grants?.[mgrRole.id]?.['/employees::*'] === true,
    'employees grant missing after grant-all',
  );

  // 3) As manager: my-access must NOT bypass and must include employees + accruals
  const mgr = await login('manager@demo.local');
  const mine = await req('GET', '/api/settings/my-access', mgr);
  assert(mine.ok, `my-access ${mine.status} ${JSON.stringify(mine.data)}`);
  assert(mine.data.bypass === false, 'expected enforce mode after grants configured');
  assert(mine.data.allowed.includes('/employees'), 'employees should be allowed');
  assert(mine.data.allowed.includes('/payroll/accruals'), 'accruals should be allowed');
  console.log(`✓ grant-all: allowed=${mine.data.allowed.length} keys`);

  // 4) Revoke ONE by ONE for a sample of pages and verify each disappears
  const revokeSample = [
    '/payroll/accruals',
    '/employees',
    '/news',
    '/catalog/devices',
  ];
  for (const href of revokeSample) {
    const key = `${href}::*`;
    const rev = await req('PATCH', '/api/settings/role-access', {
      ...admin,
      body: { grants: { [mgrRole.id]: { [key]: false } } },
    });
    assert(rev.ok, `revoke ${href} ${rev.status}`);
    assert(rev.data.grants?.[mgrRole.id]?.[key] === false, `stored false for ${key}`);

    const again = await req('GET', '/api/settings/my-access', mgr);
    assert(again.ok, `my-access after revoke ${href}`);
    assert(again.data.bypass === false, 'still enforcing');
    assert(
      !again.data.allowed.includes(href),
      `FAIL: ${href} still allowed after revoke`,
    );
    console.log(`✓ revoked ${href} — not in allowed`);
  }

  // 5) Re-grant the revoked ones and verify they reappear
  for (const href of revokeSample) {
    const key = `${href}::*`;
    const g = await req('PATCH', '/api/settings/role-access', {
      ...admin,
      body: { grants: { [mgrRole.id]: { [key]: true } } },
    });
    assert(g.ok, `re-grant ${href}`);
    const again = await req('GET', '/api/settings/my-access', mgr);
    assert(again.data.allowed.includes(href), `FAIL: ${href} not restored`);
    console.log(`✓ restored ${href}`);
  }

  // 6) Admin bypass
  const adminAccess = await req('GET', '/api/settings/my-access', admin);
  assert(adminAccess.ok && adminAccess.data.bypass === true, 'admin must bypass');

  console.log('✓ role-access full: grant-all + revoke-one-by-one + restore + admin bypass');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
