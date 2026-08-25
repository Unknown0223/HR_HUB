/** Smoke: Загрузка фотографий сотрудников (template + batch import) */
const API = process.env.API_URL || 'http://127.0.0.1:3001';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function req(method, path, { token, tenant, body, form } = {}) {
  const headers = {};
  if (!form) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ? form : body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function appendPng(form, name) {
  form.append('files', new Blob([PNG], { type: 'image/png' }), name);
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

  const missing = await req('POST', '/api/storage/photos/import', auth);
  assert(!missing.ok && missing.status === 400, `expected 400 without template, got ${missing.status}`);

  const form = new FormData();
  form.append('template', 'first_last');
  appendPng(form, 'Alijon Karimov.png');
  appendPng(form, 'Nobody Missing.png');
  appendPng(form, 'Smoke Import.png');
  appendPng(form, 'Karimov Alijon.png');

  const imported = await req('POST', '/api/storage/photos/import', { ...auth, form });
  assert(imported.ok, `import ${imported.status} ${JSON.stringify(imported.data)}`);
  assert(imported.data.counts.success >= 1, `success count ${imported.data.counts.success}`);
  assert(imported.data.counts.not_found >= 1, `not_found ${imported.data.counts.not_found}`);
  assert(imported.data.counts.warning >= 1, `warning ${imported.data.counts.warning}`);
  const ok = imported.data.items.find((r) => r.status === 'success');
  assert(ok?.employees?.[0]?.tabNumber === '0001', `expected 0001 got ${JSON.stringify(ok)}`);
  const miss = imported.data.items.find((r) => String(r.file).includes('Nobody'));
  assert(miss?.status === 'not_found', 'Nobody should be not_found');
  const warn = imported.data.items.find((r) => String(r.file).includes('Smoke Import'));
  assert(warn?.status === 'warning' && warn.employees.length >= 2, 'Smoke Import should warn on duplicates');
  const wrongOrder = imported.data.items.find((r) => String(r.file).includes('Karimov Alijon'));
  assert(wrongOrder?.status === 'not_found', 'wrong template order should not match first_last');

  const tabForm = new FormData();
  tabForm.append('template', 'tab');
  appendPng(tabForm, '0001.png');
  const byTab = await req('POST', '/api/storage/photos/import', { ...auth, form: tabForm });
  assert(byTab.ok && byTab.data.counts.success >= 1, `tab template ${byTab.status}`);

  console.log(
    `✓ photos: success=${imported.data.counts.success} warning=${imported.data.counts.warning} not_found=${imported.data.counts.not_found}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
