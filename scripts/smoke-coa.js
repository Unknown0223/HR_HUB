/** Smoke: План счетов (dictionary coa) */
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
  const dict = (list.data || []).find((d) => d.code === 'coa');
  assert(dict, 'coa dict missing');
  assert((dict.items || []).length >= 1, 'expected coa items');

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  assert(lookups.ok, `lookups ${lookups.status}`);
  assert(Array.isArray(lookups.data.coa), 'lookups.coa missing');
  const parent = (lookups.data.coa || []).find((a) => a.code === '0000') || lookups.data.coa[0];
  assert(parent, 'parent account missing');

  const stamp = Date.now().toString(36).toUpperCase();
  const code = `9${stamp.slice(-3)}`;
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code,
      name: 'Smoke счет',
      isActive: true,
      meta: {
        parentCode: parent.code,
        parentName: parent.name || parent.label,
        accountKind: 'transit',
        paymentKind: 'base',
        quantitative: false,
        balance: true,
        checkExceed: true,
        subcontos: [{ key: 's1', name: 'employees', type: 'balance', required: true }],
        isDebit: true,
        isCredit: true,
        currency: 'UZS',
      },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.accountKind === 'transit', 'accountKind not stored');
  assert(created.data.meta?.parentCode === parent.code, 'parentCode not stored');
  assert(created.data.meta?.subcontos?.length === 1, 'subcontos not stored');
  assert(created.data.meta?.createdAt, 'createdAt missing');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: {
        isActive: false,
        meta: { paymentKind: 'all', quantitative: true },
      },
    },
  );
  assert(patched.ok, `patch ${patched.status}`);
  assert(patched.data.isActive === false, 'isActive not patched');
  assert(patched.data.meta?.parentCode === parent.code, 'parentCode lost on meta merge');
  assert(patched.data.meta?.paymentKind === 'all', 'paymentKind not patched');
  assert(patched.data.meta?.quantitative === true, 'quantitative not patched');

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

  console.log(`✓ coa: dict=${dict.id}, items=${(dict.items || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
