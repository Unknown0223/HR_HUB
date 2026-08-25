/** Cross-module payroll links: catalogs + post → payroll lines. */
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
  const failed = [];
  const passed = [];
  const check = async (name, fn) => {
    try {
      await fn();
      passed.push(name);
      console.log(`✓ ${name}`);
    } catch (e) {
      failed.push(`${name}: ${e.message}`);
      console.error(`✗ ${name}: ${e.message}`);
    }
  };

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

  const lists = [
    ['fine-policies', '/api/payroll/fine-policies'],
    ['allowance-policies', '/api/payroll/allowance-policies'],
    ['timesheets', '/api/payroll/timesheets'],
    ['accruals', '/api/payroll/accruals'],
    ['settlements', '/api/payroll/settlements'],
    ['account-pairs', '/api/payroll/account-pairs'],
    ['vedomost/sheets', '/api/payroll/sheets'],
    ['manual-ops', '/api/payroll/manual-ops'],
    ['gph-services', '/api/catalog/gph-services'],
    ['gph-contracts', '/api/catalog/gph-contracts'],
    ['sales-accruals', '/api/payroll/sales-accruals'],
    ['sales-rates', '/api/payroll/sales-accruals/rates'],
    ['one-time-accruals', '/api/payroll/one-time-accruals'],
    ['loans', '/api/payroll/loans'],
    ['payment-orders', '/api/payroll/payment-orders'],
    ['travel-expenses', '/api/payroll/travel-expenses'],
    ['bonus-accruals', '/api/payroll/bonus-accruals'],
    ['accrual-types', '/api/catalog/accrual-types'],
    ['deduction-types', '/api/catalog/deduction-types'],
    ['fact-types', '/api/catalog/fact-types'],
    ['internal-trips', '/api/catalog/internal-trips'],
    ['policies', '/api/payroll/policies'],
    ['periods', '/api/payroll/periods'],
    ['advances', '/api/payroll/advances'],
  ];

  for (const [name, path] of lists) {
    await check(`GET ${name}`, async () => {
      const r = await req('GET', path, auth);
      assert(r.ok, `${path} ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`);
    });
  }

  await check('periods → payroll lines', async () => {
    const periods = await req('GET', '/api/payroll/periods', auth);
    assert(periods.ok && Array.isArray(periods.data) && periods.data.length, 'no periods');
    const lines = await req('GET', `/api/payroll/lines?periodId=${periods.data[0].id}`, auth);
    assert(lines.ok && Array.isArray(lines.data), `lines ${lines.status}`);
  });

  await check('employees + trips + fill bonus', async () => {
    const emps = await req('GET', '/api/employees?status=active&limit=5', auth);
    const items = Array.isArray(emps.data) ? emps.data : emps.data.items || [];
    assert(items.length, 'employees');
    const emp = items[0];
    const trips = await req('GET', `/api/payroll/travel-expenses/trips?employeeId=${emp.id}`, auth);
    assert(trips.ok && Array.isArray(trips.data), `trips ${trips.status}`);
    const fill = await req('POST', '/api/payroll/bonus-accruals/fill', {
      ...auth,
      body: { kind: 'fact', employeeIds: [emp.id] },
    });
    assert(fill.ok && fill.data.lines?.length >= 1, `fill ${fill.status}`);
    const otFill = await req('POST', '/api/payroll/one-time-accruals/fill', {
      ...auth,
      body: { kind: 'accrual', employeeIds: [emp.id], lineDate: '2026-08-19' },
    });
    assert(otFill.ok && otFill.data.lines?.length >= 1, `ot fill ${otFill.status}`);
  });

  await check('bonus post → payroll line', async () => {
    const emps = await req('GET', '/api/employees?status=active&limit=5', auth);
    const emp = (Array.isArray(emps.data) ? emps.data : emps.data.items)[0];
    const created = await req('POST', '/api/payroll/bonus-accruals', {
      ...auth,
      body: {
        kind: 'fact',
        docDate: '2026-08-19',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        note: 'SMOKE_PAYROLL_LINK_BONUS',
        lines: [{ employeeId: emp.id, accrualName: 'Бонус', amount: 7777 }],
      },
    });
    assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
    const posted = await req('POST', `/api/payroll/bonus-accruals/${created.data.id}/post`, auth);
    assert(posted.ok && posted.data.status === 'posted', `post ${posted.status}`);
    const periods = await req('GET', '/api/payroll/periods', auth);
    const aug = (periods.data || []).find((p) => p.year === 2026 && p.month === 8) || periods.data[0];
    assert(aug, 'period');
    const lines = await req('GET', `/api/payroll/lines?periodId=${aug.id}`, auth);
    assert(lines.ok, `lines ${lines.status}`);
    const hit = (lines.data || []).find(
      (l) => l.type === 'bonus' && String(l.description || '').includes(created.data.number),
    );
    assert(hit, `bonus line missing in period ${aug.year}-${aug.month}`);
    await req('POST', `/api/payroll/bonus-accruals/${created.data.id}/unpost`, auth);
    await req('DELETE', `/api/payroll/bonus-accruals/${created.data.id}`, auth);
  });

  await check('one-time post → payroll line', async () => {
    const emps = await req('GET', '/api/employees?status=active&limit=5', auth);
    const emp = (Array.isArray(emps.data) ? emps.data : emps.data.items)[0];
    const created = await req('POST', '/api/payroll/one-time-accruals', {
      ...auth,
      body: {
        kind: 'accrual',
        docDate: '2026-08-19',
        month: '2026-08-01',
        note: 'SMOKE_PAYROLL_LINK_OT',
        lines: [{ employeeId: emp.id, amount: 8888, lineDate: '2026-08-19' }],
      },
    });
    assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
    const posted = await req('POST', `/api/payroll/one-time-accruals/${created.data.id}/post`, auth);
    assert(posted.ok && posted.data.status === 'posted', `post ${posted.status}`);
    const periods = await req('GET', '/api/payroll/periods', auth);
    const aug = (periods.data || []).find((p) => p.year === 2026 && p.month === 8);
    assert(aug, 'period 2026-08');
    const lines = await req('GET', `/api/payroll/lines?periodId=${aug.id}`, auth);
    const hit = (lines.data || []).find(
      (l) => String(l.description || '').includes(created.data.number),
    );
    assert(hit, 'one-time line missing');
    await req('POST', `/api/payroll/one-time-accruals/${created.data.id}/unpost`, auth);
    await req('DELETE', `/api/payroll/one-time-accruals/${created.data.id}`, auth);
  });

  await check('travel complete with salary calc → payroll line', async () => {
    const emps = await req('GET', '/api/employees?status=active&limit=5', auth);
    const emp = (Array.isArray(emps.data) ? emps.data : emps.data.items)[0];
    const trips = await req('GET', `/api/payroll/travel-expenses/trips?employeeId=${emp.id}`, auth);
    const trip = (trips.data || [])[0];
    assert(trip, 'need a trip');
    const created = await req('POST', '/api/payroll/travel-expenses', {
      ...auth,
      body: {
        docDate: '2026-08-19',
        employeeId: emp.id,
        tripId: trip.id,
        calcForSalary: true,
        note: 'SMOKE_PAYROLL_LINK_TRAVEL',
        lines: [{ accrualName: 'Командировочные', amount: 9999, startDate: '2026-08-17', endDate: '2026-08-19' }],
      },
    });
    assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
    const done = await req('POST', `/api/payroll/travel-expenses/${created.data.id}/complete`, auth);
    assert(done.ok && done.data.status === 'approved', `complete ${done.status}`);
    const periods = await req('GET', '/api/payroll/periods', auth);
    const aug = (periods.data || []).find((p) => p.year === 2026 && p.month === 8);
    const lines = await req('GET', `/api/payroll/lines?periodId=${aug.id}`, auth);
    const hit = (lines.data || []).find((l) => String(l.description || '').includes(created.data.number));
    assert(hit, 'travel payroll line missing');
  });

  await check('bonus bulk-post / bulk-unpost / bulk-delete', async () => {
    const emps = await req('GET', '/api/employees?status=active&limit=5', auth);
    const emp = (Array.isArray(emps.data) ? emps.data : emps.data.items)[0];
    const a = await req('POST', '/api/payroll/bonus-accruals', {
      ...auth,
      body: {
        kind: 'fact',
        docDate: '2026-08-19',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        note: 'SMOKE_BULK_A',
        lines: [{ employeeId: emp.id, accrualName: 'Бонус', amount: 11 }],
      },
    });
    const b = await req('POST', '/api/payroll/bonus-accruals', {
      ...auth,
      body: {
        kind: 'fact',
        docDate: '2026-08-19',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        note: 'SMOKE_BULK_B',
        lines: [{ employeeId: emp.id, accrualName: 'Бонус', amount: 22 }],
      },
    });
    assert(a.ok && b.ok, `create ${a.status} ${b.status}`);
    const ids = [a.data.id, b.data.id];
    const posted = await req('POST', '/api/payroll/bonus-accruals/bulk-post', { ...auth, body: { ids } });
    assert(posted.ok && posted.data.done === 2, `bulk-post ${posted.status} ${JSON.stringify(posted.data)}`);
    const unposted = await req('POST', '/api/payroll/bonus-accruals/bulk-unpost', { ...auth, body: { ids } });
    assert(unposted.ok && unposted.data.done === 2, `bulk-unpost ${unposted.status}`);
    const deleted = await req('POST', '/api/payroll/bonus-accruals/bulk-delete', { ...auth, body: { ids } });
    assert(deleted.ok && deleted.data.done === 2, `bulk-delete ${deleted.status}`);
  });

  await check('one-time bulk-post / bulk-unpost / bulk-delete', async () => {
    const emps = await req('GET', '/api/employees?status=active&limit=5', auth);
    const emp = (Array.isArray(emps.data) ? emps.data : emps.data.items)[0];
    const a = await req('POST', '/api/payroll/one-time-accruals', {
      ...auth,
      body: {
        kind: 'accrual',
        docDate: '2026-08-19',
        month: '2026-08-01',
        note: 'SMOKE_OT_BULK_A',
        lines: [{ employeeId: emp.id, amount: 31, lineDate: '2026-08-19' }],
      },
    });
    const b = await req('POST', '/api/payroll/one-time-accruals', {
      ...auth,
      body: {
        kind: 'accrual',
        docDate: '2026-08-19',
        month: '2026-08-01',
        note: 'SMOKE_OT_BULK_B',
        lines: [{ employeeId: emp.id, amount: 32, lineDate: '2026-08-19' }],
      },
    });
    assert(a.ok && b.ok, `create ${a.status} ${b.status}`);
    const ids = [a.data.id, b.data.id];
    const posted = await req('POST', '/api/payroll/one-time-accruals/bulk-post', { ...auth, body: { ids } });
    assert(posted.ok && posted.data.done === 2, `bulk-post ${JSON.stringify(posted.data)}`);
    const unposted = await req('POST', '/api/payroll/one-time-accruals/bulk-unpost', { ...auth, body: { ids } });
    assert(unposted.ok && unposted.data.done === 2, `bulk-unpost ${unposted.status}`);
    const deleted = await req('POST', '/api/payroll/one-time-accruals/bulk-delete', { ...auth, body: { ids } });
    assert(deleted.ok && deleted.data.done === 2, `bulk-delete ${deleted.status}`);
  });

  await check('loan + payment-order lists after writes', async () => {
    const loans = await req('GET', '/api/payroll/loans', auth);
    assert(loans.ok && Array.isArray(loans.data), 'loans');
    const po = await req('GET', '/api/payroll/payment-orders', auth);
    assert(po.ok && Array.isArray(po.data), 'payment-orders');
    const sales = await req('GET', '/api/payroll/sales-accruals', auth);
    assert(sales.ok, 'sales');
    const gph = await req('GET', '/api/catalog/gph-services', auth);
    assert(gph.ok, 'gph');
  });

  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.error(' -', f);
    process.exit(1);
  }
  console.log('✓ payroll links ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
