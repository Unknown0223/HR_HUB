/**
 * Import Google Form «Ответы» xlsx → POST /api/employee-form/ingest
 * Usage: node scripts/import-google-form-xlsx.js [path.xlsx] [tenantCode]
 */
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const API = (process.env.API_URL || 'http://localhost:3002').replace(/\/$/, '');
const FORM_KEY = (process.env.EMPLOYEE_FORM_INGEST_KEY || '').trim();
const XLSX =
  process.argv[2] ||
  path.join(__dirname, '../tmp/gf-responses.xlsx');
const TENANT = (process.argv[3] || 'demo').trim();

const H = {
  lastName: 'Familiya / Фамилия',
  firstName: 'Ism / Имя',
  middleName: 'Otasi ismi / Отчество',
  phone: 'Telefon',
  pinfl: 'JSHSHIR (PINFL) / ПИНФЛ',
  birthDate: "Tug'ilgan sana / Дата рождения",
  gender: 'Jins / Пол',
  passportDocType: 'Hujjat turi / Тип документа',
  passportSeries: 'Pasport seriyasi / Серия',
  passportNumber: 'Pasport raqami / Номер',
  division: "Bo'lim / Подразделение",
  position: 'Lavozim / Должность',
  employmentType: 'Ish turi / Тип занятости',
  hiredAt: 'Qabul sanasi / Дата приёма',
  faceLink: 'Yuz rasmi — Google Drive havolasi',
  passportLink: 'Pasport rasmi — Google Drive havolasi',
  ts: 'Отметка времени',
};

function cell(row, key) {
  return String(row[H[key]] ?? '').trim();
}

function ymd(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function phoneNorm(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('998') && d.length === 12) return `+${d}`;
  if (d.length === 9) return `+998${d}`;
  if (d.length === 12 && d.startsWith('998')) return `+${d}`;
  return p ? String(p).trim() : '';
}

function splitPassport(series, number) {
  let ser = String(series || '').trim().toUpperCase().replace(/\s/g, '');
  let num = String(number || '').trim().toUpperCase().replace(/\s/g, '');
  // Full id in series: AB8813148
  const m1 = ser.match(/^([A-Z]{2})(\d{5,9})$/);
  if (m1 && !num) {
    ser = m1[1];
    num = m1[2];
  }
  // Same value in both
  if (ser && ser === num) {
    const m2 = ser.match(/^([A-Z]{2})(\d{5,9})$/);
    if (m2) {
      ser = m2[1];
      num = m2[2];
    }
  }
  // Number has series prefix
  const m3 = num.match(/^([A-Z]{2})(\d{5,9})$/);
  if (m3) {
    if (!ser || ser.length > 2) ser = m3[1];
    num = m3[2];
  }
  return { series: ser || undefined, number: num || undefined };
}

function driveFileId(url) {
  const s = String(url || '');
  let m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

async function fetchDriveBase64(url) {
  const id = driveFileId(url);
  if (!id) return null;
  const candidates = [
    `https://drive.google.com/uc?export=download&id=${id}`,
    `https://drive.google.com/uc?id=${id}&export=download`,
  ];
  for (const u of candidates) {
    try {
      const res = await fetch(u, { redirect: 'follow' });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) continue;
      const mime = ct.startsWith('image/')
        ? ct.split(';')[0]
        : buf[0] === 0x89
          ? 'image/png'
          : 'image/jpeg';
      return { base64: buf.toString('base64'), contentType: mime };
    } catch {
      /* next */
    }
  }
  return null;
}

function mapRow(row, index) {
  let pinfl = cell(row, 'pinfl');
  let { series, number } = splitPassport(
    cell(row, 'passportSeries'),
    cell(row, 'passportNumber'),
  );

  // PINFL field sometimes holds passport id
  if (pinfl && /[A-Za-z]/.test(pinfl)) {
    const sp = splitPassport(pinfl, '');
    if (!series) series = sp.series;
    if (!number) number = sp.number;
    pinfl = '';
  }
  // digits-only PINFL sanity (UZ = 14)
  if (pinfl && /^\d+$/.test(pinfl) && pinfl.length !== 14) {
    // keep as-is but note — still send
  }

  const birthDate = ymd(cell(row, 'birthDate'));
  const hiredAt = ymd(cell(row, 'hiredAt'));
  const payload = {
    tenantCode: TENANT,
    source: 'google_form',
    googleResponseId: `xlsx-${ymd(cell(row, 'ts')) || index}-${cell(row, 'lastName')}-${cell(row, 'firstName')}`.slice(
      0,
      120,
    ),
    lastName: cell(row, 'lastName'),
    firstName: cell(row, 'firstName'),
    middleName: cell(row, 'middleName') || undefined,
    phone: phoneNorm(cell(row, 'phone')) || undefined,
    pinfl: pinfl || undefined,
    birthDate: birthDate || undefined,
    gender: cell(row, 'gender') || undefined,
    passportDocType: cell(row, 'passportDocType') || undefined,
    passportSeries: series,
    passportNumber: number,
    divisionCode: cell(row, 'division') || undefined,
    divisionName: cell(row, 'division') || undefined,
    positionCode: cell(row, 'position') || undefined,
    positionName: cell(row, 'position') || undefined,
    employmentType: cell(row, 'employmentType') || undefined,
    hiredAt: hiredAt || undefined,
    note: `Imported from Google Form responses xlsx @ ${cell(row, 'ts') || ''}`,
    facePhotoUrl: cell(row, 'faceLink') || undefined,
    passportPhotoUrl: cell(row, 'passportLink') || undefined,
  };
  Object.keys(payload).forEach((k) => {
    if (payload[k] === '' || payload[k] == null) delete payload[k];
  });
  return {
    payload,
    faceLink: cell(row, 'faceLink'),
    passportLink: cell(row, 'passportLink'),
  };
}

