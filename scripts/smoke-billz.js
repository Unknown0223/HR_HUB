/** Smoke: Настройки Billz 2.0 (ExternalIntegration config) */
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
  const row =
    (list.data || []).find((i) => asCfg(i).sys === 'billz2') ||
    (list.data || []).find((i) => String(i.name || '').toLowerCase().includes('billz') && String(i.name || '').includes('2'));
  assert(row, 'Billz 2.0 integration missing');

  const stamp = Date.now().toString(36);
  const prev = asCfg(row);
  const mapping = {
    id: `smoke-${stamp}`,
    timeGroupId: 'day',
    timeGroupName: 'День',
    apiMethodId: 'seller.sales',
    apiMethodName: 'seller.sales',
  };
  const user = {
    id: `smoke-u-${stamp}`,
    billzName: `Smoke Billz ${stamp}`,
    phone: '+998900000000',
  };

  const patched = await req('PATCH', `/api/settings/integrations/${row.id}`, {
    ...auth,
    body: {
      isActive: true,
      config: {
        sys: 'billz2',
        secretToken: `tok_${stamp}`,
        mappings: [...(prev.mappings || []), mapping],
        users: [...(prev.users || []), user],
      },
    },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  const cfg = asCfg(patched.data);
  assert(cfg.sys === 'billz2', 'sys lost');
  assert(cfg.secretToken === `tok_${stamp}`, 'token not stored');
  assert((cfg.mappings || []).some((m) => m.id === mapping.id), 'mapping not stored');
  assert((cfg.users || []).some((u) => u.id === user.id), 'user not stored');
  assert(patched.data.isActive === true, 'isActive not patched');

  const cleaned = await req('PATCH', `/api/settings/integrations/${row.id}`, {
    ...auth,
    body: {
      config: {
        mappings: (cfg.mappings || []).filter((m) => m.id !== mapping.id),
        users: (cfg.users || []).filter((u) => u.id !== user.id),
        secretToken: prev.secretToken || '',
      },
    },
  });
  assert(cleaned.ok, `cleanup ${cleaned.status}`);
  const after = asCfg(cleaned.data);
  assert(!(after.mappings || []).some((m) => m.id === mapping.id), 'smoke mapping not removed');

  console.log(`✓ billz2: id=${row.id}, mappings=${(after.mappings || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
