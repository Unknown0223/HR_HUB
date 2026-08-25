/** Smoke: Политика доплат (AllowancePolicy) */
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
  assert(payrollPolicies.ok && Array.isArray(payrollPolicies.data), 'payroll policies');

  const empty = await req('GET', '/api/payroll/allowance-policies?scope=company', auth);
  assert(empty.ok && Array.isArray(empty.data), `list ${empty.status}`);

  const noMonth = await req('POST', '/api/payroll/allowance-policies', {
    ...auth,
    body: { scope: 'company', name: 'no month' },
  });
  assert(!noMonth.ok, 'month required');

  const noDiv = await req('POST', '/api/payroll/allowance-policies', {
    ...auth,
    body: { scope: 'division', month: '2024-03-01' },
  });
  assert(noDiv.status === 400, `division required ${noDiv.status}`);

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  assert(lookups.ok, `lookups ${lookups.status}`);
  const division = (lookups.data.divisions || [])[0];
  const schedule = (lookups.data.schedules || [])[0];
  assert(division, 'need a division');
  assert(schedule, 'need a schedule');

  const stamp = Date.now().toString(36);
  const created = await req('POST', '/api/payroll/allowance-policies', {
    ...auth,
    body: {
      scope: 'company',
      month: '2024-03-01',
      name: `SMOKE_AP_${stamp}`,
      isActive: true,
      rules: [
        { startTime: '18:00', endTime: '22:00', coefficient: 1.5 },
        { startTime: '22:00', endTime: '06:00', coefficient: 2 },
      ],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.scope === 'company', 'scope');
  assert(created.data.month.startsWith('2024-03'), created.data.month);
  assert(created.data.rules.length === 2, 'two rules');
  assert(created.data.rules[0].startTime === '18:00', 'startTime');
  assert(created.data.rules[0].coefficient === 1.5, 'coef');
  const id = created.data.id;

  const got = await req('GET', `/api/payroll/allowance-policies/${id}`, auth);
  assert(got.ok && got.data.name === `SMOKE_AP_${stamp}`, 'get name');

  const patched = await req('PATCH', `/api/payroll/allowance-policies/${id}`, {
    ...auth,
    body: { name: `SMOKE_AP_${stamp}_U` },
  });
  assert(patched.ok && patched.data.name.endsWith('_U'), 'patched name');
  assert(patched.data.rules.length === 2, 'rules kept');

  const copied = await req('POST', `/api/payroll/allowance-policies/${id}/copy`, auth);
  assert(copied.ok && copied.data.id !== id, 'copy id');
  assert(String(copied.data.name).includes('копия'), copied.data.name);

  const byDiv = await req('POST', '/api/payroll/allowance-policies', {
    ...auth,
    body: {
      scope: 'division',
      month: '2024-03-01',
      name: `DIV_${stamp}`,
      divisionId: division.id,
      rules: [{ startTime: '20:00', endTime: '23:00', coefficient: 1.25 }],
    },
  });
  assert(byDiv.ok, `div ${byDiv.status} ${JSON.stringify(byDiv.data)}`);
  assert(byDiv.data.division?.name, 'division hydrated');

  const bySch = await req('POST', '/api/payroll/allowance-policies', {
    ...auth,
    body: {
      scope: 'schedule',
      month: '2025-03-01',
      scheduleId: schedule.id,
    },
  });
  assert(bySch.ok, `sch ${bySch.status} ${JSON.stringify(bySch.data)}`);
  assert(bySch.data.schedule?.name, 'schedule hydrated');

  const listDiv = await req('GET', '/api/payroll/allowance-policies?scope=division', auth);
  assert(listDiv.data.some((r) => r.id === byDiv.data.id), 'div in scoped list');
  assert(!listDiv.data.some((r) => r.id === id), 'company not in div list');

  const badRule = await req('POST', '/api/payroll/allowance-policies', {
    ...auth,
    body: {
      scope: 'company',
      month: '2024-04-01',
      rules: [{ startTime: '18:00', coefficient: 1 }],
    },
  });
  assert(badRule.status === 400, `incomplete rule ${badRule.status}`);

  const bulk = await req('POST', '/api/payroll/allowance-policies/bulk-delete', {
    ...auth,
    body: { ids: [id, copied.data.id, byDiv.data.id, bySch.data.id] },
  });
  assert(bulk.ok && bulk.data.deleted >= 4, `deleted ${JSON.stringify(bulk.data)}`);

  const gone = await req('GET', `/api/payroll/allowance-policies/${id}`, auth);
  assert(gone.status === 404, `deleted get ${gone.status}`);

  console.log('smoke:allowance-policies ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
