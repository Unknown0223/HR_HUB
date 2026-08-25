/** Smoke: Разовые начисления */
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
  for (const kind of ['accrual', 'deduction']) {
    const list = await req('GET', `/api/payroll/one-time-accruals?kind=${kind}`, auth);
    for (const r of list.data || []) {
      if (!String(r.note || '').startsWith('SMOKE_OT')) continue;
      await req('POST', `/api/payroll/one-time-accruals/${r.id}/unpost`, auth);
      await req('DELETE', `/api/payroll/one-time-accruals/${r.id}`, auth);
    }
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
  const types = await req('GET', '/api/catalog/accrual-types', auth);
  const typeList = Array.isArray(types.data) ? types.data : types.data?.items || [];
  const accType = typeList[0];

  const fill = await req('POST', '/api/payroll/one-time-accruals/fill', {
    ...auth,
    body: { kind: 'accrual', employeeIds: [emp.id], lineDate: '2026-08-18' },
  });
  assert(fill.ok && fill.data.lines?.length >= 1, `fill ${fill.status} ${JSON.stringify(fill.data)}`);

  const created = await req('POST', '/api/payroll/one-time-accruals', {
    ...auth,
    body: {
      kind: 'accrual',
      docDate: '2026-08-18',
      month: '2026-08-01',
      title: 'SMOKE one-time',
      currency: 'UZS',
      calcType: 'value',
      note: 'SMOKE_OT',
      lines: [
        {
          employeeId: emp.id,
          typeId: accType?.id,
          typeName: accType?.name,
          lineDate: '2026-08-18',
          amount: 150000,
          note: 'bonus',
        },
      ],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.kind === 'accrual', 'kind');
  assert(Number(created.data.totalAmount) === 150000, `total ${created.data.totalAmount}`);
  assert(created.data.lines?.length === 1, 'lines');
  const id = created.data.id;

  const listed = await req('GET', '/api/payroll/one-time-accruals?kind=accrual', auth);
  assert(listed.ok && listed.data.some((r) => r.id === id), 'list');

  const patched = await req('PATCH', `/api/payroll/one-time-accruals/${id}`, {
    ...auth,
    body: {
      title: 'SMOKE one-time updated',
      calcType: 'value',
      lines: [{ employeeId: emp.id, amount: 200000, lineDate: '2026-08-18' }],
    },
  });
  assert(patched.ok, `patch ${patched.status}`);
  assert(Number(patched.data.totalAmount) === 200000, `patched total ${patched.data.totalAmount}`);

  const posted = await req('POST', `/api/payroll/one-time-accruals/${id}/post`, auth);
  assert(posted.ok && posted.data.status === 'posted', `post ${posted.status}`);

  const blocked = await req('PATCH', `/api/payroll/one-time-accruals/${id}`, {
    ...auth,
    body: { title: 'nope' },
  });
  assert(!blocked.ok, 'posted cannot edit');

  const unposted = await req('POST', `/api/payroll/one-time-accruals/${id}/unpost`, auth);
  assert(unposted.ok && unposted.data.status === 'draft', 'unpost');

  const ded = await req('POST', '/api/payroll/one-time-accruals', {
    ...auth,
    body: {
      kind: 'deduction',
      docDate: '2026-08-18',
      month: '2026-08-01',
      currency: 'UZS',
      calcType: 'value',
      note: 'SMOKE_OT_DED',
      lines: [{ employeeId: emp.id, amount: 1000, lineDate: '2026-08-18' }],
    },
  });
  assert(ded.ok && ded.data.kind === 'deduction', `deduction ${ded.status}`);

  const sales = await req('GET', '/api/payroll/sales-accruals', auth);
  assert(sales.ok, 'sales regression');
  const accruals = await req('GET', '/api/payroll/accruals', auth);
  assert(accruals.ok, 'accruals regression');

  const web = await fetch(`${WEB}/catalog/one-time-accruals`).catch(() => null);
  if (web) assert([200, 302, 307, 308].includes(web.status), `web ${web.status}`);

  await cleanup(auth);
  console.log('one-time-accruals smoke: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
