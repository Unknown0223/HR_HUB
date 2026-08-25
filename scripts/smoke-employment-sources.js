/** Smoke: Источники занятости (dictionary employment_sources) */
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

  const list = await req('GET', '/api/settings/dictionaries?kind=extra', auth);
  assert(list.ok, `dicts ${list.status}`);
  const dict = (list.data || []).find((d) => d.code === 'employment_sources');
  assert(dict, 'employment_sources dict missing');
  assert((dict.items || []).length >= 1, 'expected seeded items');

  const code = `SMOKE_ES_${Date.now().toString(36).toUpperCase()}`;
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code,
      name: 'Smoke источник',
      sortOrder: 99,
      isActive: true,
      meta: { sourceType: 'hire_and_dismissal' },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.sourceType === 'hire_and_dismissal', 'sourceType not stored');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: {
        name: 'Smoke источник 2',
        meta: { sourceType: 'hire' },
        isActive: false,
      },
    },
  );
  assert(patched.ok, `patch ${patched.status}`);
  assert(patched.data.meta?.sourceType === 'hire', 'sourceType not patched');
  assert(patched.data.meta?.createdAt, 'createdAt stamp missing');

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  assert(lookups.ok, `lookups ${lookups.status}`);
  assert(Array.isArray(lookups.data.employmentSources), 'lookups.employmentSources missing');

  const del = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}/delete`,
    auth,
  );
  assert(del.ok, `delete ${del.status}`);

  console.log(
    `✓ employment-sources: dict=${dict.id}, seed items=${(dict.items || []).length}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
