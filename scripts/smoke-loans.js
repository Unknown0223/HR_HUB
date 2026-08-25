/** Smoke: Займы */
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
  const list = await req('GET', '/api/payroll/loans', auth);
  for (const r of list.data || []) {
    if (!String(r.note || '').startsWith('SMOKE_LOAN')) continue;
    await req('POST', `/api/payroll/loans/${r.id}/reopen`, auth);
    await req('DELETE', `/api/payroll/loans/${r.id}`, auth);
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

  const created = await req('POST', '/api/payroll/loans', {
    ...auth,
    body: {
      loanDate: '2026-08-19',
      contractNumber: 'Д-SMOKE',
      contractDate: '2026-08-18',
      employeeId: emp.id,
      startDate: '2026-08-01',
      endDate: '2026-12-01',
      principal: 5000000,
      currency: 'UZS',
      note: 'SMOKE_LOAN',
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.status === 'draft', `status ${created.data.status}`);
  assert(Number(created.data.principal) === 5000000, 'principal');
  assert(Number(created.data.remaining) === 5000000, 'remaining');
  assert(created.data.employee?.label, 'employee label');
  const id = created.data.id;

  const listed = await req('GET', '/api/payroll/loans', auth);
  assert(listed.ok && listed.data.some((r) => r.id === id), 'list');

  const patched = await req('PATCH', `/api/payroll/loans/${id}`, {
    ...auth,
    body: { principal: 6000000, note: 'SMOKE_LOAN updated' },
  });
  assert(patched.ok, `patch ${patched.status}`);
  assert(Number(patched.data.principal) === 6000000, 'patched principal');
  assert(Number(patched.data.remaining) === 6000000, 'draft remaining follows principal');

  const completed = await req('POST', `/api/payroll/loans/${id}/complete`, auth);
  assert(completed.ok && completed.data.status === 'active', `complete ${completed.status}`);

  const blockedDel = await req('DELETE', `/api/payroll/loans/${id}`, auth);
  assert(!blockedDel.ok, 'active cannot delete');

  const closed = await req('POST', `/api/payroll/loans/${id}/close`, auth);
  assert(closed.ok && closed.data.status === 'closed', 'close');

  const blocked = await req('PATCH', `/api/payroll/loans/${id}`, {
    ...auth,
    body: { note: 'nope' },
  });
  assert(!blocked.ok, 'closed cannot edit');

  const ot = await req('GET', '/api/payroll/one-time-accruals', auth);
  assert(ot.ok, 'one-time regression');
  const sales = await req('GET', '/api/payroll/sales-accruals', auth);
  assert(sales.ok, 'sales regression');

  const web = await fetch(`${WEB}/catalog/loans`).catch(() => null);
  if (web) assert([200, 302, 307, 308].includes(web.status), `web ${web.status}`);

  await cleanup(auth);
  console.log('loans smoke: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
