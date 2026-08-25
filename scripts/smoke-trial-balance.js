/** Smoke: Оборотно-сальдовая ведомость (общая) */
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

  const ok = await req(
    'GET',
    '/api/catalog/analytics/trial-balance?from=2026-08-01&to=2026-08-06&showAmount=1&excludeExtra=0',
    auth,
  );
  if (!ok.ok) throw new Error(`report ${ok.status} ${JSON.stringify(ok.data)}`);
  if (!Array.isArray(ok.data.rows)) throw new Error('no rows array');
  if (ok.data.title !== 'Оборотно-сальдовая ведомость') {
    throw new Error(`bad title: ${ok.data.title}`);
  }

  const excl = await req(
    'GET',
    '/api/catalog/analytics/trial-balance?from=2026-08-01&to=2026-08-06&excludeExtra=1',
    auth,
  );
  if (!excl.ok) throw new Error(`exclude ${excl.status}`);

  console.log(
    `✓ trial-balance: ${ok.data.rows.length} rows, excludeExtra ok`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
