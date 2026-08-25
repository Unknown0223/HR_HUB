/**
 * Smoke test: news, accruals, deductions, facts, dynamic catalogs
 */
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
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const results = [];
  const step = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`✓ ${name}`);
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
      console.log(`✗ ${name}: ${e.message}`);
    }
  };

  let token = '';
  let tenant = '';

  await step('POST /api/auth/login', async () => {
    const r = await req('POST', '/api/auth/login', {
      body: { email: 'admin@demo.local', password: 'Demo1234!' },
    });
    assert(r.ok, `login ${r.status} ${JSON.stringify(r.data)}`);
    token = r.data.accessToken || r.data.token || r.data.access_token;
    tenant = r.data.user?.tenantId || r.data.tenantId || r.data.tenant?.id;
    assert(token, 'no token');
    // fallback tenant from /me
    if (!tenant) {
      const me = await req('GET', '/api/me', { token });
      tenant = me.data?.tenantId || me.data?.tenant?.id || me.data?.user?.tenantId;
    }
    assert(tenant, 'no tenantId');
  });

  const auth = { token, tenant };

  await step('GET /api/news', async () => {
    const r = await req('GET', '/api/news', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    assert(Array.isArray(r.data), 'expected array');
  });

  await step('GET /api/news/birthdays', async () => {
    const r = await req('GET', '/api/news/birthdays', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    assert(Array.isArray(r.data), 'expected array');
  });

  let newsId = '';
  await step('POST /api/news (create message)', async () => {
    const r = await req('POST', '/api/news', {
      ...auth,
      body: {
        message: '<p>Smoke test сообщение</p>',
        sendToAll: false,
      },
    });
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    newsId = r.data.id;
    assert(newsId, 'no news id');
  });

  await step('DELETE /api/news/:id', async () => {
    assert(newsId, 'skip — no id');
    const r = await req('DELETE', `/api/news/${newsId}`, auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
  });

  await step('GET /api/catalog/accrual-types', async () => {
    const r = await req('GET', '/api/catalog/accrual-types', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    const list = Array.isArray(r.data) ? r.data : r.data?.items;
    assert(Array.isArray(list), 'expected list');
    assert(list.length >= 1, `expected seeded accruals, got ${list.length}`);
  });

  let accrualId = '';
  await step('POST /api/catalog/accrual-types', async () => {
    const r = await req('POST', '/api/catalog/accrual-types', {
      ...auth,
      body: {
        name: 'Smoke Accrual',
        code: `SMK_ACC_${Date.now().toString(36).toUpperCase()}`,
        sortOrder: 999,
        isActive: true,
        periodCalc: 'period',
        resultMode: 'fixed',
        taxNdfl: true,
        accountingMode: 'employee',
        shortName: 'Smoke',
      },
    });
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    accrualId = r.data.id;
  });

  await step('GET/PATCH/DELETE accrual-types/:id', async () => {
    assert(accrualId, 'no accrual id');
    let r = await req('GET', `/api/catalog/accrual-types/${accrualId}`, auth);
    assert(r.ok, `get ${r.status}`);
    r = await req('PATCH', `/api/catalog/accrual-types/${accrualId}`, {
      ...auth,
      body: { shortName: 'Smoke2' },
    });
    assert(r.ok, `patch ${r.status} ${JSON.stringify(r.data)}`);
    r = await req('DELETE', `/api/catalog/accrual-types/${accrualId}`, auth);
    assert(r.ok, `delete ${r.status}`);
  });

  await step('GET /api/catalog/deduction-types', async () => {
    const r = await req('GET', '/api/catalog/deduction-types', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    const list = Array.isArray(r.data) ? r.data : r.data?.items;
    assert(Array.isArray(list), 'expected list');
    assert(list.length >= 1, `expected seeded deductions, got ${list.length}`);
  });

  let dedId = '';
  await step('POST /api/catalog/deduction-types', async () => {
    const r = await req('POST', '/api/catalog/deduction-types', {
      ...auth,
      body: {
        name: 'Smoke Deduction',
        code: `SMK_DED_${Date.now().toString(36).toUpperCase()}`,
        sortOrder: 999,
        isActive: true,
        periodCalc: 'period',
        resultMode: 'fixed',
        accountingMode: 'operation',
        account: '6850 — Прочие обязательства',
        shortName: 'SmokeDed',
      },
    });
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    dedId = r.data.id;
  });

  await step('GET/PATCH/DELETE deduction-types/:id', async () => {
    assert(dedId, 'no deduction id');
    let r = await req('GET', `/api/catalog/deduction-types/${dedId}`, auth);
    assert(r.ok, `get ${r.status}`);
    r = await req('PATCH', `/api/catalog/deduction-types/${dedId}`, {
      ...auth,
      body: { shortName: 'SmokeDed2' },
    });
    assert(r.ok, `patch ${r.status} ${JSON.stringify(r.data)}`);
    r = await req('DELETE', `/api/catalog/deduction-types/${dedId}`, auth);
    assert(r.ok, `delete ${r.status}`);
  });

  await step('GET /api/catalog/fact-types', async () => {
    const r = await req('GET', '/api/catalog/fact-types', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
  });

  await step('GET /api/catalog/facts', async () => {
    const r = await req('GET', '/api/catalog/facts', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
  });

  await step('GET /api/catalog/facts/import/template.xlsx', async () => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Id': tenant,
    };
    const res = await fetch(`${API}/api/catalog/facts/import/template.xlsx`, {
      headers,
    });
    assert(res.ok, `template ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert(buf.length > 100, `template too small ${buf.length}`);
  });

  await step('GET /api/catalog/dynamic-fields', async () => {
    const r = await req('GET', '/api/catalog/dynamic-fields', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
  });

  await step('GET /api/catalog/dynamic-objects', async () => {
    const r = await req('GET', '/api/catalog/dynamic-objects', auth);
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
  });

  await step('POST /api/catalog/facts (create)', async () => {
    let types = await req('GET', '/api/catalog/fact-types', auth);
    let typeList = Array.isArray(types.data) ? types.data : types.data?.items || [];
    if (!typeList.length) {
      const created = await req('POST', '/api/catalog/fact-types', {
        ...auth,
        body: {
          name: 'Smoke Fact Type',
          code: `SMK_FT_${Date.now().toString(36).toUpperCase()}`,
          unit: 'Количество',
          isActive: true,
        },
      });
      assert(created.ok, `create fact-type ${created.status} ${JSON.stringify(created.data)}`);
      typeList = [created.data];
    }
    const emps = await req('GET', '/api/employees', auth);
    const empList = Array.isArray(emps.data)
      ? emps.data
      : emps.data?.items || emps.data?.data || [];
    assert(empList.length > 0, `need employees, got ${empList.length}`);
    const r = await req('POST', '/api/catalog/facts', {
      ...auth,
      body: {
        employeeId: empList[0].id,
        factTypeId: typeList[0].id,
        value: '42',
        factDate: '2026-08-06',
        status: 'active',
      },
    });
    assert(r.ok, `${r.status} ${JSON.stringify(r.data)}`);
    if (r.data?.id) {
      await req('DELETE', `/api/catalog/facts/${r.data.id}`, auth);
    }
  });

  const failed = results.filter((x) => !x.ok);
  console.log('\n———');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    process.exitCode = 1;
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
