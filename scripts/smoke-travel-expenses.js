/** Smoke: Авансовый отчет по командировке */
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
  const list = await req('GET', '/api/payroll/travel-expenses', auth);
  for (const r of list.data || []) {
    if (!String(r.note || '').startsWith('SMOKE_TRAVEL')) continue;
    await req('DELETE', `/api/payroll/travel-expenses/${r.id}`, auth);
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

  let trips = await req('GET', `/api/payroll/travel-expenses/trips?employeeId=${emp.id}`, auth);
  assert(trips.ok, `trips ${trips.status} ${JSON.stringify(trips.data)}`);
  let trip = (trips.data || [])[0];
  if (!trip) {
    const createdTrip = await req('POST', '/api/catalog/internal-trips', {
      ...auth,
      body: {
        employeeId: emp.id,
        title: 'SMOKE_TRIP',
        startDate: '2026-08-17',
        endDate: '2026-08-19',
      },
    });
    assert(createdTrip.ok, `trip create ${createdTrip.status} ${JSON.stringify(createdTrip.data)}`);
    trips = await req('GET', `/api/payroll/travel-expenses/trips?employeeId=${emp.id}`, auth);
    trip = (trips.data || []).find((t) => t.id === createdTrip.data.id) || (trips.data || [])[0];
  }
  assert(trip && trip.id, 'trip required');

  const created = await req('POST', '/api/payroll/travel-expenses', {
    ...auth,
    body: {
      docDate: '2026-08-19',
      employeeId: emp.id,
      tripId: trip.id,
      currency: 'UZS',
      advance: 500000,
      calcForSalary: false,
      note: 'SMOKE_TRAVEL',
      lines: [
        {
          accrualName: 'Командировочные',
          startDate: '2026-08-17',
          endDate: '2026-08-19',
          amount: 120000,
          note: 'transport',
        },
      ],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.status === 'draft', `status ${created.data.status}`);
  assert(created.data.number, 'number');
  assert(created.data.employee?.label, 'employee label');
  assert(Number(created.data.advance) === 500000, `advance ${created.data.advance}`);
  assert(Number(created.data.amount) === 120000, `amount ${created.data.amount}`);
  assert(Number(created.data.balance) === 380000, `balance ${created.data.balance}`);
  assert(created.data.tripDays >= 1, 'tripDays');
  assert(Array.isArray(created.data.lines) && created.data.lines.length === 1, 'lines');
  const id = created.data.id;

  const listed = await req('GET', '/api/payroll/travel-expenses', auth);
  assert(listed.ok && listed.data.some((r) => r.id === id), 'list');

  const patched = await req('PATCH', `/api/payroll/travel-expenses/${id}`, {
    ...auth,
    body: {
      calcForSalary: true,
      note: 'SMOKE_TRAVEL updated',
      lines: [
        {
          accrualName: 'Командировочные',
          startDate: '2026-08-17',
          endDate: '2026-08-19',
          amount: 200000,
          note: 'hotel',
        },
      ],
    },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  assert(Number(patched.data.amount) === 200000, 'patched amount');
  assert(Number(patched.data.balance) === 300000, `patched balance ${patched.data.balance}`);
  assert(patched.data.calcForSalary === true, 'calcForSalary');

  const completed = await req('POST', `/api/payroll/travel-expenses/${id}/complete`, auth);
  assert(completed.ok, `complete ${completed.status} ${JSON.stringify(completed.data)}`);
  assert(completed.data.status === 'approved', `completed status ${completed.data.status}`);

  const blockedPatch = await req('PATCH', `/api/payroll/travel-expenses/${id}`, {
    ...auth,
    body: { note: 'nope' },
  });
  assert(!blockedPatch.ok, 'approved cannot edit');

  const blockedDel = await req('DELETE', `/api/payroll/travel-expenses/${id}`, auth);
  assert(!blockedDel.ok, 'approved cannot delete');

  const loans = await req('GET', '/api/payroll/loans', auth);
  assert(loans.ok, 'loans regression');

  const web = await fetch(`${WEB}/catalog/travel-expenses`).catch(() => null);
  if (web) assert([200, 302, 307, 308].includes(web.status), `web ${web.status}`);

  console.log('travel-expenses smoke: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
