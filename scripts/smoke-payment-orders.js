/** Smoke: Поручения */
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
  const list = await req('GET', '/api/payroll/payment-orders', auth);
  for (const r of list.data || []) {
    if (!String(r.note || '').startsWith('SMOKE_PO')) continue;
    await req('DELETE', `/api/payroll/payment-orders/${r.id}`, auth);
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

  const created = await req('POST', '/api/payroll/payment-orders', {
    ...auth,
    body: {
      employeeId: emp.id,
      accrualName: 'Месячная оплата труда',
      amount: 111111.111111,
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      note: 'SMOKE_PO',
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.status === 'new', `status ${created.data.status}`);
  assert(created.data.accrualName === 'Месячная оплата труда', 'accrualName');
  assert(created.data.employee?.label, 'employee');
  const id = created.data.id;

  const listed = await req('GET', '/api/payroll/payment-orders', auth);
  assert(listed.ok && listed.data.some((r) => r.id === id), 'list');

  const patched = await req('PATCH', `/api/payroll/payment-orders/${id}`, {
    ...auth,
    body: { amount: 1481481.481481, note: 'SMOKE_PO updated' },
  });
  assert(patched.ok, `patch ${patched.status}`);

  const sent = await req('POST', `/api/payroll/payment-orders/${id}/send`, auth);
  assert(sent.ok && sent.data.status === 'sent', `send ${sent.status}`);

  const blockedDel = await req('DELETE', `/api/payroll/payment-orders/${id}`, auth);
  assert(!blockedDel.ok, 'sent cannot delete');

  const paid = await req('POST', `/api/payroll/payment-orders/${id}/pay`, auth);
  assert(paid.ok && paid.data.status === 'paid', 'pay');

  const blocked = await req('PATCH', `/api/payroll/payment-orders/${id}`, {
    ...auth,
    body: { note: 'nope' },
  });
  assert(!blocked.ok, 'paid cannot edit');

  const loans = await req('GET', '/api/payroll/loans', auth);
  assert(loans.ok, 'loans regression');

  const web = await fetch(`${WEB}/catalog/payment-orders`).catch(() => null);
  if (web) assert([200, 302, 307, 308].includes(web.status), `web ${web.status}`);

  await cleanup(auth);
  console.log('payment-orders smoke: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
