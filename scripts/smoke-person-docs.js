/** Smoke: Импорт персональных документов (Excel mapping + PersonDocument) */
const fs = require('node:fs');
const ExcelJS = require('exceljs');

const API = process.env.API_URL || 'http://127.0.0.1:3001';
const XLSX =
  process.env.PERSON_DOCS_XLSX ||
  'C:\\Users\\UNKNOWN_007\\Downloads\\Импорт-персональных-документов(16.08.2026+23_14_39).xlsx';

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

async function parseHeaders(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets.find((s) => /персональн/i.test(s.name)) || wb.worksheets[0];
  const row = ws.getRow(1);
  const headers = [];
  for (let c = 1; c <= 11; c++) {
    const v = row.getCell(c).value;
    headers.push(v == null ? '' : String(typeof v === 'object' && v.text ? v.text : v).trim());
  }
  return { sheet: ws.name, headers, sheets: wb.worksheets.map((s) => s.name) };
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

  const cfg = await req('GET', '/api/settings/person-docs-import', auth);
  assert(cfg.ok, `get cfg ${cfg.status}`);
  assert(cfg.data.startRow === 2 || cfg.data.startRow >= 1, 'startRow');
  assert(Array.isArray(cfg.data.fields) && cfg.data.fields.length === 11, '11 fields');

  const patched = await req('PATCH', '/api/settings/person-docs-import', {
    ...auth,
    body: { startRow: 2, personKey: 'fio', fields: cfg.data.fields },
  });
  assert(patched.ok, `patch ${patched.status} ${JSON.stringify(patched.data)}`);
  assert(patched.data.personKey === 'fio', 'personKey');

  if (fs.existsSync(XLSX)) {
    const parsed = await parseHeaders(XLSX);
    assert(parsed.headers[0].includes('Физическое'), `header0 ${parsed.headers[0]}`);
    assert(parsed.headers[1].includes('Тип'), `header1 ${parsed.headers[1]}`);
    assert(parsed.headers[3].includes('Номер'), `header3 ${parsed.headers[3]}`);
    assert(parsed.sheets.includes('Персональные документы'), `sheets ${parsed.sheets}`);
  }

  const emps = await req('GET', '/api/employees?status=active&limit=50', auth);
  assert(emps.ok, `employees ${emps.status}`);
  const emp =
    (emps.data.items || []).find((e) => e.tabNumber === '0001') || (emps.data.items || [])[0];
  assert(emp, 'no employee');
  const fio = [emp.lastName, emp.firstName].filter(Boolean).join(' ');
  const docNumber = `SMK-${Date.now()}`;

  const imported = await req('POST', '/api/settings/import-person-docs', {
    ...auth,
    body: {
      personKey: 'fio',
      items: [
        {
          person: fio,
          docType: 'Паспорт (по умолчанию)',
          series: 'AA',
          number: docNumber,
          issuer: 'ОВД',
          issuedAt: '15.01.2020',
          startsAt: '15.01.2020',
          expiresAt: '15.01.2030',
          isValid: 'Да',
          status: 'Новый',
          note: 'smoke',
        },
        {
          person: 'Nobody Missing Person',
          docType: 'Паспорт',
          number: 'NO-1',
        },
      ],
    },
  });
  assert(imported.ok, `import ${imported.status} ${JSON.stringify(imported.data)}`);
  assert(imported.data.created + imported.data.updated >= 1, 'created/updated');
  assert(
    (imported.data.errors || []).some((e) => String(e.error).includes('Nobody')),
    `expected missing person error ${JSON.stringify(imported.data.errors)}`,
  );

  const byCode = await req('POST', '/api/settings/import-person-docs', {
    ...auth,
    body: {
      personKey: 'code',
      items: [
        {
          person: emp.tabNumber,
          docType: 'ID',
          number: `${docNumber}-ID`,
          issuedAt: '2021-02-01',
        },
      ],
    },
  });
  assert(byCode.ok && byCode.data.created + byCode.data.updated >= 1, `by code ${JSON.stringify(byCode.data)}`);

  const listed = await req('GET', '/api/settings/person-documents?limit=20', auth);
  assert(listed.ok && Array.isArray(listed.data), 'list');
  assert(
    listed.data.some((r) => r.docNumber === docNumber),
    'imported doc not in journal',
  );

  console.log(
    `✓ person-docs: created=${imported.data.created} updated=${imported.data.updated} errors=${imported.data.errors.length} fio=${fio}`,
  );
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
