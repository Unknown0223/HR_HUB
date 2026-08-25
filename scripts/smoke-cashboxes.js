/** Smoke: Кассы (dictionary cashboxes) */
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
  const dict = (list.data || []).find((d) => d.code === 'cashboxes');
  const currencies = (list.data || []).find((d) => d.code === 'currencies');
  assert(dict, 'cashboxes dict missing');
  assert((dict.items || []).length >= 1, 'expected cashbox items');

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  assert(lookups.ok, `lookups ${lookups.status}`);
  const emp = (lookups.data.employees || [])[0];
  const loc = (lookups.data.locations || [])[0];
  const cur = (currencies?.items || [])[0];

  const stamp = Date.now().toString(36).toUpperCase();
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code: `SMOKE_CB_${stamp}`,
      name: 'Smoke касса',
      isActive: true,
      meta: {
        responsible: emp ? [{ id: emp.id, label: emp.label }] : [],
        locations: loc ? [{ id: loc.id, label: loc.label }] : [],
        currencies: cur ? [{ id: cur.code, label: `${cur.code} ${cur.name}` }] : [],
        balance: null,
      },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.createdAt, 'createdAt missing');
  if (emp) {
    assert(created.data.meta?.responsible?.[0]?.id === emp.id, 'responsible not stored');
  }

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: { isActive: false, meta: { balance: 1500000 } },
    },
  );
  assert(patched.ok, `patch ${patched.status}`);
  assert(patched.data.isActive === false, 'isActive not patched');
  assert(patched.data.meta?.balance === 1500000, 'balance not patched');
  if (emp) {
    assert(
      patched.data.meta?.responsible?.[0]?.id === emp.id,
      'responsible lost on meta merge',
    );
  }

  const hist = await req(
    'GET',
    `/api/settings/audit?entity=DictionaryItem&entityId=${created.data.id}`,
    auth,
  );
  assert(hist.ok, `audit ${hist.status}`);
  assert(
    hist.data.some((a) => a.action === 'dictionary.item.create'),
    'create audit missing',
  );

  const del = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}/delete`,
    auth,
  );
  assert(del.ok, `delete ${del.status}`);

  console.log(`✓ cashboxes: dict=${dict.id}, items=${(dict.items || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
