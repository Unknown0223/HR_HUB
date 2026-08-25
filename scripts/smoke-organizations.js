/** Smoke: Организации (dictionary orgs + legal_entities lookup) */
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

  const list = await req('GET', '/api/settings/dictionaries?kind=admin', auth);
  assert(list.ok, `dicts ${list.status}`);
  const dict = (list.data || []).find((d) => d.code === 'orgs');
  const legal = (list.data || []).find((d) => d.code === 'legal_entities');
  assert(dict, 'orgs dict missing');
  assert(legal, 'legal_entities dict missing');
  assert((dict.items || []).length >= 1, 'expected organization items');
  assert((legal.items || []).length >= 1, 'expected legal entities');

  const extra = await req('GET', '/api/settings/dictionaries?kind=extra', auth);
  assert(extra.ok, `extra ${extra.status}`);
  const currencies = (extra.data || []).find((d) => d.code === 'currencies');
  assert(currencies, 'currencies dict missing');
  const currency = (currencies.items || []).find((i) => i.isActive !== false);
  const le = legal.items[0];

  const stamp = Date.now().toString(36).toUpperCase();
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code: `SMOKE_ORG_${stamp}`,
      name: `Smoke org ${stamp}`,
      isActive: true,
      sortOrder: 99,
      meta: {
        inn: '123456789',
        phone: '+998901112233',
        email: `smoke_${stamp}@demo.local`,
        currencyId: currency?.id,
        currencyName: currency ? `${currency.code} ${currency.name}` : 'UZS',
        timezone: 'Asia/Tashkent',
        legalEntityId: le.id,
        legalEntityName: le.name,
        vatPayer: true,
        vatRate: 12,
        excisePayer: false,
      },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.createdAt, 'createdAt missing');
  assert(created.data.meta?.inn === '123456789', 'inn not stored');
  assert(created.data.meta?.vatPayer === true, 'vatPayer not stored');
  assert(created.data.meta?.vatRate === 12, 'vatRate not stored');
  assert(created.data.meta?.legalEntityId === le.id, 'legal entity not stored');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: {
        isActive: false,
        meta: { vatPayer: false, vatRate: null, phone: '+998900000000' },
      },
    },
  );
  assert(patched.ok, `patch ${patched.status}`);
  assert(patched.data.isActive === false, 'isActive not patched');
  assert(patched.data.meta?.phone === '+998900000000', 'phone not patched');
  assert(patched.data.meta?.inn === '123456789', 'inn lost on meta merge');
  assert(patched.data.meta?.vatPayer === false, 'vatPayer not patched');

  const del = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}/delete`,
    auth,
  );
  assert(del.ok, `delete ${del.status}`);

  console.log(`✓ organizations: dict=${dict.id}, items=${(dict.items || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
