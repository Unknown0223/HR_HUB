/**
 * Attach face/passport photos from local folders (downloaded from Drive).
 *
 * Expected layout (either):
 *   tmp/form-photos/yuz/*.jpg
 *   tmp/form-photos/pasport/*.jpg
 * or pass paths as args.
 *
 * File names should contain employee names, e.g.:
 *   "IMG_5942 - Oybekjon Rustamov.jpeg"
 *
 * Usage:
 *   node scripts/attach-photos-from-folders.js [yuzDir] [pasportDir]
 */
const fs = require('fs');
const path = require('path');

const API = (process.env.API_URL || 'http://localhost:3002').replace(/\/$/, '');
const FORM_KEY = (process.env.EMPLOYEE_FORM_INGEST_KEY || '').trim();
const TENANT = (process.argv[4] || process.env.TENANT_CODE || 'demo').trim();
const EMAIL = process.env.ADMIN_EMAIL || 'admin@demo.local';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Demo1234!';

const YUZ =
  process.argv[2] ||
  path.join(__dirname, '../tmp/form-photos/yuz');
const PAS =
  process.argv[3] ||
  path.join(__dirname, '../tmp/form-photos/pasport');

const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;

function listImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => IMG_EXT.test(f))
    .map((f) => ({
      name: f,
      low: f.toLowerCase(),
      path: path.join(dir, f),
    }));
}

function scoreName(fileLow, lastName, firstName) {
  const ln = String(lastName || '').toLowerCase().trim();
  const fn = String(firstName || '').toLowerCase().trim();
  let score = 0;
  if (ln && fileLow.includes(ln)) score += 2;
  if (fn && fileLow.includes(fn)) score += 2;
  if (ln && ln.length >= 4 && fileLow.includes(ln.slice(0, 4))) score += 1;
  if (fn && fn.length >= 4 && fileLow.includes(fn.slice(0, 4))) score += 1;
  return score;
}

function pick(files, lastName, firstName) {
  let best = null;
  for (const f of files) {
    const s = scoreName(f.low, lastName, firstName);
    if (s >= 3 && (!best || s > best.score)) best = { score: s, file: f };
  }
  return best?.file || null;
}

function toB64(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg';
  return { base64: buf.toString('base64'), contentType: mime };
}

async function main() {
  const yuz = listImages(YUZ);
  const pas = listImages(PAS);
  console.log(`API=${API} yuz=${yuz.length} pasport=${pas.length}`);
  if (!yuz.length && !pas.length) {
    console.error(
      'Papkalar bo‘sh.\n' +
        '1) Drive da «Yuz rasmi…» va «Pasport rasmi…» papkalarini oching\n' +
        '2) ⋮ → Скачать → zip\n' +
        '3) Ochib fayllarni qo‘ying:\n' +
        `   ${YUZ}\n   ${PAS}`,
    );
    process.exit(1);
  }

  // Load employees that look like form import (high tab numbers) OR all recent
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
  const token = login.accessToken;
  const tenantId = login.tenant?.id || login.user?.tenantId;
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    Accept: 'application/json',
  };

  // Prefer import result list if present
  const resultPath = path.join(__dirname, '../tmp/gf-import-result.json');
  let targets = [];
  if (fs.existsSync(resultPath)) {
    const imp = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    targets = (imp.list || [])
      .filter((x) => x.employeeId && x.name)
      .map((x) => {
        const parts = String(x.name).trim().split(/\s+/);
        return {
          employeeId: x.employeeId,
          lastName: parts[0] || '',
          firstName: parts.slice(1).join(' ') || parts[0] || '',
          phone: undefined,
        };
      });
  }

  if (!targets.length) {
    // fallback: fetch employees page with search for recent tabs
    const res = await fetch(`${API}/api/employees?take=100&page=1`, { headers });
    const data = await res.json();
    const items = data.items || [];
    targets = items
      .filter((e) => String(e.tabNumber || '').startsWith('38605'))
      .map((e) => ({
        employeeId: e.id,
        lastName: e.lastName,
        firstName: e.firstName,
        phone: e.phone,
      }));
  }

  console.log(`targets=${targets.length}`);
  let ok = 0;
  let fail = 0;
  let miss = 0;

  for (const t of targets) {
    const face = pick(yuz, t.lastName, t.firstName);
    const passport = pick(pas, t.lastName, t.firstName);
    if (!face && !passport) {
      miss += 1;
      console.log(`MISS ${t.lastName} ${t.firstName}`);
      continue;
    }
    const body = {
      tenantCode: TENANT,
      source: 'manual',
      employeeId: t.employeeId,
      lastName: t.lastName,
      firstName: t.firstName,
      phone: t.phone,
    };
    if (face) {
      const b = toB64(face.path);
      body.facePhotoBase64 = b.base64;
      body.facePhotoContentType = b.contentType;
    }
    if (passport) {
      const b = toB64(passport.path);
      body.passportPhotoBase64 = b.base64;
      body.passportPhotoContentType = b.contentType;
    }
    const h = { 'Content-Type': 'application/json' };
    if (FORM_KEY) h['X-Employee-Form-Key'] = FORM_KEY;
    const res = await fetch(`${API}/api/employee-form/attach-photos`, {
      method: 'POST',
      headers: h,
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
        `OK ${t.lastName} ${t.firstName} face=${!!face} pass=${!!passport} <- ${face?.name || '-'} / ${passport?.name || '-'}`,
      );
    } else {
      fail += 1;
      console.log(`FAIL ${t.lastName} ${res.status}`, data?.message || data);
    }
  }

  console.log(`\nDONE ok=${ok} fail=${fail} miss=${miss}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
