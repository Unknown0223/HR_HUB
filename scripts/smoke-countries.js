/** Smoke: Страны + Области (countries + regions meta.countryCode) */
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

  const list = await req('GET', '/api/settings/dictionaries?kind=admin', auth);
  assert(list.ok, `dicts ${list.status}`);
  const countries = (list.data || []).find((d) => d.code === 'countries');
  const regions = (list.data || []).find((d) => d.code === 'regions');
  assert(countries, 'countries dict missing');
  assert(regions, 'regions dict missing');
  assert((countries.items || []).length >= 1, 'expected country items');
  const uz = (countries.items || []).find((i) => i.code === 'UZ') || countries.items[0];

  const stamp = Date.now().toString(36).toUpperCase();
  const country = await req('POST', `/api/settings/dictionaries/${countries.id}/items`, {
    ...auth,
    body: {
      code: `SM${stamp.slice(-6)}`,
      name: `Smoke country ${stamp}`,
      isActive: true,
      meta: { altName: 'SmokeLand', gps: '41.1, 69.2' },
    },
  });
  assert(country.ok, `create country ${country.status} ${JSON.stringify(country.data)}`);
  assert(country.data.meta?.altName === 'SmokeLand', 'altName not stored');
  assert(country.data.meta?.gps === '41.1, 69.2', 'gps not stored');

  const region = await req('POST', `/api/settings/dictionaries/${regions.id}/items`, {
    ...auth,
    body: {
      code: `SR${stamp.slice(-6)}`,
      name: `Smoke region ${stamp}`,
      isActive: true,
      meta: {
        countryId: uz.id,
        countryCode: uz.code,
        countryName: uz.name,
        altName: 'Oblast',
        gps: '41.3, 69.2',
      },
    },
  });
  assert(region.ok, `create region ${region.status} ${JSON.stringify(region.data)}`);
  assert(region.data.meta?.countryId === uz.id, 'countryId not stored');

  const patched = await req(
    'PATCH',
    `/api/settings/dictionaries/${countries.id}/items/${country.data.id}`,
    { ...auth, body: { meta: { gps: '40.0, 70.0' }, isActive: false } },
  );
  assert(patched.ok, `patch country ${patched.status}`);
  assert(patched.data.isActive === false, 'isActive not patched');
  assert(patched.data.meta?.gps === '40.0, 70.0', 'gps not patched');
  assert(patched.data.meta?.altName === 'SmokeLand', 'altName lost');

  const from = '2020-01-01';
  const to = new Date().toISOString().slice(0, 10);
  const audit = await req(
    'GET',
    `/api/settings/audit?entity=DictionaryItem&entityId=${country.data.id}&from=${from}&to=${to}`,
    auth,
  );
  assert(audit.ok, `audit ${audit.status}`);
  assert(Array.isArray(audit.data), 'audit not array');
  assert(audit.data.length >= 1, 'expected audit rows for country');

  const delR = await req(
    'POST',
    `/api/settings/dictionaries/${regions.id}/items/${region.data.id}/delete`,
    auth,
  );
  assert(delR.ok, `delete region ${delR.status}`);
  const delC = await req(
    'POST',
    `/api/settings/dictionaries/${countries.id}/items/${country.data.id}/delete`,
    auth,
  );
  assert(delC.ok, `delete country ${delC.status}`);

  console.log(
    `✓ countries: countries=${(countries.items || []).length} regions=${(regions.items || []).length}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
