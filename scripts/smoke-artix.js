/** Smoke: Настройки ARTIX (ExternalIntegration config) */
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
  const artix = (list.data || []).find((i) => asCfg(i).sys === 'artix')
    || (list.data || []).find((i) => String(i.name || '').toLowerCase().includes('artix'));
  assert(artix, 'ARTIX integration missing');

  const stamp = Date.now().toString(36);
  const prev = asCfg(artix);
  const smokeUser = {
    id: `smoke-${stamp}`,
    userId: `UID${stamp}`,
    name: `Smoke ARTIX ${stamp}`,
    code: `C${stamp}`.slice(0, 8),
    login: `smoke_${stamp}`,
    password: 'TempPass12',
    blocked: false,
  };
  const smokeDiv = {
    id: `smoke-div-${stamp}`,
    divisionId: 'x',
    divisionName: `Smoke div ${stamp}`,
    externalId: `EXT${stamp}`,
  };

  const patched = await req('PATCH', `/api/settings/integrations/${artix.id}`, {
    ...auth,
    body: {
      isActive: true,
      webhookUrl: 'https://soap.example.local/artix',
      config: {
        sys: 'artix',
        soapUrl: 'https://soap.example.local/artix',
        login: 'smoke_login',
        password: 'smoke_secret',
        users: [...(prev.users || []), smokeUser],
        divisions: [...(prev.divisions || []), smokeDiv],
      },
    },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  const cfg = asCfg(patched.data);
  assert(cfg.sys === 'artix', 'sys lost');
  assert(cfg.soapUrl === 'https://soap.example.local/artix', 'soapUrl not stored');
  assert(cfg.login === 'smoke_login', 'login not stored');
  assert((cfg.users || []).some((u) => u.id === smokeUser.id), 'user not stored');
  assert((cfg.divisions || []).some((d) => d.id === smokeDiv.id), 'division not stored');
  assert(patched.data.isActive === true, 'isActive not patched');

  const cleaned = await req('PATCH', `/api/settings/integrations/${artix.id}`, {
    ...auth,
    body: {
      config: {
        users: (cfg.users || []).filter((u) => u.id !== smokeUser.id),
        divisions: (cfg.divisions || []).filter((d) => d.id !== smokeDiv.id),
        soapUrl: prev.soapUrl || '',
        login: prev.login || '',
        password: prev.password || '',
      },
    },
  });
  assert(cleaned.ok, `cleanup ${cleaned.status}`);
  const after = asCfg(cleaned.data);
  assert(!(after.users || []).some((u) => u.id === smokeUser.id), 'smoke user not removed');

  console.log(`✓ artix: id=${artix.id}, users=${(after.users || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
