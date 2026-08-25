/** Smoke: Пользователи + Роли (User.meta + app_roles + role-access) */
const API = process.env.API_URL || 'http://127.0.0.1:3001';

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

async function main() {
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

  const dicts = await req('GET', '/api/settings/dictionaries?kind=admin', auth);
  assert(dicts.ok, `dicts ${dicts.status}`);
  const roleDict = (dicts.data || []).find((d) => d.code === 'app_roles');
  assert(roleDict, 'app_roles dict missing');
  assert((roleDict.items || []).length >= 1, 'expected roles');
  const catalogRole = roleDict.items.find((r) => r.code === 'EMP') || roleDict.items[0];

  const stamp = Date.now().toString(36);
  const created = await req('POST', '/api/settings/users', {
    ...auth,
    body: {
      fullName: `Smoke User ${stamp}`,
      password: 'Smoke1234!',
      meta: {
        login: `smoke_${stamp}`,
        gender: 'male',
        managedBy: 'organization',
        catalogRoleIds: [catalogRole.id],
        catalogRoleNames: [catalogRole.name],
        phone: '+998901112233',
        timezone: 'Asia/Tashkent',
      },
    },
  });
  assert(created.ok, `create user ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.login === `smoke_${stamp}`, 'login not stored');
  assert(created.data.meta?.catalogRoleIds?.[0] === catalogRole.id, 'role ids not stored');
  assert(String(created.data.email).includes(`smoke_${stamp}`), 'email not derived from login');

  const patched = await req('PATCH', `/api/settings/users/${created.data.id}`, {
    ...auth,
    body: {
      isActive: false,
      meta: { phone: '+998900000000', code: 'S1' },
    },
  });
  assert(patched.ok, `patch user ${patched.status}`);
  assert(patched.data.isActive === false, 'isActive not patched');
  assert(patched.data.meta?.phone === '+998900000000', 'phone not patched');
  assert(patched.data.meta?.login === `smoke_${stamp}`, 'login lost');

  const grantKey = '/settings/users::*';
  const access = await req('PATCH', '/api/settings/role-access', {
    ...auth,
    body: { grants: { [catalogRole.id]: { [grantKey]: true } } },
  });
  assert(access.ok, `role-access ${access.status}`);
  assert(access.data.grants?.[catalogRole.id]?.[grantKey] === true, 'grant not stored');

  const got = await req('GET', '/api/settings/role-access', auth);
  assert(got.ok, `get access ${got.status}`);
  assert(got.data.grants?.[catalogRole.id]?.[grantKey] === true, 'grant not read back');

  const roleRow = await req('POST', `/api/settings/dictionaries/${roleDict.id}/items`, {
    ...auth,
    body: {
      code: `SMOKE_R_${stamp}`,
      name: `Smoke role ${stamp}`,
      sortOrder: 99,
      meta: { products: ['verifix'] },
    },
  });
  assert(roleRow.ok, `create role ${roleRow.status}`);
  assert(roleRow.data.meta?.products?.[0] === 'verifix', 'product not stored');

  const delRole = await req(
    'POST',
    `/api/settings/dictionaries/${roleDict.id}/items/${roleRow.data.id}/delete`,
    auth,
  );
  assert(delRole.ok, `delete role ${delRole.status}`);

  const delUser = await req('POST', `/api/settings/users/${created.data.id}/delete`, auth);
  assert(delUser.ok, `delete user ${delUser.status}`);

  const cleanupAccess = await req('PATCH', '/api/settings/role-access', {
    ...auth,
    body: { grants: { [catalogRole.id]: { [grantKey]: false } } },
  });
  assert(cleanupAccess.ok, `cleanup access ${cleanupAccess.status}`);

  console.log(`✓ users-admin: users+roles+access ok`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
