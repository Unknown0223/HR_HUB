/**
 * Smoke: Verifix backend 1:1 critical chains (login → workflows).
 * Usage: node scripts/smoke-backend-1to1.js
 * Requires API on :3001 and seeded demo tenant.
 */
const BASE = process.env.API_URL || 'http://127.0.0.1:3001/api';

async function req(path, { method = 'GET', token, tenantId, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const checks = [];
  const pass = (name) => {
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  };
  const fail = (name, err) => {
    checks.push({ name, ok: false, err: String(err) });
    console.error(`✗ ${name}: ${err}`);
  };

  const login = await req('/auth/login', {
    method: 'POST',
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  assert(login.ok, `login failed ${login.status}`);
  const token = login.data.accessToken;
  const tenantId = login.data.tenant?.id || login.data.user?.tenantId;
  assert(token && tenantId, 'missing token/tenantId');
  pass('login');

  const auth = { token, tenantId };

  // Absences → approve → leave days
  try {
    const abs = await req('/hr/absences', auth);
    assert(abs.ok && Array.isArray(abs.data), 'list absences');
    const pending = abs.data.find((a) => a.status === 'pending');
    assert(pending, 'need pending absence in seed');
    const approve = await req(`/hr/absences/${pending.id}/status`, {
      ...auth,
      method: 'PATCH',
      body: { status: 'approved' },
    });
    assert(approve.ok, `approve absence ${approve.status} ${JSON.stringify(approve.data)}`);
    const ts = await req(
      `/payroll/timesheet?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`,
      auth,
    );
    assert(ts.ok, 'timesheet');
    const empDays = (ts.data || []).find((r) => r.employee?.id === pending.employeeId);
    const leaveCount = (empDays?.days || []).filter((d) => d.status === 'leave').length;
    assert(leaveCount >= 1, `expected leave days after approve, got ${leaveCount}`);
    pass('absence approve → leave days');
  } catch (e) {
    fail('absence approve → leave days', e.message || e);
  }

  // Name change draft → post
  try {
    const list = await req('/catalog/name-changes', auth);
    assert(list.ok, 'list name-changes');
    const draft = (list.data || []).find((r) => r.status === 'draft');
    assert(draft, 'need draft name-change');
    const before = await req(`/employees/${draft.employeeId}`, auth);
    const post = await req(`/catalog/name-changes/${draft.id}/post`, {
      ...auth,
      method: 'POST',
    });
    assert(post.ok, `post name ${post.status}`);
    assert(post.data.status === 'posted', 'status posted');
    const after = await req(`/employees/${draft.employeeId}`, auth);
    assert(
      after.data.firstName === draft.newFirstName,
      `name not applied: ${after.data.firstName} vs ${draft.newFirstName}`,
    );
    // restore? not needed for smoke
    void before;
    pass('name-change post');
  } catch (e) {
    fail('name-change post', e.message || e);
  }

  // Wage change draft → post
  try {
    const list = await req('/catalog/wage-changes', auth);
    const draft = (list.data || []).find((r) => r.status === 'draft');
    assert(draft, 'need draft wage-change');
    const post = await req(`/catalog/wage-changes/${draft.id}/post`, {
      ...auth,
      method: 'POST',
    });
    assert(post.ok, `post wage ${post.status}`);
    assert(post.data.status === 'posted', 'wage posted');
    pass('wage-change post');
  } catch (e) {
    fail('wage-change post', e.message || e);
  }

  // Clearance complete
  try {
    const list = await req('/catalog/clearance-sheets', auth);
    const ready = (list.data || []).find(
      (s) =>
        s.title?.includes('complete-ready') &&
        s.status !== 'completed' &&
        (s.items || []).every((i) => i.status !== 'pending'),
    );
    assert(ready, 'need complete-ready clearance');
    // items may not be included — refetch or complete by title
    const sheet =
      ready ||
      (list.data || []).find((s) => String(s.title).includes('complete-ready'));
    assert(sheet, 'complete-ready sheet');
    const done = await req(`/catalog/clearance-sheets/${sheet.id}/complete`, {
      ...auth,
      method: 'POST',
    });
    assert(done.ok, `complete ${done.status} ${JSON.stringify(done.data)}`);
    assert(done.data.status === 'completed', 'not completed');
    pass('clearance complete');
  } catch (e) {
    fail('clearance complete', e.message || e);
  }

  // Payroll calculate + FOT + advance lines
  try {
    const periods = await req('/payroll/periods', auth);
    assert(periods.ok && periods.data?.length, 'periods');
    const period = periods.data[0];
    if (period.status === 'closed') {
      const re = await req(`/payroll/periods/${period.id}/reopen`, {
        ...auth,
        method: 'PATCH',
      });
      assert(re.ok, `reopen ${re.status}`);
    }
    const calc = await req(`/payroll/periods/${period.id}/calculate`, {
      ...auth,
      method: 'POST',
      body: {},
    });
    assert(calc.ok, `calculate ${calc.status}`);
    const lines = calc.data.lines || [];
    const advLines = lines.filter((l) => l.type === 'advance');
    assert(advLines.length >= 1, 'expected advance lines from paid advances');
    const fot = await req(`/reports/payroll/fot?periodId=${period.id}`, auth);
    assert(fot.ok, 'fot');
    assert(Array.isArray(fot.data.rows) && fot.data.rows.length > 0, 'fot rows');
    pass('payroll calculate → advance lines + FOT rows');
  } catch (e) {
    fail('payroll calculate → advance lines + FOT rows', e.message || e);
  }

  // Draft advance ignored until pay
  try {
    const advs = await req('/payroll/advances', auth);
    const draft = (advs.data || []).find((a) => a.status === 'draft');
    assert(draft, 'need draft advance');
    const pay = await req(`/payroll/advances/${draft.id}/pay`, {
      ...auth,
      method: 'POST',
    });
    assert(pay.ok && pay.data.status === 'paid', 'pay advance');
    pass('advance draft → pay');
  } catch (e) {
    fail('advance draft → pay', e.message || e);
  }

  // Hr document post (draft transfer)
  try {
    const docs = await req('/hr/documents', auth);
    const draft = (docs.data || []).find((d) => d.status === 'draft');
    assert(draft, 'need draft hr document');
    const post = await req(`/hr/documents/${draft.id}/post`, {
      ...auth,
      method: 'POST',
    });
    assert(post.ok, `post doc ${post.status} ${JSON.stringify(post.data)}`);
    assert(post.data.status === 'posted', 'doc posted');
    pass('hr document post');
  } catch (e) {
    fail('hr document post', e.message || e);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
