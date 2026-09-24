/**
 * Backfill org (division/position) + best-effort Drive photos
 * for employees imported from Google Form xlsx.
 *
 * Usage:
 *   node scripts/backfill-google-form-org-photos.js [xlsx] [result.json] [tenantCode]
 */
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const API = (process.env.API_URL || 'http://localhost:3002').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || 'admin@demo.local';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Demo1234!';
const XLSX = process.argv[2] || path.join(__dirname, '../tmp/gf-responses.xlsx');
const RESULT =
  process.argv[3] || path.join(__dirname, '../tmp/gf-import-result.json');
const TENANT_CODE = (process.argv[4] || 'demo').trim();

const H = {
  lastName: 'Familiya / Фамилия',
  firstName: 'Ism / Имя',
  division: "Bo'lim / Подразделение",
  position: 'Lavozim / Должность',
  faceLink: 'Yuz rasmi — Google Drive havolasi',
  passportLink: 'Pasport rasmi — Google Drive havolasi',
};

function cell(row, key) {
  return String(row[H[key]] ?? '').trim();
}

function normName(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function slugCode(s) {
  const base = String(s || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()
    .slice(0, 24);
  return base || `AUTO_${Date.now().toString(36).toUpperCase()}`;
}

function driveFileId(url) {
  const s = String(url || '');
  let m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

async function fetchDriveBuffer(url) {
  const id = driveFileId(url);
  if (!id) return null;
  const urls = [
    `https://drive.google.com/uc?export=download&id=${id}`,
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, { redirect: 'follow' });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        // virus-scan interstitial — try confirm token
        const html = await res.text();
        const m = html.match(/confirm=([0-9A-Za-z_]+)/);
        if (m) {
          const res2 = await fetch(
            `https://drive.google.com/uc?export=download&id=${id}&confirm=${m[1]}`,
            { redirect: 'follow' },
          );
          if (!res2.ok) continue;
          const ct2 = (res2.headers.get('content-type') || '').toLowerCase();
          if (ct2.includes('text/html')) continue;
          const buf = Buffer.from(await res2.arrayBuffer());
          if (buf.length < 500) continue;
          return {
            buf,
            mime: ct2.startsWith('image/') ? ct2.split(';')[0] : 'image/jpeg',
          };
        }
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) continue;
      return {
        buf,
        mime: ct.startsWith('image/') ? ct.split(';')[0] : 'image/jpeg',
      };
    } catch {
      /* next */
    }
  }
  return null;
}

async function readXlsxRows(file) {
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
  return rows;
}

async function main() {
  const importResult = JSON.parse(fs.readFileSync(RESULT, 'utf8'));
  const xrows = await readXlsxRows(XLSX);
  if (importResult.list.length !== xrows.length) {
    console.warn(
      `warn: result=${importResult.list.length} xlsx=${xrows.length} — match by index`,
    );
  }

  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok) throw new Error(`login ${loginRes.status} ${JSON.stringify(login)}`);
  const token = login.accessToken;
  const tenantId = login.tenant?.id || login.user?.tenantId;
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Load catalogs
  const [divRes, posRes] = await Promise.all([
    fetch(`${API}/api/organization/divisions?take=500`, { headers }),
    fetch(`${API}/api/organization/positions?take=500`, { headers }),
  ]);
  const divJson = await divRes.json();
  const posJson = await posRes.json();
  const divisions = divJson.items || divJson.data || divJson || [];
  const positions = posJson.items || posJson.data || posJson || [];
  const divByName = new Map(
    (Array.isArray(divisions) ? divisions : []).map((d) => [
      normName(d.name),
      d,
    ]),
  );
  const posByName = new Map(
    (Array.isArray(positions) ? positions : []).map((p) => [
      normName(p.name),
      p,
    ]),
  );

  async function ensureDivision(name) {
    const n = String(name || '').trim();
    if (!n) return null;
    const key = normName(n);
    if (divByName.has(key)) return divByName.get(key);
    const code = slugCode(n);
    const res = await fetch(`${API}/api/organization/divisions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: n, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      // maybe code clash — search again
      console.warn('division create fail', n, res.status, data?.message || data);
      return null;
    }
    divByName.set(key, data);
    console.log(`+ division ${n} (${data.id})`);
    return data;
  }

  async function ensurePosition(name) {
    const n = String(name || '').trim();
    if (!n) return null;
    const key = normName(n);
    if (posByName.has(key)) return posByName.get(key);
    const code = slugCode(n);
    const res = await fetch(`${API}/api/organization/positions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: n, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('position create fail', n, res.status, data?.message || data);
      return null;
    }
    posByName.set(key, data);
    console.log(`+ position ${n} (${data.id})`);
    return data;
  }

  const summary = {
    patched: 0,
    faces: 0,
    passports: 0,
    faceFail: 0,
    errors: [],
  };

  for (let i = 0; i < importResult.list.length; i++) {
    const item = importResult.list[i];
    const row = xrows[i];
    if (!item?.employeeId || !row) continue;
    const empId = item.employeeId;
    const divName = cell(row, 'division');
    const posName = cell(row, 'position');
    const div = await ensureDivision(divName);
    const pos = await ensurePosition(posName);

    const patch = {};
    if (div?.id) patch.divisionId = div.id;
    if (pos?.id) patch.positionId = pos.id;
    if (Object.keys(patch).length) {
      const res = await fetch(`${API}/api/employees/${empId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        summary.patched += 1;
        console.log(
          `PATCH ${item.name || empId} div=${divName || '-'} pos=${posName || '-'}`,
        );
      } else {
        const t = await res.text();
        summary.errors.push({ empId, patch: t });
        console.warn('PATCH fail', empId, res.status, t.slice(0, 200));
      }
    }

    // Face photo
    const faceUrl = cell(row, 'faceLink');
    const face = await fetchDriveBuffer(faceUrl);
    if (face) {
      const fd = new FormData();
      const blob = new Blob([face.buf], { type: face.mime });
      fd.append('file', blob, `face-${i}.jpg`);
      const up = await fetch(`${API}/api/employees/${empId}/face`, {
        method: 'POST',
        headers: {
          Authorization: headers.Authorization,
          'X-Tenant-Id': headers['X-Tenant-Id'],
        },
        body: fd,
      });
      if (up.ok) {
        summary.faces += 1;
        console.log(`FACE ok ${item.name}`);
      } else {
        summary.faceFail += 1;
        console.warn(`FACE fail ${item.name} ${up.status}`);
      }
    }

    // Passport as person-document file — skip if no dedicated endpoint easy path;
    // store via person-documents create if face worked pattern exists.
    // For now attach as employee file if /files exists — optional.
  }

  const out = path.join(__dirname, '../tmp/gf-backfill-result.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log('\n=== BACKFILL ===');
  console.log(summary);
  console.log('wrote', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
