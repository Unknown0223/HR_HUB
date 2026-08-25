/** Smoke: Взаиморасчеты + Парные счета */
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

  const pairs = await req('GET', '/api/payroll/account-pairs', auth);
  assert(pairs.ok && Array.isArray(pairs.data), `pairs ${pairs.status}`);
  const names = pairs.data.map((p) => p.name);
  assert(names.some((n) => String(n).includes('клиент')), 'pair клиенты yo‘q — seed ishga tushiring');
  assert(names.some((n) => String(n).includes('поставщик')), 'pair поставщики yo‘q');
  assert(names.some((n) => String(n).includes('НДС')), 'pair НДС yo‘q');
  const client = pairs.data.find((p) => String(p.name).includes('клиент'));
  assert(client.firstAccount && client.secondAccount, 'pair accounts');
  assert(client.isActive === true, 'client pair active');

  const createdPair = await req('POST', '/api/payroll/account-pairs', {
    ...auth,
    body: {
      name: 'SMOKE_PAIR',
      firstAccount: '9991. Smoke dt',
      secondAccount: '9992. Smoke kt',
      sortOrder: 99,
      isActive: true,
      subcontos: ['Субконто A'],
    },
  });
  assert(createdPair.ok, `create pair ${createdPair.status} ${JSON.stringify(createdPair.data)}`);
  const pairId = createdPair.data.id;
  assert(createdPair.data.firstAccount.includes('9991'), 'firstAccount map');
  assert(Array.isArray(createdPair.data.subcontos) && createdPair.data.subcontos[0] === 'Субконто A', 'subcontos');

  const patchedPair = await req('PATCH', `/api/payroll/account-pairs/${pairId}`, {
    ...auth,
    body: { name: 'SMOKE_PAIR_UPD', isActive: false, subcontos: ['B'] },
  });
  assert(patchedPair.ok && patchedPair.data.name === 'SMOKE_PAIR_UPD', 'patch pair');
  assert(patchedPair.data.isActive === false, 'pair inactive');

  const bulkOn = await req('POST', '/api/payroll/account-pairs/bulk-status', {
    ...auth,
    body: { ids: [pairId], isActive: true },
  });
  assert(bulkOn.ok && bulkOn.data.ok >= 1, 'bulk status');

  const refresh = await req('POST', '/api/payroll/settlements/refresh', {
    ...auth,
    body: { pairIds: [client.id] },
  });
  assert(refresh.ok && Array.isArray(refresh.data.lines), `refresh ${refresh.status}`);
  assert(refresh.data.lines.length >= 1, 'refresh empty');
  assert(refresh.data.lines[0].pairName, 'refresh pairName');

  const created = await req('POST', '/api/payroll/settlements', {
    ...auth,
    body: {
      note: 'SMOKE_SET',
      pairIds: [client.id],
      lines: [
        {
          accountPairId: client.id,
          pairName: client.name,
          currency: 'UZS',
          subconto: '',
          firstAmount: 100000,
          secondAmount: 40000,
          amount: 40000,
        },
      ],
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;
  assert(created.data.status === 'open', `status ${created.data.status}`);
  assert(String(created.data.number || '').length === 10, `number ${created.data.number}`);
  assert(Number(created.data.amount) === 40000, `amount ${created.data.amount}`);
  assert(created.data.createdByName, 'createdByName');

  const patched = await req('PATCH', `/api/payroll/settlements/${id}`, {
    ...auth,
    body: {
      note: 'SMOKE_SET_UPD',
      pairIds: [client.id],
      lines: created.data.lines.map((l) => ({
        accountPairId: l.accountPairId,
        pairName: l.pairName,
        currency: l.currency,
        subconto: l.subconto,
        firstAmount: 200000,
        secondAmount: l.secondAmount,
        amount: 40000,
      })),
    },
  });
  assert(patched.ok && patched.data.note === 'SMOKE_SET_UPD', `patch ${patched.status}`);

  const posted = await req('POST', `/api/payroll/settlements/${id}/post`, auth);
  assert(posted.ok && posted.data.status === 'matched', `post ${posted.status} ${JSON.stringify(posted.data)}`);
  assert(posted.data.posted === true, 'posted flag');

  const patchPosted = await req('PATCH', `/api/payroll/settlements/${id}`, {
    ...auth,
    body: { note: 'nope' },
  });
  assert(!patchPosted.ok, 'cannot patch posted');

  const hist = await req('GET', `/api/payroll/settlements/history?settlementId=${id}`, auth);
  assert(hist.ok && Array.isArray(hist.data) && hist.data.length >= 2, `history ${hist.status}`);
  assert(
    hist.data.some((h) => h.eventType === 'Добавлен') && hist.data.some((h) => h.eventType === 'Проведен'),
    'history events',
  );

  const cancelled = await req('POST', `/api/payroll/settlements/${id}/cancel`, auth);
  assert(cancelled.ok && cancelled.data.status === 'open', `cancel ${cancelled.status}`);

  const del = await req('DELETE', `/api/payroll/settlements/${id}`, auth);
  assert(del.ok, `delete ${del.status}`);

  const delPair = await req('DELETE', `/api/payroll/account-pairs/${pairId}`, auth);
  assert(delPair.ok, `delete pair ${delPair.status}`);

  const leftover = await req('GET', '/api/payroll/settlements', auth);
  const leftoverIds = (leftover.data || [])
    .filter((r) => String(r.note || '').startsWith('SMOKE_'))
    .map((r) => r.id);
  for (const lid of leftoverIds) {
    await req('POST', `/api/payroll/settlements/${lid}/cancel`, auth);
    await req('DELETE', `/api/payroll/settlements/${lid}`, auth);
  }

  const webList = await fetch(`${WEB}/catalog/settlements`);
  assert(webList.ok, `web list ${webList.status}`);
  const webNew = await fetch(`${WEB}/catalog/settlements/new`);
  assert(webNew.ok, `web new ${webNew.status}`);
  const webHist = await fetch(`${WEB}/catalog/settlements/history`);
  assert(webHist.ok, `web history ${webHist.status}`);
  const webPairs = await fetch(`${WEB}/catalog/account-pairs`);
  assert(webPairs.ok, `web pairs ${webPairs.status}`);
  const webPairNew = await fetch(`${WEB}/catalog/account-pairs/new`);
  assert(webPairNew.ok, `web pair new ${webPairNew.status}`);
  const webEdit = await fetch(`${WEB}/catalog/account-pairs/${client.id}/edit`);
  assert(webEdit.ok, `web pair edit ${webEdit.status}`);

  console.log(
    `✓ settlements smoke ok — pairs=${pairs.data.filter((p) => p.isActive).length} client=${client.code}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
