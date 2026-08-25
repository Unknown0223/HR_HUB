/** Smoke: Ручные операции — CRUD, post/unpost, COA, history */
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
  const leftover = await req('GET', '/api/payroll/manual-ops', auth);
  for (const r of leftover.data || []) {
    if (!String(r.note || '').startsWith('SMOKE_')) continue;
    await req('POST', `/api/payroll/manual-ops/${r.id}/unpost`, auth);
    await req('DELETE', `/api/payroll/manual-ops/${r.id}`, auth);
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

  const dicts = await req('GET', '/api/settings/dictionaries?kind=extra', auth);
  assert(dicts.ok, `dicts ${dicts.status}`);
  const coa = (dicts.data || []).find((d) => d.code === 'coa');
  assert(coa && (coa.items || []).length >= 2, 'COA справочник kerak');
  const dt = coa.items.find((i) => i.code === '6710') || coa.items[0];
  const ct = coa.items.find((i) => i.code === '5110') || coa.items[1] || coa.items[0];

  const created = await req('POST', '/api/payroll/manual-ops', {
    ...auth,
    body: {
      docDate: '2026-08-18T15:39:01.000Z',
      note: 'SMOKE_MAN',
      lines: [
        {
          debitAccount: dt.code,
          debitName: dt.name,
          creditAccount: ct.code,
          creditName: ct.name,
          quantity: 1,
          amount: 150000,
          amountBase: 150000,
        },
      ],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  assert(created.data.status === 'draft', 'draft');
  assert(String(created.data.number).length === 10, `number ${created.data.number}`);
  assert(Number(created.data.totalAmount) === 150000, `total ${created.data.totalAmount}`);
  assert(String(created.data.debitAccounts).includes(dt.code), 'debit code');
  assert(String(created.data.creditAccounts).includes(ct.code), 'credit code');
  assert(created.data.posted === false, 'not posted');

  const patched = await req('PATCH', `/api/payroll/manual-ops/${id}`, {
    ...auth,
    body: {
      note: 'SMOKE_MAN_UPD',
      lines: [
        {
          debitAccount: dt.code,
          debitName: dt.name,
          creditAccount: ct.code,
          creditName: ct.name,
          amount: 180000,
          amountBase: 180000,
        },
      ],
    },
  });
  assert(patched.ok && patched.data.note === 'SMOKE_MAN_UPD', 'patch');
  assert(Number(patched.data.totalAmount) === 180000, 'patched total');

  const posted = await req('POST', `/api/payroll/manual-ops/${id}/post`, auth);
  assert(posted.ok && posted.data.status === 'posted' && posted.data.posted === true, `post ${posted.status}`);
  const noPatch = await req('PATCH', `/api/payroll/manual-ops/${id}`, { ...auth, body: { note: 'x' } });
  assert(!noPatch.ok, 'cannot patch posted');

  const hist = await req('GET', `/api/payroll/manual-ops/history?opId=${id}`, auth);
  assert(hist.ok && hist.data.some((h) => h.eventType === 'Проведен'), 'history posted');

  const unposted = await req('POST', `/api/payroll/manual-ops/${id}/unpost`, auth);
  assert(unposted.ok && unposted.data.status === 'draft', 'unpost');
  const del = await req('DELETE', `/api/payroll/manual-ops/${id}`, auth);
  assert(del.ok, 'delete');

  const noDebit = await req('POST', '/api/payroll/manual-ops', {
    ...auth,
    body: {
      docDate: '2026-08-18T15:39:01.000Z',
      note: 'SMOKE_BAD',
      lines: [{ debitAccount: '', creditAccount: ct.code, amount: 1 }],
    },
  });
  assert(!noDebit.ok, 'debit required');

  const sheets = await req('GET', '/api/payroll/sheets', auth);
  assert(sheets.ok, 'vedomost still ok');
  const accruals = await req('GET', '/api/payroll/accruals', auth);
  assert(accruals.ok, 'accruals still ok');
  const pairs = await req('GET', '/api/payroll/account-pairs', auth);
  assert(pairs.ok, 'pairs still ok');

  await cleanup(auth);

  for (const href of ['/payroll/manual', '/payroll/manual/new', '/payroll/manual/history', '/payroll?tab=manual']) {
    const web = await fetch(`${WEB}${href}`);
    assert(web.ok, `web ${href} ${web.status}`);
  }

  console.log(`✓ manual-ops smoke ok — dt=${dt.code} ct=${ct.code}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  if (e.cause) console.error(e.cause);
  console.error(e.stack);
  process.exit(1);
});
