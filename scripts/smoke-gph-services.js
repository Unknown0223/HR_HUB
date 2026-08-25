/** Smoke: Список услуг договора ГПХ — list columns, CRUD, contract link */
const API = process.env.API_URL || 'http://127.0.0.1:3001';
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3000';

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

function ym(iso) {
  return String(iso || '').slice(0, 7);
}

async function cleanup(auth, codePrefix) {
  const list = await req('GET', '/api/catalog/gph-services', auth);
  for (const r of list.data || []) {
    if (!String(r.code || '').startsWith(codePrefix) && !String(r.name || '').startsWith('SMOKE_GPH')) {
      continue;
    }
    await req('DELETE', `/api/catalog/gph-services/${r.id}`, auth);
  }
  const contracts = await req('GET', '/api/catalog/gph-contracts', auth);
  for (const c of contracts.data || []) {
    if (!String(c.number || '').startsWith('SMOKE-GPH-C-')) continue;
    await req('DELETE', `/api/catalog/gph-contracts/${c.id}`, auth);
  }
}

async function main() {
  const login = await req('POST', '/api/auth/login', {
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  assert(login.ok, `login ${login.status} ${JSON.stringify(login.data)}`);
  const token = login.data.accessToken;
  let tenant = login.data.tenant?.id || login.data.user?.tenantId || login.data.tenantId;
  if (!tenant) {
    const me = await req('GET', '/api/me', { token });
    tenant = me.data?.tenantId || me.data?.tenant?.id;
  }
  assert(token && tenant, 'token/tenant');
  const auth = { token, tenant };
  const stamp = Date.now().toString(36).toUpperCase();
  const codePrefix = `SMOKE_GPH_${stamp}`;

  await cleanup(auth, 'SMOKE_GPH_');

  const list0 = await req('GET', '/api/catalog/gph-services', auth);
  assert(list0.ok && Array.isArray(list0.data), `list ${list0.status}`);

  const emps = await req('GET', '/api/employees?status=active&limit=50', auth);
  assert(emps.ok, `employees ${emps.status}`);
  const empItems = Array.isArray(emps.data) ? emps.data : emps.data.items || [];
  assert(empItems.length >= 1, 'active employees yo‘q');
  const emp = empItems[0];

  const contracts = await req('GET', '/api/catalog/gph-contracts', auth);
  assert(contracts.ok && Array.isArray(contracts.data), `contracts ${contracts.status}`);

  let contract = contracts.data.find((c) => c.number && c.allowAddService !== false);
  let createdContract = false;
  if (!contract) {
    const createdC = await req('POST', '/api/catalog/gph-contracts', {
      ...auth,
      body: {
        employeeId: emp.id,
        number: `SMOKE-GPH-C-${stamp}`,
        title: 'SMOKE GPH contract',
        startDate: '2026-08-01',
        allowAddService: true,
        status: 'draft',
      },
    });
    assert(createdC.ok, `create contract ${createdC.status} ${JSON.stringify(createdC.data)}`);
    contract = createdC.data;
    createdContract = true;
  }
  assert(contract && contract.id, 'contract kerak');

  const created = await req('POST', '/api/catalog/gph-services', {
    ...auth,
    body: {
      code: `${codePrefix}_1`,
      name: 'SMOKE_GPH услуга',
      contractId: contract.id,
      month: '2026-08-01',
      status: 'draft',
      unitPrice: 150000,
      unit: 'шт',
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  assert(created.data.status === 'draft', `status ${created.data.status}`);
  assert(ym(created.data.month) === '2026-08', `month ${created.data.month}`);
  assert(created.data.contract && created.data.contract.number === contract.number, 'contract.number');
  assert(created.data.contractId === contract.id, 'contractId');

  const person =
    created.data.contract.person ||
    created.data.contract.employee?.person ||
    created.data.contract.employee;
  const division = created.data.contract.division || created.data.contract.employee?.division;
  if (contract.personId || contract.employeeId) {
    assert(person, 'physical person include');
  }
  if (contract.divisionId || contract.employee?.divisionId) {
    assert(division, 'division include');
  }

  const patched = await req('PATCH', `/api/catalog/gph-services/${id}`, {
    ...auth,
    body: { status: 'posted', month: '2026-09-01' },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  assert(patched.data.status === 'posted', 'posted');
  assert(ym(patched.data.month) === '2026-09', `patched month ${patched.data.month}`);

  const filtered = await req(
    'GET',
    `/api/catalog/gph-services?contractId=${encodeURIComponent(contract.id)}&status=posted`,
    auth,
  );
  assert(filtered.ok && Array.isArray(filtered.data), `filter ${filtered.status}`);
  assert(
    filtered.data.some((r) => r.id === id),
    'filtered row yo‘q',
  );

  const byMonth = await req('GET', '/api/catalog/gph-services?from=2026-09-01&to=2026-09-30', auth);
  assert(byMonth.ok && (byMonth.data || []).some((r) => r.id === id), 'month from/to');

  const one = await req('GET', `/api/catalog/gph-services/${id}`, auth);
  assert(one.ok && one.data.contract && one.data.contract.number, `getOne ${one.status}`);

  const del = await req('DELETE', `/api/catalog/gph-services/${id}`, auth);
  assert(del.ok, `delete ${del.status}`);

  const gone = await req('GET', `/api/catalog/gph-services/${id}`, auth);
  assert(!gone.ok, 'deleted still exists');

  if (createdContract) {
    await req('DELETE', `/api/catalog/gph-contracts/${contract.id}`, auth);
  }

  const contractsStill = await req('GET', '/api/catalog/gph-contracts', auth);
  assert(contractsStill.ok && Array.isArray(contractsStill.data), 'gph-contracts regression');

  const accruals = await req('GET', '/api/payroll/accruals', auth);
  assert(accruals.ok && Array.isArray(accruals.data), `accruals ${accruals.status}`);

  const sheets = await req('GET', '/api/payroll/sheets', auth);
  assert(sheets.ok && Array.isArray(sheets.data), `sheets ${sheets.status}`);

  const manual = await req('GET', '/api/payroll/manual-ops', auth);
  assert(manual.ok && Array.isArray(manual.data), `manual-ops ${manual.status}`);

  const web = await fetch(`${WEB}/catalog/gph-services`).catch(() => null);
  if (web) {
    assert([200, 302, 307, 308].includes(web.status), `web ${web.status}`);
  }

  await cleanup(auth, codePrefix);
  console.log('gph-services smoke: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
