/** Smoke: Оборотно-сальдовая ведомость по счету */
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

  const bad = await req(
    'GET',
    '/api/catalog/analytics/account-balance?from=2026-08-01&to=2026-08-06',
    auth,
  );
  if (bad.ok) throw new Error('expected 400 without account');

  const ok = await req(
    'GET',
    '/api/catalog/analytics/account-balance?from=2026-08-01&to=2026-08-06&account=6710.%20Payroll&showAmount=1',
    auth,
  );
  if (!ok.ok) throw new Error(`report ${ok.status} ${JSON.stringify(ok.data)}`);
  if (!Array.isArray(ok.data.rows)) throw new Error('no rows array');

  const set = await req('PATCH', '/api/settings/account-balance-report', {
    ...auth,
    body: { accountBalanceReport: { defaultCellValue: '0' } },
  });
  if (!set.ok) throw new Error(`settings ${set.status}`);

  const get = await req('GET', '/api/settings/account-balance-report', auth);
  if (get.data?.accountBalanceReport?.defaultCellValue !== '0') {
    throw new Error('settings not persisted');
  }

  console.log(
    `✓ account-balance: ${ok.data.rows.length} rows, settings ok`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
