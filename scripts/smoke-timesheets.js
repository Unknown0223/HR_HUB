/** Smoke: Табель (TimesheetSheet documents) */
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

  const oldSheet = await req('GET', '/api/payroll/timesheet?year=2024&month=7', auth);
  assert(oldSheet.ok && Array.isArray(oldSheet.data), `legacy timesheet ${oldSheet.status}`);

  const list = await req('GET', '/api/payroll/timesheets', auth);
  assert(list.ok && Array.isArray(list.data), `list ${list.status}`);

  const settings = await req('GET', '/api/payroll/timesheets/settings', auth);
  assert(settings.ok && settings.data.allTimeTypes === true, `settings ${settings.status}`);
  const patched = await req('PATCH', '/api/payroll/timesheets/settings', {
    ...auth,
    body: { showPlannedDays: true, showWorkedHours: true },
  });
  assert(patched.ok && patched.data.showPlannedDays === true, 'settings patch');

  const noMonth = await req('POST', '/api/payroll/timesheets', {
    ...auth,
    body: { docDate: '2024-07-18' },
  });
  assert(!noMonth.ok, 'month required');

  const noDate = await req('POST', '/api/payroll/timesheets', {
    ...auth,
    body: { month: '2024-07-01' },
  });
  assert(!noDate.ok, 'docDate required');

  const created = await req('POST', '/api/payroll/timesheets', {
    ...auth,
    body: {
      docDate: '2024-07-18',
      month: '2024-07-01',
      note: 'SMOKE_TS',
      periodType: 'full_month',
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  assert(String(created.data.number || '').length === 10, `padded number ${created.data.number}`);
  assert(created.data.status === 'draft', 'draft');
  assert(created.data.posted === false, 'not posted');

  const got = await req('GET', `/api/payroll/timesheets/${id}`, auth);
  assert(got.ok && got.data.note === 'SMOKE_TS', 'get');

  const fill = await req('POST', '/api/payroll/timesheets/fill', {
    ...auth,
    body: { month: '2024-07-01' },
  });
  assert(fill.ok && Array.isArray(fill.data.lines), `fill ${fill.status}`);

  const updated = await req('PATCH', `/api/payroll/timesheets/${id}`, {
    ...auth,
    body: { note: 'SMOKE_TS_UPD', lines: fill.data.lines.slice(0, 2) },
  });
  assert(updated.ok && updated.data.note === 'SMOKE_TS_UPD', 'patch');

  const posted = await req('POST', `/api/payroll/timesheets/${id}/post`, auth);
  assert(posted.ok && posted.data.status === 'posted', `post ${posted.status}`);

  const patchPosted = await req('PATCH', `/api/payroll/timesheets/${id}`, {
    ...auth,
    body: { note: 'nope' },
  });
  assert(!patchPosted.ok, 'cannot patch posted');

  const cancelled = await req('POST', `/api/payroll/timesheets/${id}/cancel`, auth);
  assert(cancelled.ok && cancelled.data.status === 'cancelled', 'cancel');

  const del = await req('DELETE', `/api/payroll/timesheets/${id}`, auth);
  assert(del.ok, `delete ${del.status}`);

  const a = await req('POST', '/api/payroll/timesheets', {
    ...auth,
    body: { docDate: '2024-06-01', month: '2024-06-01', note: 'SMOKE_TS_A' },
  });
  const b = await req('POST', '/api/payroll/timesheets', {
    ...auth,
    body: { docDate: '2024-06-02', month: '2024-06-01', note: 'SMOKE_TS_B' },
  });
  assert(a.ok && b.ok, 'bulk seeds');
  const bulkPost = await req('POST', '/api/payroll/timesheets/bulk-post', {
    ...auth,
    body: { ids: [a.data.id, b.data.id] },
  });
  assert(bulkPost.ok && bulkPost.data.posted === 2, `bulk post ${JSON.stringify(bulkPost.data)}`);
  const bulkCancel = await req('POST', '/api/payroll/timesheets/bulk-cancel', {
    ...auth,
    body: { ids: [a.data.id] },
  });
  assert(bulkCancel.ok && bulkCancel.data.cancelled === 1, 'bulk cancel');
  const bulkDel = await req('POST', '/api/payroll/timesheets/bulk-delete', {
    ...auth,
    body: { ids: [a.data.id, b.data.id] },
  });
  assert(bulkDel.ok, 'bulk delete');

  const leftover = await req('GET', '/api/payroll/timesheets', auth);
  const leftoverIds = (leftover.data || [])
    .filter((r) => String(r.note || '').startsWith('SMOKE_TS'))
    .map((r) => r.id);
  if (leftoverIds.length) {
    await req('POST', '/api/payroll/timesheets/bulk-delete', {
      ...auth,
      body: { ids: leftoverIds },
    });
  }

  const stillPolicies = await req('GET', '/api/payroll/policies', auth);
  assert(stillPolicies.ok && Array.isArray(stillPolicies.data), 'PayrollPolicy intact');

  console.log('✓ timesheets API smoke ok');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
