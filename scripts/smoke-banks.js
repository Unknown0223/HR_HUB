/** Smoke: Банки + bulk import (MFO / name / address / state) */
const fs = require('node:fs');
const ExcelJS = require('exceljs');

const API = process.env.API_URL || 'http://127.0.0.1:3001';
const XLSX =
  process.env.BANKS_XLSX ||
  'C:\\Users\\UNKNOWN_007\\Downloads\\Банки-(импорт)(16.08.2026+23_05_32).xlsx';

async function req(method, pathUrl, { token, tenant, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  const res = await fetch(`${API}${pathUrl}`, {
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

function padMfo(v) {
  const t = String(v || '').trim();
  return /^\d+$/.test(t) ? t.padStart(5, '0') : t;
}

async function parseXlsxBanks(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    for (let c = 1; c <= 5; c++) {
      const v = row.getCell(c).value;
      cells.push(v == null ? '' : String(typeof v === 'object' && v.text ? v.text : v).trim());
    }
    rows.push(cells);
  });
  const out = [];
  for (const line of rows) {
    const mfo = padMfo(line[1]);
    const name = line[2];
    if (!/^\d{5}$/.test(mfo) || !name) continue;
    if (mfo === 'МФО' || name.startsWith('Название')) continue;
    out.push({
      code: mfo,
      name,
      isActive: String(line[4] || 'A').toUpperCase() !== 'P',
      meta: { address: line[3] || undefined, smartupId: line[0] || undefined },
    });
  }
  return out;
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
  const dict = (list.data || []).find((d) => d.code === 'banks');
  assert(dict, 'banks dict missing');

  const stamp = Date.now().toString().slice(-4);
  const mfo = `9${stamp}`;
  const created = await req('POST', `/api/settings/dictionaries/${dict.id}/items`, {
    ...auth,
    body: {
      code: mfo,
      name: `Smoke bank ${stamp}`,
      isActive: true,
      meta: { address: '100000, г. Ташкент', swift: 'SMOKEUZ22' },
    },
  });
  assert(created.ok, `create ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.meta?.swift === 'SMOKEUZ22', 'swift not stored');

  const bulk = await req('POST', `/api/settings/dictionaries/${dict.id}/items/import`, {
    ...auth,
    body: {
      items: [
        {
          code: `8${stamp}`,
          name: `Smoke import ${stamp}`,
          isActive: true,
          meta: { address: 'Import st 1', smartupId: '1' },
        },
        {
          code: mfo,
          name: `Smoke bank ${stamp} upd`,
          isActive: true,
          meta: { address: 'Updated addr' },
        },
      ],
    },
  });
  assert(bulk.ok, `import ${bulk.status} ${JSON.stringify(bulk.data)}`);
  assert(bulk.data.created >= 1, 'expected created');
  assert(bulk.data.updated >= 1, 'expected updated');

  const after = await req('GET', '/api/settings/dictionaries?kind=admin', auth);
  const banks = (after.data || []).find((d) => d.code === 'banks');
  const smoke = (banks.items || []).find((i) => i.code === mfo);
  assert(smoke?.name.includes('upd'), 'upsert name not applied');
  assert(smoke?.meta?.address === 'Updated addr', 'address not patched');
  assert(smoke?.meta?.swift === 'SMOKEUZ22', 'swift lost on import merge');

  if (fs.existsSync(XLSX)) {
    const items = await parseXlsxBanks(XLSX);
    assert(items.length >= 10, `xlsx parsed too few (${items.length})`);
    const ximp = await req('POST', `/api/settings/dictionaries/${dict.id}/items/import`, {
      ...auth,
      body: { items },
    });
    assert(ximp.ok, `xlsx import ${ximp.status} ${JSON.stringify(ximp.data)}`);
    assert(ximp.data.created + ximp.data.updated >= 10, 'xlsx import did not upsert');
    const again = await req('GET', '/api/settings/dictionaries?kind=admin', auth);
    const all = ((again.data || []).find((d) => d.code === 'banks').items || []);
    const cbu = all.find((i) => i.code === '00001');
    assert(cbu, '00001 missing after xlsx import');
    assert(String(cbu.name).includes('Центр расчетов'), '00001 name mismatch');
  }

  const extra = (banks.items || []).find((i) => i.code === `8${stamp}`);
  for (const id of [created.data.id, extra?.id].filter(Boolean)) {
    const del = await req(
      'POST',
      `/api/settings/dictionaries/${dict.id}/items/${id}/delete`,
      auth,
    );
    assert(del.ok, `delete ${del.status}`);
  }

  console.log(
    `✓ banks: items=${(dict.items || []).length} import create=${bulk.data.created} update=${bulk.data.updated}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
