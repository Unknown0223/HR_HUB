/** Smoke: Показатели + группы показателей */
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
  const dict = (list.data || []).find((d) => d.code === 'indicators');
  const groups = (list.data || []).find((d) => d.code === 'indicator_groups');
  assert(dict, 'indicators dict missing');
  assert(groups, 'indicator_groups dict missing');
  assert((groups.items || []).length >= 1, 'expected indicator groups');
  assert((dict.items || []).length >= 1, 'expected indicator items');

  const stamp = Date.now().toString(36).toUpperCase();
  const groupCode = `SMOKE_G_${stamp}`;
  const group = await req('POST', `/api/settings/dictionaries/${groups.id}/items`, {
    ...auth,
    body: { code: groupCode, name: 'Smoke группа показателей', isActive: true },
  });
  assert(group.ok, `create group ${group.status} ${JSON.stringify(group.data)}`);

  const ident = `SmokeIdent${stamp}`;
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code: ident,
      name: 'Smoke показатель',
      isActive: true,
      meta: {
        shortName: 'Smoke',
        description: 'smoke desc',
        groupCode,
        groupName: 'Smoke группа показателей',
      },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.groupCode === groupCode, 'groupCode not stored');
  assert(created.data.meta?.shortName === 'Smoke', 'shortName not stored');
  assert(created.data.meta?.createdAt, 'createdAt missing');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: {
        name: 'Smoke показатель 2',
        meta: { description: 'updated' },
      },
    },
  );
  assert(patched.ok, `patch ${patched.status}`);
  assert(patched.data.name === 'Smoke показатель 2', 'name not patched');
  assert(patched.data.meta?.groupCode === groupCode, 'groupCode lost on meta merge');
  assert(patched.data.meta?.description === 'updated', 'description not patched');

  const hist = await req(
    'GET',
    `/api/settings/audit?entity=DictionaryItem&entityId=${created.data.id}`,
    auth,
  );
  assert(hist.ok, `audit ${hist.status}`);
  assert(Array.isArray(hist.data), 'audit expected array');
  assert(
    hist.data.some((a) => a.action === 'dictionary.item.create'),
    'create audit missing',
  );
  assert(
    hist.data.some((a) => a.action === 'dictionary.item.update'),
    'update audit missing',
  );

  const del = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}/delete`,
    auth,
  );
  assert(del.ok, `delete item ${del.status}`);

  const delG = await req(
    'POST',
    `/api/settings/dictionaries/${groups.id}/items/${group.data.id}/delete`,
    auth,
  );
  assert(delG.ok, `delete group ${delG.status}`);

  console.log(
    `✓ indicators: items=${(dict.items || []).length}, groups=${(groups.items || []).length}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
