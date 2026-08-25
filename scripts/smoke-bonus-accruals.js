/** Smoke: Бонусные начисления */
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

async function cleanup(auth) {
  const list = await req('GET', '/api/payroll/bonus-accruals', auth);
  for (const r of list.data || []) {
    if (!String(r.note || '').startsWith('SMOKE_BONUS')) continue;
    await req('POST', `/api/payroll/bonus-accruals/${r.id}/unpost`, auth);
    await req('DELETE', `/api/payroll/bonus-accruals/${r.id}`, auth);
  }
}

async function main() {
  const login = await req('POST', '/api/auth/login', {
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  assert(login.ok, `login ${login.status}`);
  const token = login.data.accessToken;
  let tenant = login.data.tenant?.id || login.data.user?.tenantId;
  if (!tenant) {
    const me = await req('GET', '/api/me', { token });
    tenant = me.data?.tenantId || me.data?.tenant?.id;
  }
  const auth = { token, tenant };
  await cleanup(auth);

  const emps = await req('GET', '/api/employees?status=active&limit=20', auth);
  const empItems = Array.isArray(emps.data) ? emps.data : emps.data.items || [];
  assert(empItems.length >= 1, 'employees');
  const emp = empItems[0];

  const fill = await req('POST', '/api/payroll/bonus-accruals/fill', {
    ...auth,
    body: { kind: 'fact', employeeIds: [emp.id], considerPayroll: false },
  });
  assert(fill.ok && fill.data.lines?.length >= 1, `fill ${fill.status} ${JSON.stringify(fill.data)}`);

  const created = await req('POST', '/api/payroll/bonus-accruals', {
    ...auth,
    body: {
      kind: 'fact',
      docDate: '2026-08-19',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      considerPayroll: true,
      note: 'SMOKE_BONUS',
      lines: [
        {
          employeeId: emp.id,
          typeName: 'Факт',
          accrualName: 'Бонус',
          amount: 111000,
        },
      ],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.kind === 'fact', 'kind');
  assert(created.data.status === 'draft', `status ${created.data.status}`);
  assert(created.data.number, 'number');
  assert(Number(created.data.totalAmount) === 111000, `total ${created.data.totalAmount}`);
  assert(created.data.considerPayroll === true, 'considerPayroll');
  assert(created.data.lines?.length === 1, 'lines');
  const id = created.data.id;

  const listed = await req('GET', '/api/payroll/bonus-accruals', auth);
  assert(listed.ok && listed.data.some((r) => r.id === id), 'list');

  const patched = await req('PATCH', `/api/payroll/bonus-accruals/${id}`, {
    ...auth,
    body: {
      note: 'SMOKE_BONUS updated',
      lines: [{ employeeId: emp.id, typeName: 'Факт', accrualName: 'Бонус', amount: 222000 }],
    },
  });
  assert(patched.ok, `patch ${patched.status}`);
  assert(Number(patched.data.totalAmount) === 222000, 'patched total');

  const posted = await req('POST', `/api/payroll/bonus-accruals/${id}/post`, auth);
  assert(posted.ok && posted.data.status === 'posted', `post ${posted.status}`);

  const blocked = await req('PATCH', `/api/payroll/bonus-accruals/${id}`, {
    ...auth,
    body: { note: 'nope' },
  });
  assert(!blocked.ok, 'posted cannot edit');

  const unposted = await req('POST', `/api/payroll/bonus-accruals/${id}/unpost`, auth);
  assert(unposted.ok && unposted.data.status === 'draft', 'unpost');

  const kpi = await req('POST', '/api/payroll/bonus-accruals', {
    ...auth,
    body: {
      kind: 'kpi',
      docDate: '2026-08-19',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      note: 'SMOKE_BONUS_KPI',
      lines: [
        {
          employeeId: emp.id,
          accrualName: 'КПЭ',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          amount: 50000,
        },
      ],
    },
  });
  assert(kpi.ok && kpi.data.kind === 'kpi', `kpi ${kpi.status} ${JSON.stringify(kpi.data)}`);
  assert(Number(kpi.data.totalAmount) === 50000, 'kpi total');

  const travel = await req('GET', '/api/payroll/travel-expenses', auth);
  assert(travel.ok, 'travel regression');

  const web = await fetch(`${WEB}/catalog/bonus-accruals`).catch(() => null);
  if (web) assert([200, 302, 307, 308].includes(web.status), `web ${web.status}`);

  await cleanup(auth);
  console.log('bonus-accruals smoke: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
