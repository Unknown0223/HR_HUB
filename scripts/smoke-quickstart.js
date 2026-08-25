/** Smoke: Инструкция для быстрого запуска */
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

  const got = await req('GET', '/api/settings/quickstart', auth);
  assert(got.ok, `get ${got.status} ${JSON.stringify(got.data)}`);
  assert(Array.isArray(got.data.steps) && got.data.steps.length === 10, 'expected 10 steps');
  assert(got.data.heading === '#qs:ht:verifix', 'heading mismatch');
  const keys = got.data.steps.map((s) => s.key);
  assert(keys.includes('organization') && keys.includes('hiring'), 'missing keys');
  const prevHire = got.data.checked?.hiring;

  const patched = await req('PATCH', '/api/settings/quickstart', {
    ...auth,
    body: { checked: { hiring: true } },
  });
  assert(patched.ok, `patch ${patched.status}`);
  const hire = patched.data.steps.find((s) => s.key === 'hiring');
  assert(hire?.done === true, 'hiring not marked done');
  assert(patched.data.doneCount >= 1, 'doneCount');

  const off = await req('PATCH', '/api/settings/quickstart', {
    ...auth,
    body: { checked: { hiring: false } },
  });
  assert(off.ok, `uncheck ${off.status}`);
  const hireOff = off.data.steps.find((s) => s.key === 'hiring');
  assert(hireOff?.done === false, 'hiring still done after uncheck');

  const restore =
    typeof prevHire === 'boolean'
      ? prevHire
      : Boolean(got.data.steps.find((s) => s.key === 'hiring')?.done);
  await req('PATCH', '/api/settings/quickstart', {
    ...auth,
    body: { checked: { hiring: restore } },
  });

  console.log(`✓ quickstart: ${off.data.doneCount}/${off.data.total} auto org=${got.data.steps[0].auto}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
