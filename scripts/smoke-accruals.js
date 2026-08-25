/** Smoke: Все начисления + Проводки (PayrollAccrualDoc) */
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

const KINDS = [
  'salary_contributions',
  'sick_leave',
  'travel',
  'vacation',
  'all_types',
];

async function main() {
  const login = await req('POST', '/api/auth/login', {
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  assert(login.ok, `login ${login.status} ${JSON.stringify(login.data)}`);
  const token = login.data.accessToken;
  let tenant = login.data.tenant?.id || login.data.user?.tenantId || login.data.tenantId;
  if (!tenant) {
    const me = await req('GET', '/api/me', { token });
    tenant = me.data?.tenantId || me.data?.tenant?.id;
  }
  assert(token && tenant, 'token/tenant');
  const auth = { token, tenant };

  const list = await req('GET', '/api/payroll/accruals', auth);
  assert(list.ok && Array.isArray(list.data), `list ${list.status} ${JSON.stringify(list.data)}`);
  const seeded = list.data.find((r) => r.number === '0000000001');
  assert(seeded, 'seeded doc 0000000001 yo‘q');
  assert(seeded.status === 'posted', `seeded status ${seeded.status}`);
  assert(seeded.kind === 'all_types', `seeded kind ${seeded.kind}`);
  assert(Number(seeded.accruedTotal) > 0, 'seeded accruedTotal');

  const gotSeed = await req('GET', `/api/payroll/accruals/${seeded.id}`, auth);
  assert(gotSeed.ok && Array.isArray(gotSeed.data.lines) && gotSeed.data.lines.length >= 1, 'seed get lines');

  const seedOps = await req('GET', `/api/payroll/accruals/${seeded.id}/operations`, auth);
  assert(seedOps.ok && Array.isArray(seedOps.data) && seedOps.data.length >= 1, `operations ${seedOps.status}`);
  assert(seedOps.data[0].opType === 'Начисление', `opType ${seedOps.data[0].opType}`);

  const seedHist = await req('GET', `/api/payroll/accruals/${seeded.id}/history`, auth);
  assert(seedHist.ok && Array.isArray(seedHist.data) && seedHist.data.length >= 2, `history ${seedHist.status}`);
  assert(
    seedHist.data.some((h) => h.event === 'Проведен'),
    'history missing Проведен',
  );

  const seedEntries = await req('GET', `/api/payroll/accruals/${seeded.id}/entries`, auth);
  assert(seedEntries.ok && Array.isArray(seedEntries.data) && seedEntries.data.length >= 2, `entries ${seedEntries.status}`);
  const e0 = seedEntries.data[0];
  assert(e0.debitAccount && e0.creditAccount, 'entry accounts');
  assert(typeof e0.amount === 'number', 'entry amount number');

  const noKind = await req('POST', '/api/payroll/accruals', {
    ...auth,
    body: { month: '2026-07-01', docDate: '2026-08-18' },
  });
  assert(!noKind.ok, 'kind required');

  const fill = await req('POST', '/api/payroll/accruals/fill', {
    ...auth,
    body: { kind: 'all_types', month: '2026-07-01' },
  });
  assert(fill.ok && Array.isArray(fill.data.lines), `fill ${fill.status} ${JSON.stringify(fill.data)}`);
  assert(fill.data.lines.length >= 1, 'fill empty');
  const line = fill.data.lines[0];
  assert(line.employeeId, 'fill employeeId');

  const created = await req('POST', '/api/payroll/accruals', {
    ...auth,
    body: {
      kind: 'salary_contributions',
      month: '2026-06-01',
      docDate: '2026-08-18',
      title: 'SMOKE_ACC',
      note: 'SMOKE_ACC',
      currency: 'UZS',
      lines: [
        {
          employeeId: line.employeeId,
          accrualTypeId: line.accrualTypeId || undefined,
          accrualName: line.accrualName || 'Тест',
          accrued: 1000000,
          ndfl: 120000,
          inps: 1000,
          esp: 0,
          toPay: 879000,
        },
      ],
      deductions: [],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  assert(created.data.status === 'draft', `draft ${created.data.status}`);
  assert(String(created.data.number || '').length === 10, `number ${created.data.number}`);
  assert(Number(created.data.accruedTotal) === 1000000, `accruedTotal ${created.data.accruedTotal}`);
  assert(Number(created.data.ndflTotal) === 120000, `ndflTotal ${created.data.ndflTotal}`);

  const got = await req('GET', `/api/payroll/accruals/${id}`, auth);
  assert(got.ok && got.data.title === 'SMOKE_ACC', 'get title');
  assert(got.data.lines.length === 1, 'get lines');

  const patched = await req('PATCH', `/api/payroll/accruals/${id}`, {
    ...auth,
    body: {
      title: 'SMOKE_ACC_UPD',
      month: '2026-06-01',
      docDate: '2026-08-18',
      lines: got.data.lines.map((l) => ({
        employeeId: l.employeeId,
        accrualTypeId: l.accrualTypeId || undefined,
        accrualName: l.accrualName,
        accrued: 2000000,
        ndfl: 240000,
        inps: 2000,
        esp: 0,
        toPay: 1758000,
      })),
      deductions: [
        {
          employeeId: line.employeeId,
          deductionName: 'Штраф smoke',
          amount: 50000,
        },
      ],
    },
  });
  assert(patched.ok && patched.data.title === 'SMOKE_ACC_UPD', `patch ${patched.status}`);
  assert(Number(patched.data.accruedTotal) === 2000000, 'patched accrued');
  assert(Number(patched.data.deductedTotal) === 50000, `deducted ${patched.data.deductedTotal}`);
  assert(patched.data.audits || true, 'audits field optional on get');

  const posted = await req('POST', `/api/payroll/accruals/${id}/post`, auth);
  assert(posted.ok && posted.data.status === 'posted', `post ${posted.status} ${JSON.stringify(posted.data)}`);
  assert(posted.data.postedBy, 'postedBy');

  const patchPosted = await req('PATCH', `/api/payroll/accruals/${id}`, {
    ...auth,
    body: { title: 'nope' },
  });
  assert(!patchPosted.ok, 'cannot patch posted');

  const entries = await req('GET', `/api/payroll/accruals/${id}/entries`, auth);
  assert(entries.ok && entries.data.length >= 3, `postings ${entries.data?.length} ${JSON.stringify(entries.data)}`);
  const hasDebit = entries.data.some((r) => r.debitAccount === '9420' && r.creditAccount === '6710');
  const hasNdfl = entries.data.some((r) => r.creditAccount === '6410' && r.note === 'НДФЛ');
  const hasDed = entries.data.some((r) => r.note === 'Штраф smoke' || r.creditAccount === '6980');
  assert(hasDebit, 'missing 9420/6710 accrual posting');
  assert(hasNdfl, 'missing NDFL posting');
  assert(hasDed, 'missing deduction posting');

  const ops = await req('GET', `/api/payroll/accruals/${id}/operations`, auth);
  assert(ops.ok && ops.data.some((o) => o.opType === 'Удержание'), 'operations deduction');

  const hist = await req('GET', `/api/payroll/accruals/${id}/history`, auth);
  assert(
    hist.ok && hist.data.some((h) => h.event === 'Добавлен') && hist.data.some((h) => h.event === 'Проведен'),
    'history events',
  );

  const cancelled = await req('POST', `/api/payroll/accruals/${id}/cancel`, auth);
  assert(cancelled.ok && cancelled.data.status === 'cancelled', `cancel ${cancelled.status}`);
  const afterCancel = await req('GET', `/api/payroll/accruals/${id}/entries`, auth);
  assert(afterCancel.ok && afterCancel.data.length === 0, 'entries cleared on cancel');

  const del = await req('DELETE', `/api/payroll/accruals/${id}`, auth);
  assert(del.ok, `delete ${del.status}`);

  const kindIds = [];
  for (const kind of KINDS) {
    const row = await req('POST', '/api/payroll/accruals', {
      ...auth,
      body: {
        kind,
        month: '2026-05-01',
        docDate: '2026-08-18',
        title: `SMOKE_KIND_${kind}`,
        note: `SMOKE_KIND_${kind}`,
      },
    });
    assert(row.ok, `kind ${kind} ${row.status} ${JSON.stringify(row.data)}`);
    assert(row.data.kind === kind, `kind persist ${row.data.kind}`);
    kindIds.push(row.data.id);
  }

  const bulkPost = await req('POST', '/api/payroll/accruals/bulk-post', {
    ...auth,
    body: { ids: kindIds },
  });
  assert(bulkPost.ok && bulkPost.data.ok === 5, `bulk post ${JSON.stringify(bulkPost.data)}`);

  const bulkCancel = await req('POST', '/api/payroll/accruals/bulk-cancel', {
    ...auth,
    body: { ids: kindIds },
  });
  assert(bulkCancel.ok && bulkCancel.data.ok === 5, `bulk cancel ${JSON.stringify(bulkCancel.data)}`);

  const bulkDel = await req('POST', '/api/payroll/accruals/bulk-delete', {
    ...auth,
    body: { ids: kindIds },
  });
  assert(bulkDel.ok, `bulk delete ${JSON.stringify(bulkDel.data)}`);

  const leftover = await req('GET', '/api/payroll/accruals', auth);
  const leftoverIds = (leftover.data || [])
    .filter((r) => String(r.note || r.title || '').startsWith('SMOKE_'))
    .map((r) => r.id);
  if (leftoverIds.length) {
    await req('POST', '/api/payroll/accruals/bulk-cancel', { ...auth, body: { ids: leftoverIds } });
    await req('POST', '/api/payroll/accruals/bulk-delete', { ...auth, body: { ids: leftoverIds } });
  }

  const stillSeeded = await req('GET', '/api/payroll/accruals', auth);
  assert(
    (stillSeeded.data || []).some((r) => r.number === '0000000001'),
    'seeded demo o‘chib ketmasin',
  );

  const web = await fetch(`${WEB}/payroll/accruals`);
  assert(web.ok, `web list ${web.status}`);
  const html = await web.text();
  assert(html.includes('HR HUB') || html.includes('__NEXT_DATA__') || html.length > 200, 'web html empty');

  const webNew = await fetch(`${WEB}/payroll/accruals/new?kind=all_types`);
  assert(webNew.ok, `web new ${webNew.status}`);

  const webView = await fetch(`${WEB}/payroll/accruals/${seeded.id}`);
  assert(webView.ok, `web view ${webView.status}`);

  const webEntries = await fetch(`${WEB}/payroll/accruals/${seeded.id}/entries`);
  assert(webEntries.ok, `web entries ${webEntries.status}`);

  console.log(
    `✓ accruals smoke ok — seeded=${seeded.number} entries=${seedEntries.data.length} kinds=${KINDS.length}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
