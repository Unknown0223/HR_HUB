/** Smoke: Продажи Billz 1.0 (ExternalIntegration config) */
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
    (list.data || []).find((i) => asCfg(i).sys === 'billz1') ||
    (list.data || []).find(
      (i) =>
        String(i.name || '').toLowerCase().includes('billz') &&
        String(i.name || '').includes('1'),
    );
  assert(row, 'Billz 1.0 sales integration missing');

  const stamp = Date.now().toString(36);
  const prev = asCfg(row);
  const sale = {
    id: `smoke-${stamp}`,
    billzDivision: 'Smoke shop',
    billzSeller: `Seller ${stamp}`,
    saleDate: '2026-08-16',
    amount: 125000.5,
  };

  const patched = await req('PATCH', `/api/settings/integrations/${row.id}`, {
    ...auth,
    body: {
      config: {
        sys: 'billz1',
        subject: `user_${stamp}`,
        secretKey: `secret_${stamp}`,
        lastLoadFrom: '2026-08-01',
        lastLoadTo: '2026-08-16',
        sales: [...(prev.sales || []), sale],
      },
    },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  const cfg = asCfg(patched.data);
  assert(cfg.sys === 'billz1', 'sys lost');
  assert(cfg.subject === `user_${stamp}`, 'subject not stored');
  assert(cfg.secretKey === `secret_${stamp}`, 'secretKey not stored');
  const stored = (cfg.sales || []).find((s) => s.id === sale.id);
  assert(stored, 'sale not stored');
  assert(stored.billzSeller === sale.billzSeller, 'seller not stored');
  assert(stored.amount === 125000.5, 'amount not stored');

  const mapped = await req('PATCH', `/api/settings/integrations/${row.id}`, {
    ...auth,
    body: {
      config: {
        sales: (cfg.sales || []).map((s) =>
          s.id === sale.id
            ? { ...s, divisionName: 'HQ', employeeName: 'Smoke Emp' }
            : s,
        ),
      },
    },
  });
  assert(mapped.ok, `map ${mapped.status}`);
  const afterMap = asCfg(mapped.data);
  assert(afterMap.subject === `user_${stamp}`, 'subject dropped on sales patch');
  const mappedSale = (afterMap.sales || []).find((s) => s.id === sale.id);
  assert(mappedSale?.divisionName === 'HQ', 'division mapping not stored');

  const cleaned = await req('PATCH', `/api/settings/integrations/${row.id}`, {
    ...auth,
    body: {
      config: {
        subject: prev.subject || '',
        secretKey: prev.secretKey || '',
        sales: (afterMap.sales || []).filter((s) => s.id !== sale.id),
      },
    },
  });
  assert(cleaned.ok, `cleanup ${cleaned.status}`);
  const after = asCfg(cleaned.data);
  assert(!(after.sales || []).some((s) => s.id === sale.id), 'smoke sale not removed');

  console.log(`✓ billz1: id=${row.id}, sales=${(after.sales || []).length}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
