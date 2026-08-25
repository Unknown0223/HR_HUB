/** Smoke: Виды образования (dictionary edu) */
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

async function main() {
  const login = await req('POST', '/api/auth/login', {
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  if (!login.ok) throw new Error(`login ${login.status}`);
  const token = login.data.accessToken;
  let tenant = login.data.user?.tenantId || login.data.tenantId;
  if (!tenant) {
    const me = await req('GET', '/api/me', { token });
    tenant = me.data?.tenantId || me.data?.tenant?.id;
  }
  const auth = { token, tenant };

  const list = await req('GET', '/api/settings/dictionaries?kind=core', auth);
  if (!list.ok) throw new Error(`dicts ${list.status}`);
  const dict = (list.data || []).find((d) => d.code === 'edu');
  if (!dict) throw new Error('edu dict missing');

  const code = `SMOKE_${Date.now().toString(36).toUpperCase()}`;
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code,
      name: 'Smoke образование',
      sortOrder: 99,
      isActive: true,
    },
  });
  if (!created.ok) {
    throw new Error(`create ${created.status} ${JSON.stringify(created.data)}`);
  }
  if (created.data.isActive !== true) throw new Error('isActive not set on create');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: { name: 'Smoke образование 2', isActive: false, sortOrder: 100 },
    },
  );
  if (!patched.ok) throw new Error(`patch ${patched.status}`);
  if (patched.data.isActive !== false) throw new Error('isActive not patched');

  const del = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}/delete`,
    auth,
  );
  if (!del.ok) throw new Error(`delete ${del.status}`);

  console.log(
    `✓ education-types: dict=${dict.id}, seed items=${(dict.items || []).length}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
