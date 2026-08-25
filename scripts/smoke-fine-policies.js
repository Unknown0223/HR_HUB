/** Smoke: Политики штрафов (FinePolicy, not PayrollPolicy) */
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

  const payrollPolicies = await req('GET', '/api/payroll/policies', auth);
  assert(payrollPolicies.ok, `payroll policies ${payrollPolicies.status}`);
  assert(Array.isArray(payrollPolicies.data), 'payroll policies must stay an array');

  const empty = await req('GET', '/api/payroll/fine-policies?scope=company', auth);
  assert(empty.ok, `list ${empty.status} ${JSON.stringify(empty.data)}`);
  assert(Array.isArray(empty.data), 'list must be array');

  const noMonth = await req('POST', '/api/payroll/fine-policies', {
    ...auth,
    body: { scope: 'company', name: 'no month' },
  });
  assert(!noMonth.ok, 'month required');

  const noDiv = await req('POST', '/api/payroll/fine-policies', {
    ...auth,
    body: { scope: 'division', month: '2024-03-01', name: 'no div' },
  });
  assert(noDiv.status === 400, `division required ${noDiv.status}`);

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  assert(lookups.ok, `lookups ${lookups.status}`);
  const division = (lookups.data.divisions || [])[0];
  const position = (lookups.data.positions || [])[0];
  const employee = (lookups.data.employees || [])[0];
  assert(division, 'need a division');
  assert(position, 'need a position');
  assert(employee, 'need an employee');

  const stamp = Date.now().toString(36);
  const created = await req('POST', '/api/payroll/fine-policies', {
    ...auth,
    body: {
      scope: 'company',
      month: '2024-03-01',
      name: `SMOKE_FP_${stamp}`,
      isActive: true,
      rules: {
        late: [
          {
            timeFrom: 1,
            timeTo: 15,
            repeatFrom: 1,
            repeatTo: 3,
            type: 'coefficient',
            value: 1.5,
            onlyInsidePeriod: true,
          },
        ],
        early: [
          {
            timeFrom: 5,
            timeTo: 30,
            type: 'amount',
            value: 50000,
            periodicityMin: 60,
          },
        ],
        absence: [{ type: 'time', value: 30, timeFrom: 0, timeTo: 60 }],
        missed_day: [{ type: 'annulment', repeatFrom: 1, repeatTo: 1 }],
        missed_mark: [{ type: 'percent', value: 10, repeatFrom: 1 }],
      },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.scope === 'company', 'scope company');
  assert(created.data.month.startsWith('2024-03'), `month ${created.data.month}`);
  assert(created.data.rules.late.length === 1, 'late rule');
  assert(created.data.rules.late[0].type === 'coefficient', 'late type');
  assert(created.data.rules.early[0].type === 'amount', 'early type');
  assert(created.data.rules.absence[0].type === 'time', 'absence type');
  assert(created.data.rules.missed_day[0].type === 'annulment', 'missed_day type');
  assert(created.data.rules.missed_mark[0].type === 'percent', 'missed_mark type');
  const id = created.data.id;

  const got = await req('GET', `/api/payroll/fine-policies/${id}`, auth);
  assert(got.ok, `get ${got.status}`);
  assert(got.data.name === `SMOKE_FP_${stamp}`, 'name stored');

  const patched = await req('PATCH', `/api/payroll/fine-policies/${id}`, {
    ...auth,
    body: { name: `SMOKE_FP_${stamp}_U` },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  assert(patched.data.name === `SMOKE_FP_${stamp}_U`, 'name patched');
  assert(patched.data.rules.late.length === 1, 'rules kept on name patch');

  const copied = await req('POST', `/api/payroll/fine-policies/${id}/copy`, auth);
  assert(copied.ok, `copy ${copied.status} ${JSON.stringify(copied.data)}`);
  assert(copied.data.id !== id, 'copy is new row');
  assert(String(copied.data.name).includes('копия'), `copy name ${copied.data.name}`);
  assert(copied.data.month.startsWith('2024-03'), 'copy same month');

  const byDiv = await req('POST', '/api/payroll/fine-policies', {
    ...auth,
    body: {
      scope: 'division',
      month: '2024-03-01',
      name: `DIV_${stamp}`,
      divisionId: division.id,
    },
  });
  assert(byDiv.ok, `div ${byDiv.status} ${JSON.stringify(byDiv.data)}`);
  assert(byDiv.data.division?.name, 'division name hydrated');

  const byPos = await req('POST', '/api/payroll/fine-policies', {
    ...auth,
    body: {
      scope: 'position',
      month: '2025-03-01',
      positionId: position.id,
    },
  });
  assert(byPos.ok, `pos ${byPos.status} ${JSON.stringify(byPos.data)}`);
  assert(byPos.data.position?.name, 'position name hydrated');

  const byEmp = await req('POST', '/api/payroll/fine-policies', {
    ...auth,
    body: {
      scope: 'employee',
      month: '2024-03-01',
      employeeIds: [employee.id],
    },
  });
  assert(byEmp.ok, `emp ${byEmp.status} ${JSON.stringify(byEmp.data)}`);
  assert(byEmp.data.employees?.length === 1, 'employee hydrated');

  const listDiv = await req('GET', '/api/payroll/fine-policies?scope=division', auth);
  assert(listDiv.ok, `list div ${listDiv.status}`);
  assert(
    listDiv.data.some((r) => r.id === byDiv.data.id),
    'division row in scoped list',
  );
  assert(
    !listDiv.data.some((r) => r.id === id),
    'company row not in division list',
  );

  const bulk = await req('POST', '/api/payroll/fine-policies/bulk-delete', {
    ...auth,
    body: {
      ids: [id, copied.data.id, byDiv.data.id, byPos.data.id, byEmp.data.id],
    },
  });
  assert(bulk.ok, `bulk ${bulk.status} ${JSON.stringify(bulk.data)}`);
  assert(bulk.data.deleted >= 5, `deleted ${bulk.data.deleted}`);

  const gone = await req('GET', `/api/payroll/fine-policies/${id}`, auth);
  assert(gone.status === 404, `deleted get ${gone.status}`);

  console.log('smoke:fine-policies ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
