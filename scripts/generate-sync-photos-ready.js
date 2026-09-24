/**
 * Yig‘ilgan Ответы.xlsx + gf-import-result.json dan
 * bir marta Run qilinadigan Apps Script yasaydi (zip yo‘q).
 *
 *   node scripts/generate-sync-photos-ready.js
 *   → tmp/SyncPhotosReady.gs
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');
const XLSX = path.join(ROOT, 'tmp', 'gf-responses.xlsx');
const RESULT = path.join(ROOT, 'tmp', 'gf-import-result.json');
const TUNNEL_TXT = path.join(ROOT, 'tmp', 'drive-photo-tunnel.txt');
const OUT_GS = path.join(ROOT, 'tmp', 'SyncPhotosReady.gs');
const OUT_JSON = path.join(ROOT, 'tmp', 'ready-photos.json');

const H = {
  lastName: 'Familiya / Фамилия',
  firstName: 'Ism / Имя',
  phone: 'Telefon',
  faceLink: 'Yuz rasmi — Google Drive havolasi',
  passportLink: 'Pasport rasmi — Google Drive havolasi',
};

function driveId(url) {
  const s = String(url || '');
  return (
    s.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ||
    s.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
    ''
  );
}

function readTunnel() {
  if (fs.existsSync(TUNNEL_TXT)) {
    const m = fs
      .readFileSync(TUNNEL_TXT, 'utf8')
      .match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (m) return m[0];
  }
  return (
    process.env.PHOTO_SYNC_API_URL ||
    'https://response-breed-aggregate-carolina.trycloudflare.com'
  );
}

async function readRows() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const sh = wb.worksheets[0];
  const header = [];
  sh.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
    header[i] = String(c.value ?? '');
  });
  function cell(row, key) {
    const idx = header.findIndex((h) => h === H[key]);
    if (idx < 0) return '';
    let v = row.getCell(idx).value;
    if (v && typeof v === 'object') {
      if (v.hyperlink) v = v.hyperlink;
      else if (v.text) v = v.text;
      else v = String(v);
    }
    return v == null ? '' : String(v).trim();
  }
  const rows = [];
  for (let r = 2; r <= sh.rowCount; r++) {
    const row = sh.getRow(r);
    const lastName = cell(row, 'lastName');
    const firstName = cell(row, 'firstName');
    if (!lastName && !firstName) continue;
    rows.push({
      lastName,
      firstName,
      phone: cell(row, 'phone'),
      faceId: driveId(cell(row, 'faceLink')),
      passportId: driveId(cell(row, 'passportLink')),
    });
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(XLSX)) throw new Error(`xlsx yo‘q: ${XLSX}`);
  if (!fs.existsSync(RESULT)) throw new Error(`result yo‘q: ${RESULT}`);

  const rows = await readRows();
  const imp = JSON.parse(fs.readFileSync(RESULT, 'utf8'));
  const list = [];
  for (let i = 0; i < (imp.list || []).length; i++) {
    const item = imp.list[i];
    const row = rows[i];
    if (!item?.employeeId || !row) continue;
    list.push({
      employeeId: item.employeeId,
      lastName: row.lastName,
      firstName: row.firstName,
      phone: row.phone || undefined,
      faceId: row.faceId || undefined,
      passportId: row.passportId || undefined,
    });
  }

  const tunnel = readTunnel();
  const payloadJson = JSON.stringify(list, null, 2);
  const gs = `/**
 * HR HUB — yig'ilgan Ответы silkalaridan rasm (zip YO'Q)
 *
 * 1) https://script.google.com → Yangi loyiha
 * 2) Code.gs ni o'chirib SHU faylni paste qiling
 * 3) syncReadyPhotos → Выполнить
 * 4) Drive + UrlFetch ruxsatini bering
 * 5) Jurnal: DONE ok=…
 */
var API_URL = '${tunnel}';
var TENANT_CODE = 'demo';
var FORM_KEY = ''; // lab — API kalitsiz

var READY_PHOTOS = ${payloadJson};

function syncReadyPhotos() {
  var api = API_URL.replace(/\\/$/, '');
  var ok = 0;
  var miss = 0;
  var fail = 0;
  for (var i = 0; i < READY_PHOTOS.length; i++) {
    var row = READY_PHOTOS[i];
    var face = row.faceId ? blobById_(row.faceId) : null;
    var pass = row.passportId ? blobById_(row.passportId) : null;
    if (!face && !pass) {
      miss++;
      Logger.log('MISS ' + row.lastName + ' ' + row.firstName);
      continue;
    }
    var payload = {
      tenantCode: TENANT_CODE,
      source: 'apps_script',
      employeeId: row.employeeId,
      lastName: row.lastName,
      firstName: row.firstName,
      phone: row.phone || undefined,
    };
    if (face) {
      payload.facePhotoBase64 = face.b64;
      payload.facePhotoContentType = face.type;
    }
    if (pass) {
      payload.passportPhotoBase64 = pass.b64;
      payload.passportPhotoContentType = pass.type;
    }
    Object.keys(payload).forEach(function (k) {
      if (payload[k] === '' || payload[k] == null) delete payload[k];
    });
    var headers = { 'Content-Type': 'application/json' };
    if (FORM_KEY) headers['X-Employee-Form-Key'] = FORM_KEY;
    var att = UrlFetchApp.fetch(api + '/api/employee-form/attach-photos', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var ac = att.getResponseCode();
    if (ac >= 200 && ac < 300) {
      ok++;
      Logger.log(
        'OK ' +
          row.lastName +
          ' ' +
          row.firstName +
          ' ' +
          att.getContentText().slice(0, 100),
      );
    } else {
      fail++;
      Logger.log(
        'FAIL ' +
          row.lastName +
          ' HTTP ' +
          ac +
          ' ' +
          att.getContentText().slice(0, 180),
      );
    }
  }
  Logger.log('DONE ok=' + ok + ' miss=' + miss + ' fail=' + fail);
  return { ok: ok, miss: miss, fail: fail };
}

function blobById_(id) {
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    return {
      b64: Utilities.base64Encode(blob.getBytes()),
      type: blob.getContentType() || 'image/jpeg',
    };
  } catch (e) {
    Logger.log('Drive miss ' + id + ': ' + e);
    return null;
  }
}
`;

  fs.mkdirSync(path.dirname(OUT_GS), { recursive: true });
  fs.writeFileSync(OUT_GS, gs, 'utf8');
  fs.writeFileSync(OUT_JSON, JSON.stringify(list, null, 2), 'utf8');
  console.log(
    `OK ${list.length} xodim → ${OUT_GS}\nAPI_URL=${tunnel}\nface=${list.filter((x) => x.faceId).length} pass=${list.filter((x) => x.passportId).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
