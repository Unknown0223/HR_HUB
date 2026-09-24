/**
 * ALLAQACHON YIG‘ILGAN «Ответы» — Drive SILKALARIDAN rasm → lokal HR HUB
 * =====================================================
 * Zip yuklamasdan. Faqat shu fayl kerak.
 *
 * QADAMLAR:
 * 1) https://script.google.com → Yangi loyiha
 * 2) Shu butun kodni paste qiling (eski kodni o‘chirib)
 * 3) Quyidagi CONFIG ni tekshiring (tunnel URL yangilanganda yangilang)
 * 4) syncPhotosNow → Выполнить → ruxsatlarni bering (Drive + tashqi URL)
 * 5) Jurnal (Ctrl+Enter / View → Logs): DONE ok=…
 *
 * Tunnel: kompyuterda `node scripts/start-drive-photo-tunnel.js` ishlashi kerak.
 */

var CONFIG = {
  // Lokal API tunnel (cloudflared). O‘zgarsa yangilang.
  API_URL: 'https://response-breed-aggregate-carolina.trycloudflare.com',
  TENANT_CODE: 'demo',
  // Lab: bo‘sh. Railway da EMPLOYEE_FORM_INGEST_KEY bilan bir xil.
  FORM_KEY: '',
  // Sizning Ответы jadvali:
  // https://docs.google.com/spreadsheets/d/1q4fcQC94hQYnsF2ZRoQd3rIKjORARJl75wgGsovqdzU/...
  RESPONSES_SHEET_ID: '1q4fcQC94hQYnsF2ZRoQd3rIKjORARJl75wgGsovqdzU',
};

var COL = {
  lastName: 'Familiya / Фамилия',
  firstName: 'Ism / Имя',
  phone: 'Telefon',
  faceLink: 'Yuz rasmi — Google Drive havolasi',
  passportLink: 'Pasport rasmi — Google Drive havolasi',
};

/** ← Shu funksiyani Run qiling */
function syncPhotosNow() {
  var api = String(CONFIG.API_URL || '').replace(/\/$/, '');
  var key = String(CONFIG.FORM_KEY || '').trim();
  if (key.indexOf('CHANGE_ME') === 0) key = '';
  var tenant = CONFIG.TENANT_CODE || 'demo';
  if (!api) throw new Error('CONFIG.API_URL bo‘sh');

  var ss = SpreadsheetApp.openById(CONFIG.RESPONSES_SHEET_ID);
  var sh = ss.getSheets()[0];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log('Jadval bo‘sh');
    return { ok: 0 };
  }

  var headers = values[0].map(function (h) {
    return String(h || '').trim();
  });
  function col(title) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === title) return i;
    }
    return -1;
  }
  function cell(row, title) {
    var i = col(title);
    if (i < 0) return '';
    return String(row[i] == null ? '' : row[i]).trim();
  }

  var ok = 0;
  var miss = 0;
  var fail = 0;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var lastName = cell(row, COL.lastName);
    var firstName = cell(row, COL.firstName);
    if (!lastName || !firstName) continue;

    var face = blobFromDrive_(cell(row, COL.faceLink));
    var pass = blobFromDrive_(cell(row, COL.passportLink));
    if (!face && !pass) {
      miss++;
      Logger.log('MISS ' + (r + 1) + ' ' + lastName + ' ' + firstName);
      continue;
    }

    var payload = {
      tenantCode: tenant,
      source: 'apps_script',
      lastName: lastName,
      firstName: firstName,
    };
    var phone = cell(row, COL.phone);
    if (phone) payload.phone = phone;
    if (face) {
      payload.facePhotoBase64 = face.b64;
      payload.facePhotoContentType = face.type;
    }
    if (pass) {
      payload.passportPhotoBase64 = pass.b64;
      payload.passportPhotoContentType = pass.type;
    }

    var headersOut = {};
    if (key) headersOut['X-Employee-Form-Key'] = key;

    var res = UrlFetchApp.fetch(api + '/api/employee-form/attach-photos', {
      method: 'post',
      contentType: 'application/json',
      headers: headersOut,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code >= 200 && code < 300) {
      ok++;
      Logger.log('OK ' + lastName + ' ' + firstName + ' ' + body.slice(0, 100));
    } else {
      fail++;
      Logger.log('FAIL ' + lastName + ' HTTP ' + code + ' ' + body.slice(0, 200));
    }
  }

  Logger.log('DONE ok=' + ok + ' miss=' + miss + ' fail=' + fail);
  return { ok: ok, miss: miss, fail: fail };
}

function blobFromDrive_(urlOrId) {
  var s = String(urlOrId || '').trim();
  if (!s) return null;
  var id = s;
  var m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    return {
      b64: Utilities.base64Encode(blob.getBytes()),
      type: blob.getContentType() || 'image/jpeg',
    };
  } catch (e) {
    Logger.log('Drive ochilmadi id=' + id + ' ' + e);
    return null;
  }
}

/** Tunnel / API tirikmi — ixtiyoriy sinov */
function pingApi() {
  var api = String(CONFIG.API_URL || '').replace(/\/$/, '');
  var res = UrlFetchApp.fetch(api + '/api/health', { muteHttpExceptions: true });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
