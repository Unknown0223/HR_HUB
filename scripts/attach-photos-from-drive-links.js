/**
 * XLSX dagi Google Drive silkalardan rasm olib, mavjud xodimlarga biriktiradi.
 * Zip yuklamasdan — Apps Script Web App photo-proxy orqali (Drive egasi huquqi).
 *
 * Setup (bir marta):
 * 1) tools/google-form-employee/Code.gs ni Google Script ga paste
 * 2) Deploy → Web app (Execute as: Me, Anyone)
 * 3) printPhotoProxyHelp → URL ni oling
 * 4) .env:
 *      GOOGLE_DRIVE_PHOTO_PROXY=https://script.google.com/macros/s/XXXX/exec
 *      EMPLOYEE_FORM_INGEST_KEY=<CONFIG.FORM_KEY>
 *
 * Usage:
 *   node scripts/attach-photos-from-drive-links.js [xlsx] [result.json]
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile(path.join(__dirname, '../.env'));
loadEnvFile(path.join(__dirname, '../apps/api/.env'));

const API = (process.env.API_URL || 'http://localhost:3002').replace(/\/$/, '');
const PROXY = (process.env.GOOGLE_DRIVE_PHOTO_PROXY || '').trim().replace(/\/$/, '');
const FORM_KEY = (process.env.EMPLOYEE_FORM_INGEST_KEY || '').trim();
const TENANT = (process.env.TENANT_CODE || 'demo').trim();
const XLSX =
  process.argv[2] || path.join(__dirname, '../tmp/gf-responses.xlsx');
const RESULT =
  process.argv[3] || path.join(__dirname, '../tmp/gf-import-result.json');

const H = {
  lastName: 'Familiya / Фамилия',
  firstName: 'Ism / Имя',
  phone: 'Telefon',
  faceLink: 'Yuz rasmi — Google Drive havolasi',
  passportLink: 'Pasport rasmi — Google Drive havolasi',
};

function cell(row, key) {
  return String(row[H[key]] ?? '').trim();
}

function driveId(url) {
  const s = String(url || '');
  return (
    s.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ||
    s.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
    ''
  );
}

async function fetchViaProxy(urlOrId) {
  const id = driveId(urlOrId) || String(urlOrId || '').trim();
  if (!id) return null;
  if (!PROXY) {
    throw new Error(
      'GOOGLE_DRIVE_PHOTO_PROXY yo‘q. Apps Script Deploy → printPhotoProxyHelp',
    );
  }
  const qs = new URLSearchParams({
    action: 'photo',
    id,
    key: FORM_KEY || 'dev',
  });
  const res = await fetch(`${PROXY}?${qs}`, {
    redirect: 'follow',
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Proxy non-JSON (${res.status}): ${text.slice(0, 120)}. Web App Deploy qilinganligini tekshiring.`,
    );
  }
  if (!data.ok || !data.base64) {
    console.warn(`proxy miss id=${id}: ${data.error || res.status}`);
    return null;
  }
  return {
    base64: data.base64,
    contentType: data.contentType || 'image/jpeg',
    name: data.name,
  };
}

async function readXlsx(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sh = wb.worksheets[0];
  const header = [];
  sh.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
    header[i] = String(c.value ?? '');
  });
  const rows = [];
  for (let r = 2; r <= sh.rowCount; r++) {
    const row = sh.getRow(r);
    const obj = {};
    let empty = true;
    header.forEach((h, i) => {
      if (!h) return;
      let v = row.getCell(i).value;
      if (v && typeof v === 'object') {
        if (v.hyperlink) v = v.hyperlink;
        else if (v.text) v = v.text;
        else if (v.result != null) v = v.result;
        else if (v instanceof Date) v = v.toISOString();
        else v = String(v);
      }
      const s = v == null ? '' : String(v).trim();
      if (s) empty = false;
      obj[h] = s;
    });
    if (!empty) rows.push(obj);
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(XLSX)) throw new Error(`xlsx yo‘q: ${XLSX}`);
  if (!fs.existsSync(RESULT)) {
    throw new Error(`import result yo‘q: ${RESULT} — avval xodimlarni import qiling`);
  }
  if (!PROXY) {
    console.error(`
GOOGLE_DRIVE_PHOTO_PROXY sozlanmagan.

1) Google Script da Code.gs ni yangilang
2) Deploy → New deployment → Web app
   Execute as: Me · Who has access: Anyone
3) printPhotoProxyHelp ni Run qiling — URL chiqadi
4) d:\\hr-hub\\.env ga qo‘ying:
   GOOGLE_DRIVE_PHOTO_PROXY=https://script.google.com/macros/s/.../exec
   EMPLOYEE_FORM_INGEST_KEY=<CONFIG.FORM_KEY bilan bir xil>
5) API ni qayta start qiling, keyin shu skriptni qayta ishga tushiring
`);
    process.exit(1);
  }

  const rows = await readXlsx(XLSX);
  const imp = JSON.parse(fs.readFileSync(RESULT, 'utf8'));
  console.log(
    `API=${API}\nPROXY=${PROXY}\nrows=${rows.length} imported=${imp.list?.length || 0}`,
  );

  let ok = 0;
  let fail = 0;
  let miss = 0;

  for (let i = 0; i < (imp.list || []).length; i++) {
    const item = imp.list[i];
    const row = rows[i];
    if (!item?.employeeId || !row) continue;
    const faceUrl = cell(row, 'faceLink');
    const passUrl = cell(row, 'passportLink');
    const lastName = cell(row, 'lastName');
    const firstName = cell(row, 'firstName');

    let face = null;
    let pass = null;
    try {
      if (faceUrl) face = await fetchViaProxy(faceUrl);
      if (passUrl) pass = await fetchViaProxy(passUrl);
    } catch (e) {
      console.error(e.message || e);
      fail += 1;
      continue;
    }

    if (!face && !pass) {
      miss += 1;
      console.log(`MISS ${lastName} ${firstName}`);
      continue;
    }

    const body = {
      tenantCode: TENANT,
      source: 'google_form',
      employeeId: item.employeeId,
      lastName,
      firstName,
      phone: cell(row, 'phone') || undefined,
    };
    if (face) {
      body.facePhotoBase64 = face.base64;
      body.facePhotoContentType = face.contentType;
    }
    if (pass) {
      body.passportPhotoBase64 = pass.base64;
      body.passportPhotoContentType = pass.contentType;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (FORM_KEY) headers['X-Employee-Form-Key'] = FORM_KEY;
    const res = await fetch(`${API}/api/employee-form/attach-photos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (res.status >= 200 && res.status < 300) {
      ok += 1;
      console.log(
        `OK ${lastName} ${firstName} face=${!!data.facePhotoSaved} pass=${!!data.passportPhotoSaved}`,
      );
    } else {
      fail += 1;
      console.log(`FAIL ${lastName} ${res.status}`, data.message || data);
    }
  }

  console.log(`\nDONE ok=${ok} fail=${fail} miss=${miss}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
