/** Smoke: Средние зарплаты (dictionary avg_salary) */
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

  const list = await req('GET', '/api/settings/dictionaries?kind=extra', auth);
  assert(list.ok, `dicts ${list.status}`);
  const dict = (list.data || []).find((d) => d.code === 'avg_salary');
  assert(dict, 'avg_salary dict missing');

  const lookups = await req('GET', '/api/catalog/lookups', auth);
  assert(lookups.ok, `lookups ${lookups.status}`);
  assert(Array.isArray(lookups.data.positions), 'lookups.positions missing');
  assert(Array.isArray(lookups.data.grades), 'lookups.grades missing');
  assert(Array.isArray(lookups.data.avgSalaries), 'lookups.avgSalaries missing');
  assert(lookups.data.positions.length >= 1, 'expected at least one position');
  assert(lookups.data.grades.length >= 1, 'expected at least one grade');

  const pos = lookups.data.positions[0];
  const grade = lookups.data.grades[0];
  const stamp = Date.now().toString(36).toUpperCase();
  const code = `SMOKE_AS_${stamp}`;

  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code,
      name: pos.label,
      isActive: true,
      meta: {
        positionId: pos.id,
        positionName: pos.label,
        gradeId: grade.id,
        gradeName: grade.label,
        valueFrom: 8500000,
        valueTo: 12000000,
      },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.positionId === pos.id, 'positionId not stored');
  assert(created.data.meta?.valueFrom === 8500000, 'valueFrom not stored');
  assert(created.data.meta?.valueTo === 12000000, 'valueTo not stored');
  assert(created.data.meta?.createdAt, 'createdAt missing');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}`,
    {
      ...auth,
      body: {
        name: pos.label,
        meta: { valueTo: 15000000 },
      },
    },
  );
  assert(patched.ok, `patch ${patched.status}`);
  assert(patched.data.meta?.positionId === pos.id, 'positionId lost on meta merge');
  assert(patched.data.meta?.valueFrom === 8500000, 'valueFrom lost on meta merge');
  assert(patched.data.meta?.valueTo === 15000000, 'valueTo not patched');

  const hist = await req(
    'GET',
    `/api/settings/audit?entity=DictionaryItem&entityId=${created.data.id}`,
    auth,
  );
  assert(hist.ok, `audit ${hist.status}`);
  assert(Array.isArray(hist.data), 'audit expected array');
  assert(
    hist.data.some((a) => a.action === 'dictionary.item.create'),
    'create audit missing',
  );
  assert(
    hist.data.some((a) => a.action === 'dictionary.item.update'),
    'update audit missing',
  );

  const after = await req('GET', '/api/catalog/lookups', auth);
  assert(
    (after.data.avgSalaries || []).some((r) => r.id === created.data.id),
    'created row missing from lookups.avgSalaries',
  );

  const del = await req(
    'POST',
    `/api/settings/dictionaries/${dict.id}/items/${created.data.id}/delete`,
    auth,
  );
  assert(del.ok, `delete ${del.status}`);

  console.log(
    `✓ avg-salaries: dict=${dict.id}, positions=${lookups.data.positions.length}, grades=${lookups.data.grades.length}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
