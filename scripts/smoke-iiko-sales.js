/** Smoke: Продажи IIKO (ExternalIntegration config) */
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
    (list.data || []).find((i) => asCfg(i).sys === 'iiko_sales') ||
    (list.data || []).find(
      (i) =>
        String(i.name || '').toLowerCase().includes('iiko') &&
        String(i.name || '').toLowerCase().includes('продаж'),
    );
  assert(row, 'IIKO sales integration missing');

  const stamp = Date.now().toString(36);
  const prev = asCfg(row);
  const sale = {
    id: `smoke-${stamp}`,
    saleDate: '2026-08-16',
    iikoUser: `smoke_user_${stamp}`,
    product: 'Smoke latte',
    category: 'Напитки',
    accrual: 12.5,
    amountNoDiscount: 25000,
    qty: 2,
  };

  const patched = await req('PATCH', `/api/settings/integrations/${row.id}`, {
    ...auth,
    body: {
      config: {
        sys: 'iiko_sales',
        lastOlapFrom: '2026-08-16',
        lastOlapTo: '2026-08-16',
        sales: [...(prev.sales || []), sale],
      },
    },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  const cfg = asCfg(patched.data);
  assert(cfg.sys === 'iiko_sales', 'sys lost');
  const stored = (cfg.sales || []).find((s) => s.id === sale.id);
  assert(stored, 'sale not stored');
  assert(stored.product === 'Smoke latte', 'product not stored');
  assert(stored.accrual === 12.5, 'accrual not stored');

  const cleaned = await req('PATCH', `/api/settings/integrations/${row.id}`, {
    ...auth,
    body: {
      config: {
        sales: (cfg.sales || []).filter((s) => s.id !== sale.id),
      },
    },
  });
  assert(cleaned.ok, `cleanup ${cleaned.status}`);
  const after = asCfg(cleaned.data);
  assert(!(after.sales || []).some((s) => s.id === sale.id), 'smoke sale not removed');

  console.log(`✓ iiko-sales: id=${row.id}, sales=${(after.sales || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
