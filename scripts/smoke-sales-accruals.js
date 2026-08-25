/** Smoke: Начисления процентов от продаж + Настройка процентов */
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
  const list = await req('GET', '/api/payroll/sales-accruals', auth);
  for (const r of list.data || []) {
    if (!String(r.note || '').startsWith('SMOKE_SALES')) continue;
    await req('POST', `/api/payroll/sales-accruals/${r.id}/unpost`, auth);
    await req('DELETE', `/api/payroll/sales-accruals/${r.id}`, auth);
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

  const rates = await req('GET', '/api/payroll/sales-accruals/rates', auth);
  assert(rates.ok && Array.isArray(rates.data) && rates.data.length >= 1, `rates ${rates.status}`);
  const pos = rates.data[0];
  const saved = await req('PATCH', '/api/payroll/sales-accruals/rates', {
    ...auth,
    body: {
      rows: [
        { positionId: pos.positionId, personalPercent: 7.5, divisionPercent: 2 },
        ...rates.data.slice(1).map((r) => ({
          positionId: r.positionId,
          personalPercent: r.personalPercent,
          divisionPercent: r.divisionPercent,
        })),
      ],
    },
  });
  assert(saved.ok, `save rates ${saved.status} ${JSON.stringify(saved.data)}`);
  const savedPos = (saved.data || []).find((r) => r.positionId === pos.positionId);
  assert(Number(savedPos.personalPercent) === 7.5, `personal ${savedPos?.personalPercent}`);

  const emps = await req('GET', '/api/employees?status=active&limit=20', auth);
  const empItems = Array.isArray(emps.data) ? emps.data : emps.data.items || [];
  assert(empItems.length >= 1, 'employees');
  const emp = empItems.find((e) => e.positionId === pos.positionId) || empItems[0];

  const noCash = await req('POST', '/api/payroll/sales-accruals', {
    ...auth,
    body: {
      docDate: '2026-08-18',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-18',
      paymentType: 'cash',
      note: 'SMOKE_SALES_NOCASH',
    },
  });
  assert(!noCash.ok, 'cashbox required');

  const created = await req('POST', '/api/payroll/sales-accruals', {
    ...auth,
    body: {
      docDate: '2026-08-18',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-18',
      paymentType: 'cash',
      cashbox: 'Основная касса',
      salesKind: 'personal',
      rounding: '####.000000',
      note: 'SMOKE_SALES',
      lines: [
        {
          employeeId: emp.id,
          positionId: emp.positionId || pos.positionId,
          salesKind: 'personal',
          percent: 7.5,
          salesAmount: 200000,
        },
      ],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  assert(created.data.status === 'draft', 'draft');
  assert(String(created.data.number).length >= 1, 'number');
  assert(Number(created.data.totalAmount) === 15000, `amount ${created.data.totalAmount}`);
  assert(created.data.lines.length === 1, 'line');

  const filled = await req('POST', '/api/payroll/sales-accruals/fill', {
    ...auth,
    body: { salesKind: 'personal', positionId: pos.positionId },
  });
  assert(filled.ok && Array.isArray(filled.data.lines), `fill ${filled.status}`);

  const calc = await req('POST', '/api/payroll/sales-accruals/calculate', {
    ...auth,
    body: {
      rounding: '###.##',
      lines: [{ employeeId: emp.id, percent: 10, salesAmount: 333 }],
    },
  });
  assert(calc.ok, `calc ${calc.status}`);
  assert(Number(calc.data.totalAmount) === 33.3, `calc amount ${calc.data.totalAmount}`);

  const patched = await req('PATCH', `/api/payroll/sales-accruals/${id}`, {
    ...auth,
    body: {
      paymentType: 'bank',
      bankAccount: '2020 0000 SMOKE',
      lines: [
        {
          employeeId: emp.id,
          percent: 10,
          salesAmount: 100000,
        },
      ],
    },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  assert(patched.data.paymentType === 'bank', 'bank');
  assert(Number(patched.data.totalAmount) === 10000, `patched ${patched.data.totalAmount}`);

  const posted = await req('POST', `/api/payroll/sales-accruals/${id}/post`, auth);
  assert(posted.ok && posted.data.status === 'posted', `post ${posted.status}`);

  const badDel = await req('DELETE', `/api/payroll/sales-accruals/${id}`, auth);
  assert(!badDel.ok, 'posted delete blocked');

  const unpost = await req('POST', `/api/payroll/sales-accruals/${id}/unpost`, auth);
  assert(unpost.ok && unpost.data.status === 'draft', 'unpost');

  const del = await req('DELETE', `/api/payroll/sales-accruals/${id}`, auth);
  assert(del.ok, `delete ${del.status}`);

  const list = await req('GET', '/api/catalog/sales-accruals', auth);
  assert(list.ok && Array.isArray(list.data), `catalog list ${list.status}`);

  const contracts = await req('GET', '/api/catalog/gph-contracts', auth);
  assert(contracts.ok, `gph-contracts ${contracts.status}`);
  const accruals = await req('GET', '/api/payroll/accruals', auth);
  assert(accruals.ok, `accruals ${accruals.status}`);
  const sheets = await req('GET', '/api/payroll/sheets', auth);
  assert(sheets.ok, `sheets ${sheets.status}`);

  const web = await fetch(`${WEB}/catalog/sales-accruals`).catch(() => null);
  if (web) assert([200, 302, 307, 308].includes(web.status), `web ${web.status}`);

  await cleanup(auth);
  console.log('sales-accruals smoke: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
