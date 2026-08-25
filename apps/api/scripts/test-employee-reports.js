/**
 * End-to-end smoke test for employee reports + related tabs API.
 * Usage: node scripts/test-employee-reports.js
 */
const API = process.env.API_URL || 'http://localhost:3001';

async function req(path, { method = 'GET', token, tenantId, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const results = [];
  const ok = (name) => results.push({ name, ok: true });
  const fail = (name, err) => results.push({ name, ok: false, err: String(err) });

  let token;
  let tenantId;
  let empId;

  try {
    const login = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@demo.local', password: 'Demo1234!' },
    });
    token = login.accessToken;
    tenantId = login.tenant?.id || login.user?.tenantId;
    assert(token, 'no accessToken');
    ok('login');
  } catch (e) {
    fail('login', e);
    console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }

  try {
    const list = await req('/api/employees?q=0001&limit=5', { token, tenantId });
    const items = list.items || list;
    const emp = Array.isArray(items)
      ? items.find((e) => e.tabNumber === '0001') || items[0]
      : null;
    assert(emp?.id, 'employee 0001 not found');
    empId = emp.id;
    ok('find employee 0001');
  } catch (e) {
    fail('find employee 0001', e);
  }

  if (!empId) {
    console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }

  // Detail payload for prior tabs
  try {
    const detail = await req(`/api/employees/${empId}`, { token, tenantId });
    assert(detail.efficiency, 'missing efficiency');
    assert(Array.isArray(detail.subordinates), 'missing subordinates');
    assert(detail.payrollSummary, 'missing payrollSummary');
    assert(Array.isArray(detail.education), 'missing education');
    assert(Array.isArray(detail.languages), 'missing languages');
    assert(Array.isArray(detail.requests), 'missing requests');
    ok('employee detail extras (efficiency/payroll/subs/edu)');
  } catch (e) {
    fail('employee detail extras', e);
  }

  for (const kind of ['attendance', 'discipline', 'bonus', 'accrual', 'time-types']) {
    try {
      const report = await req(`/api/employees/${empId}/reports/${kind}`, {
        token,
        tenantId,
      });
      assert(report.title, `${kind}: no title`);
      assert(report.settings, `${kind}: no settings`);
      assert(Array.isArray(report.rows), `${kind}: no rows array`);
      ok(`report ${kind}`);
    } catch (e) {
      fail(`report ${kind}`, e);
    }
  }

  try {
    const patched = await req(`/api/employees/${empId}/reports/attendance/settings`, {
      method: 'PATCH',
      token,
      tenantId,
      body: { showLate: false, showHoursWorked: true },
    });
    assert(patched.settings.showLate === false, 'showLate not saved');
    assert(patched.settings.showHoursWorked === true, 'showHoursWorked not saved');
    ok('save attendance settings');

    const report = await req(`/api/employees/${empId}/reports/attendance`, {
      token,
      tenantId,
    });
    assert(report.settings.showLate === false, 'settings not applied on report');
    assert(!report.columns.includes('lateMinutes'), 'lateMinutes column still present');
    ok('settings affect report columns');

    await req(`/api/employees/${empId}/reports/attendance/settings`, {
      method: 'PATCH',
      token,
      tenantId,
      body: { __reset: true },
    });
    ok('reset attendance settings');
  } catch (e) {
    fail('settings persist/apply', e);
  }

  try {
    const from = '2026-01-01';
    const to = '2026-12-31';
    const report = await req(
      `/api/employees/${empId}/reports/attendance?from=${from}&to=${to}`,
      { token, tenantId },
    );
    assert(report.from === from && report.to === to, 'range not echoed');
    ok('attendance date filter');
  } catch (e) {
    fail('attendance date filter', e);
  }

  // Schedule change requests
  try {
    const created = await req('/api/hr/requests', {
      method: 'POST',
      token,
      tenantId,
      body: {
        employeeId: empId,
        type: 'schedule_change',
        title: '[test] schedule change',
        payload: { note: 'test', startDate: '2026-09-01' },
      },
    });
    assert(created.id, 'no request id');
    const reviewed = await req(`/api/hr/requests/${created.id}/review`, {
      method: 'PATCH',
      token,
      tenantId,
      body: { status: 'approved', reviewNote: 'ok test' },
    });
    assert(reviewed.status === 'approved', 'not approved');
    ok('schedule request create+approve');
  } catch (e) {
    fail('schedule request create+approve', e);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        passed,
        failed: failed.length,
        empId,
        results,
      },
      null,
      2,
    ),
  );
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
