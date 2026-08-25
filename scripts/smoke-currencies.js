/** Smoke: Валюты (dictionary currencies) */
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
  const dict = (list.data || []).find((d) => d.code === 'currencies');
  assert(dict, 'currencies dict missing');
  assert((dict.items || []).length >= 1, 'expected currency items');

  const stamp = Date.now().toString(36).toUpperCase();
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code: `S${stamp}`.slice(0, 8),
      name: `Smoke валюта ${stamp}`,
      isActive: true,
      sortOrder: 99,
      meta: {
        iso: 'XTS',
        unit: 'smoke',
        subunit: 'tiny',
        affixKind: 'postfix',
        affix: 'sm',
        roundingType: 'nearest',
        rounding: '####.##0000',
        rates: [{ date: '2026-08-15', rate: 12.5 }],
      },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.createdAt, 'createdAt missing');
  assert(created.data.meta?.iso === 'XTS', 'iso not stored');
  assert(created.data.meta?.rates?.[0]?.rate === 12.5, 'rate not stored');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: {
        isActive: false,
        meta: {
          rates: [
            { date: '2026-08-15', rate: 12.5 },
            { date: '2026-08-16', rate: 13 },
          ],
        },
      },
    },
  );
  assert(patched.ok, `patch ${patched.status}`);
  assert(patched.data.isActive === false, 'isActive not patched');
  assert(patched.data.meta?.rates?.length === 2, 'rates not merged');
  assert(patched.data.meta?.iso === 'XTS', 'iso lost on meta merge');

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

  const cfg = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code: `_SMOKE_CFG_${stamp}`,
      name: 'Smoke settings',
      isActive: false,
      meta: { autoCbu: true },
    },
  });
  assert(cfg.ok, `cfg ${cfg.status}`);

  const delCfg = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${cfg.data.id}/delete`,
    auth,
  );
  assert(delCfg.ok, `delete cfg ${delCfg.status}`);

  const del = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}/delete`,
    auth,
  );
  assert(del.ok, `delete ${del.status}`);

  console.log(`✓ currencies: dict=${dict.id}, items=${(dict.items || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