async function postIngest(payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (FORM_KEY) headers['X-Employee-Form-Key'] = FORM_KEY;
  const res = await fetch(`${API}/api/employee-form/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function main() {
  if (!fs.existsSync(XLSX)) {
    console.error('File not found:', XLSX);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
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
        if (v.text) v = v.text;
        else if (v.result != null) v = v.result;
        else if (v.hyperlink) v = v.hyperlink;
        else if (v instanceof Date) v = v.toISOString();
        else v = String(v);
      }
      const s = v == null ? '' : String(v).trim();
      if (s) empty = false;
      obj[h] = s;
    });
    if (!empty) rows.push(obj);
  }

  console.log(`API=${API} tenant=${TENANT} rows=${rows.length}`);
  const summary = { ok: 0, conflict: 0, fail: 0, photos: 0, list: [] };

  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(rows[i], i + 1);
    const { payload } = mapped;
    if (!payload.lastName || !payload.firstName) {
      summary.fail += 1;
      summary.list.push({ i: i + 1, error: 'missing name' });
      continue;
    }

    // Photos: prefer downloaded base64; else send Drive URL for server-side fetch
    const face = await fetchDriveBase64(mapped.faceLink);
    if (face) {
      payload.facePhotoBase64 = face.base64;
      payload.facePhotoContentType = face.contentType;
      summary.photos += 1;
    }
    const pass = await fetchDriveBase64(mapped.passportLink);
    if (pass) {
      payload.passportPhotoBase64 = pass.base64;
      payload.passportPhotoContentType = pass.contentType;
      summary.photos += 1;
    }

    const res = await postIngest(payload);
    const name = `${payload.lastName} ${payload.firstName}`;
    if (res.status >= 200 && res.status < 300) {
      summary.ok += 1;
      const faceOk = !!(res.data && res.data.facePhotoSaved);
      const passOk = !!(res.data && res.data.passportPhotoSaved);
      summary.list.push({
        i: i + 1,
        name,
        employeeId: res.data.employeeId,
        tabNumber: res.data.tabNumber,
        face: faceOk || !!face,
        passport: passOk || !!pass,
      });
      console.log(
        `OK ${i + 1}/${rows.length} ${name} tab=${res.data.tabNumber} face=${faceOk || !!face} pass=${passOk || !!pass}`,
      );
    } else if (
      res.status === 409 ||
      String(res.data?.message || '').includes('already exists')
    ) {
      // Existing → attach photos via dedicated endpoint
      const attachBody = {
        tenantCode: TENANT,
        source: 'google_form',
        lastName: payload.lastName,
        firstName: payload.firstName,
        phone: payload.phone,
        employeeId: res.data?.employeeId,
        facePhotoBase64: payload.facePhotoBase64,
        facePhotoContentType: payload.facePhotoContentType,
        passportPhotoBase64: payload.passportPhotoBase64,
        passportPhotoContentType: payload.passportPhotoContentType,
        facePhotoUrl: payload.facePhotoUrl,
        passportPhotoUrl: payload.passportPhotoUrl,
      };
      Object.keys(attachBody).forEach((k) => {
        if (attachBody[k] == null || attachBody[k] === '') delete attachBody[k];
      });
      const att = await postAttach(attachBody);
      if (att.status >= 200 && att.status < 300) {
        summary.ok += 1;
        summary.list.push({
          i: i + 1,
          name,
          conflict: true,
          attached: true,
          face: !!att.data?.facePhotoSaved,
          passport: !!att.data?.passportPhotoSaved,
        });
        console.log(
          `ATTACH ${i + 1} ${name} face=${!!att.data?.facePhotoSaved} pass=${!!att.data?.passportPhotoSaved}`,
        );
      } else {
        summary.conflict += 1;
        summary.list.push({ i: i + 1, name, conflict: true, data: res.data });
        console.log(`SKIP ${i + 1} ${name} (exists, photos not attached)`);
      }
    } else {
      summary.fail += 1;
      summary.list.push({
        i: i + 1,
        name,
        status: res.status,
        error: res.data?.message || res.data,
      });
      console.log(`FAIL ${i + 1} ${name} ${res.status}`, res.data?.message || res.data);
    }
  }

  const out = path.join(__dirname, '../tmp/gf-import-result.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(
    `created=${summary.ok} conflict=${summary.conflict} fail=${summary.fail} photoFetches=${summary.photos}`,
  );
  console.log('result:', out);
}

async function postAttach(payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (FORM_KEY) headers['X-Employee-Form-Key'] = FORM_KEY;
  const res = await fetch(`${API}/api/employee-form/attach-photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
