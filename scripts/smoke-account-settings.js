/** Smoke: Настройки счетов */
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

  const get = await req('GET', '/api/settings/account-settings', {
    token,
    tenant,
  });
  if (!get.ok) throw new Error(`GET ${get.status} ${JSON.stringify(get.data)}`);
  const fields = get.data.fields || [];
  const settings = get.data.accountSettings || {};
  if (fields.length < 20) throw new Error(`too few fields ${fields.length}`);
  if (!settings.settlementAccount) throw new Error('missing default settlementAccount');

  const patch = await req('PATCH', '/api/settings/account-settings', {
    token,
    tenant,
    body: {
      accountSettings: {
        ...settings,
        cash: '5010. Денежные средства в национальной валюте',
      },
    },
  });
  if (!patch.ok)
    throw new Error(`PATCH ${patch.status} ${JSON.stringify(patch.data)}`);
  if (!String(patch.data.accountSettings?.cash || '').includes('5010')) {
    throw new Error('cash not saved');
  }

  console.log(`✓ account-settings: ${fields.length} fields, GET+PATCH ok`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
