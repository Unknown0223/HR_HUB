/** Smoke: Настройки IIKO (ExternalIntegration config) */
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

function asCfg(row) {
  return row && row.config && typeof row.config === 'object' ? row.config : {};
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

  const list = await req('GET', '/api/settings/integrations', auth);
  assert(list.ok, `integrations ${list.status}`);
  const iiko =
    (list.data || []).find((i) => asCfg(i).sys === 'iiko') ||
    (list.data || []).find(
      (i) =>
        String(i.name || '').toLowerCase().includes('iiko') &&
        !String(i.name || '').toLowerCase().includes('продаж'),
    );
  assert(iiko, 'IIKO integration missing');

  const stamp = Date.now().toString(36);
  const prev = asCfg(iiko);
  const smokeUser = {
    id: `smoke-${stamp}`,
    iikoName: `Smoke IIKO ${stamp}`,
    employeeId: '',
  };

  const patched = await req('PATCH', `/api/settings/integrations/${iiko.id}`, {
    ...auth,
    body: {
      isActive: true,
      webhookUrl: 'https://iiko.example.local/api',
      config: {
        sys: 'iiko',
        url: 'https://iiko.example.local/api',
        login: 'smoke_iiko',
        olapKind: 'dishes',
        syncDays: 7,
        timeFrom: '23:00',
        timeTo: '06:00',
        users: [...(prev.users || []), smokeUser],
      },
    },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  const cfg = asCfg(patched.data);
  assert(cfg.sys === 'iiko', 'sys lost');
  assert(cfg.url === 'https://iiko.example.local/api', 'url not stored');
  assert(cfg.olapKind === 'dishes', 'olapKind not stored');
  assert((cfg.users || []).some((u) => u.id === smokeUser.id), 'user not stored');
  assert(patched.data.isActive === true, 'isActive not patched');

  const cleaned = await req('PATCH', `/api/settings/integrations/${iiko.id}`, {
    ...auth,
    body: {
      config: {
        users: (cfg.users || []).filter((u) => u.id !== smokeUser.id),
        url: prev.url || '',
        login: prev.login || '',
      },
    },
  });
  assert(cleaned.ok, `cleanup ${cleaned.status}`);
  const after = asCfg(cleaned.data);
  assert(!(after.users || []).some((u) => u.id === smokeUser.id), 'smoke user not removed');

  console.log(`✓ iiko: id=${iiko.id}, users=${(after.users || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
