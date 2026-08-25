/** Smoke: Ведомость + Аванс — CRUD, fill, settings, payroll/employee/accrual connections */
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

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

async function cleanup(auth) {
  const leftover = await req('GET', '/api/payroll/sheets', auth);
  const ids = (leftover.data || [])
    .filter((r) => String(r.note || '').startsWith('SMOKE_'))
    .map((r) => r.id);
  for (const lid of ids) {
    await req('POST', `/api/payroll/sheets/${lid}/reopen`, auth);
    await req('DELETE', `/api/payroll/sheets/${lid}`, auth);
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
  assert(token && tenant, 'token/tenant');
  const auth = { token, tenant };

  await cleanup(auth);

  const emps = await req('GET', '/api/employees?status=active&limit=200', auth);
  assert(emps.ok, `employees ${emps.status}`);
  const empItems = Array.isArray(emps.data) ? emps.data : emps.data.items || [];
  assert(empItems.length >= 1, 'active employees yo‘q');

  const divs = await req('GET', '/api/organization/divisions', auth);
  assert(divs.ok && Array.isArray(divs.data), `divisions ${divs.status}`);

  const dicts = await req('GET', '/api/settings/dictionaries?kind=extra', auth);
  assert(dicts.ok && Array.isArray(dicts.data), `dictionaries ${dicts.status}`);
  const cashDict = dicts.data.find((d) => d.code === 'cashboxes');
  assert(cashDict && (cashDict.items || []).length >= 1, 'cashboxes dictionary yo‘q');
  const cashboxName = cashDict.items[0].name || cashDict.items[0].code;

  const settings = await req('GET', '/api/payroll/sheets/settings', auth);
  assert(settings.ok && Number(settings.data.percent) === 40, `settings ${JSON.stringify(settings.data)}`);
  const patchedSet = await req('PATCH', '/api/payroll/sheets/settings', {
    ...auth,
    body: { percent: 40, countPaidAdvances: true, generateNote: true, postedAccrualsOnly: true },
  });
  assert(patchedSet.ok, 'patch settings');

  const noCash = await req('POST', '/api/payroll/sheets', {
    ...auth,
    body: {
      kind: 'vedomost',
      month: '2026-08-01',
      issueDate: '2026-08-18',
      payType: 'cash',
      note: 'SMOKE_NOCASH',
      lines: [{ employeeId: empItems[0].id, amount: 1 }],
    },
  });
  assert(!noCash.ok, 'cash without касса should fail');

  const fill = await req('POST', '/api/payroll/sheets/fill', {
    ...auth,
    body: { kind: 'vedomost', month: '2026-08-01' },
  });
  assert(fill.ok && Array.isArray(fill.data.lines) && fill.data.lines.length >= 1, `fill ${fill.status}`);
  assert(fill.data.lines.length === empItems.length || fill.data.lines.length >= 1, 'fill employees');
  const empId = fill.data.lines[0].employeeId;
  assert(fill.data.lines[0].employee?.label, 'fill employee label');

  if (divs.data.length) {
    const divId = empItems.find((e) => e.divisionId)?.divisionId || divs.data[0].id;
    const fillDiv = await req('POST', '/api/payroll/sheets/fill', {
      ...auth,
      body: { kind: 'vedomost', month: '2026-08-01', divisionId: divId },
    });
    assert(fillDiv.ok && Array.isArray(fillDiv.data.lines), `fill division ${fillDiv.status}`);
  }

  const created = await req('POST', '/api/payroll/sheets', {
    ...auth,
    body: {
      kind: 'vedomost',
      month: '2026-08-01',
      issueDate: '2026-08-18',
      payType: 'cash',
      note: 'SMOKE_VED',
      cashbox: cashboxName,
      enableLimit: true,
      lines: [{ employeeId: empId, amount: 250000, debt: 250000, limitAmount: 100000 }],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  assert(created.data.status === 'draft', 'draft');
  assert(String(created.data.number).length === 10, `number ${created.data.number}`);
  assert(n(created.data.totalAmount) === 100000, `limit total ${created.data.totalAmount}`);
  assert(created.data.cashbox === cashboxName, 'cashbox saved');
  assert(created.data.lines?.[0]?.employee?.label, 'create line employee');

  const patched = await req('PATCH', `/api/payroll/sheets/${id}`, {
    ...auth,
    body: { note: 'SMOKE_VED_UPD', lines: [{ employeeId: empId, amount: 180000, debt: 180000, limitAmount: 200000 }] },
  });
  assert(patched.ok && patched.data.note === 'SMOKE_VED_UPD', 'patch');
  assert(n(patched.data.totalAmount) === 180000, 'patched total');

  const kindLeak = await req('PATCH', `/api/payroll/sheets/${id}`, {
    ...auth,
    body: { kind: 'advance_salary', note: 'SMOKE_VED_UPD' },
  });
  if (kindLeak.ok) {
    assert(kindLeak.data.kind === 'vedomost', 'kind must not change on PATCH');
  }

  const completed = await req('POST', `/api/payroll/sheets/${id}/complete`, auth);
  assert(completed.ok && completed.data.status === 'completed', `complete ${completed.status}`);
  const noPatch = await req('PATCH', `/api/payroll/sheets/${id}`, { ...auth, body: { note: 'x' } });
  assert(!noPatch.ok, 'cannot patch completed');
  const noDel = await req('DELETE', `/api/payroll/sheets/${id}`, auth);
  assert(!noDel.ok, 'cannot delete completed');

  const hist = await req('GET', `/api/payroll/sheets/history?sheetId=${id}`, auth);
  assert(hist.ok && hist.data.some((h) => h.eventType === 'Завершен'), 'history');
  assert(hist.data.some((h) => h.eventType === 'Добавлен'), 'history added');

  const list = await req('GET', '/api/payroll/sheets', auth);
  assert(list.ok && list.data.some((r) => r.id === id), 'list contains doc');

  const reopened = await req('POST', `/api/payroll/sheets/${id}/reopen`, auth);
  assert(reopened.ok && reopened.data.status === 'draft', 'reopen');
  const del = await req('DELETE', `/api/payroll/sheets/${id}`, auth);
  assert(del.ok, 'delete');

  const fillAdv = await req('POST', '/api/payroll/sheets/fill', {
    ...auth,
    body: { kind: 'advance_salary', month: '2026-08-01' },
  });
  assert(fillAdv.ok && fillAdv.data.lines.length >= 1, 'fill advance');
  const advLine = fillAdv.data.lines.find((l) => l.employeeId === empId) || fillAdv.data.lines[0];
  const salary = n(advLine.employee?.baseSalary);
  if (salary > 0) {
    const expected = Math.round(salary * 0.4 * 100) / 100;
    assert(n(advLine.accruedAdvance) === expected, `advance 40% ${advLine.accruedAdvance} != ${expected}`);
  }

  const advAmt = Math.max(10000, n(advLine.amount) || 10000);
  const adv = await req('POST', '/api/payroll/sheets', {
    ...auth,
    body: {
      kind: 'advance_salary',
      month: '2026-08-01',
      issueDate: '2026-08-18',
      payType: 'bank',
      note: 'SMOKE_ADV',
      bankAccount: '20208',
      lines: [{ employeeId: empId, amount: advAmt, accruedAdvance: advAmt, note: 'Аванс' }],
    },
  });
  assert(adv.ok && adv.data.kind === 'advance_salary', `adv ${JSON.stringify(adv.data)}`);
  const advId = adv.data.id;
  const beforeAdv = await req('GET', '/api/payroll/advances', auth);
  assert(beforeAdv.ok, `payroll advances ${beforeAdv.status}`);
  const beforeCount = (beforeAdv.data || []).filter(
    (a) => a.employeeId === empId && String(a.note || '').includes('SMOKE_ADV'),
  ).length;

  const advDone = await req('POST', `/api/payroll/sheets/${advId}/complete`, auth);
  assert(advDone.ok && advDone.data.status === 'completed', 'adv complete');

  const afterAdv = await req('GET', '/api/payroll/advances', auth);
  const linked = (afterAdv.data || []).filter(
    (a) => a.sourceSheetId === advId || (a.employeeId === empId && String(a.note || '').includes('SMOKE_ADV')),
  );
  assert(linked.length >= beforeCount + 1, `complete must create PayrollAdvance (got ${linked.length})`);
  const paid = linked.find((a) => a.sourceSheetId === advId) || linked[0];
  assert(String(paid.status).toLowerCase() === 'paid', `advance status ${paid.status}`);
  assert(n(paid.amount) === advAmt, `advance amount ${paid.amount}`);

  const periods = await req('GET', '/api/payroll/periods', auth);
  assert(periods.ok, `periods ${periods.status}`);
  const periodList = Array.isArray(periods.data) ? periods.data : periods.data?.items || periods.data || [];
  const aug = (periodList || []).find((p) => Number(p.year) === 2026 && Number(p.month) === 8);
  assert(aug, 'complete advance must create/find payroll period 2026-08');
  const oldVed = await req('GET', `/api/payroll/periods/${aug.id}/vedomost`, auth);
  assert(oldVed.ok, `old period vedomost ${oldVed.status} ${JSON.stringify(oldVed.data?.message || oldVed.data)}`);

  const fillAfterPaid = await req('POST', '/api/payroll/sheets/fill', {
    ...auth,
    body: { kind: 'advance_salary', month: '2026-08-01' },
  });
  const afterLine = (fillAfterPaid.data.lines || []).find((l) => l.employeeId === empId);
  if (salary > 0 && afterLine) {
    const expectedNet = Math.max(0, Math.round(salary * 0.4 * 100) / 100 - advAmt);
    assert(n(afterLine.amount) === expectedNet, `countPaidAdvances ${afterLine.amount} != ${expectedNet}`);
  }

  await req('POST', `/api/payroll/sheets/${advId}/reopen`, auth);
  const afterReopen = await req('GET', '/api/payroll/advances', auth);
  const leftoverAdv = (afterReopen.data || []).filter((a) => a.sourceSheetId === advId);
  assert(leftoverAdv.length === 0, 'reopen must remove generated PayrollAdvance');
  await req('DELETE', `/api/payroll/sheets/${advId}`, auth);

  const accruals = await req('GET', '/api/payroll/accruals', auth);
  assert(accruals.ok, `accruals ${accruals.status}`);
  const posted = (accruals.data || []).find((d) => d.status === 'posted' && d.month);
  if (posted) {
    const m = String(posted.month).slice(0, 10);
    const fillMonth = await req('POST', '/api/payroll/sheets/fill', {
      ...auth,
      body: { kind: 'vedomost', month: m, forMonth: true },
    });
    assert(fillMonth.ok, `fill forMonth ${fillMonth.status}`);
    const withPay = (fillMonth.data.lines || []).filter((l) => n(l.amount) > 0);
    assert(withPay.length >= 1, 'fill за месяц posted accrual toPay bilan bog‘lanishi kerak');
  }

  const policies = await req('GET', '/api/payroll/policies', auth);
  assert(policies.ok, 'payroll policies still ok');
  const pairs = await req('GET', '/api/payroll/account-pairs', auth);
  assert(pairs.ok, 'account-pairs still ok');
  const timesheets = await req('GET', '/api/payroll/timesheets', auth);
  assert(timesheets.ok || timesheets.status === 404, `timesheets ${timesheets.status}`);

  await cleanup(auth);

  for (const href of [
    '/payroll/vedomost',
    '/payroll/vedomost/new?kind=vedomost',
    '/payroll/vedomost/new?kind=advance_salary',
    '/payroll/vedomost/history',
    '/payroll?tab=vedomost',
  ]) {
    const web = await fetch(`${WEB}${href}`);
    assert(web.ok, `web ${href} ${web.status}`);
  }

  console.log(`✓ vedomost smoke ok — fill=${fill.data.lines.length} emps=${empItems.length} cashbox=${cashboxName}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
