/**
 * === PASTE: eski Code.gs OXIRIGA qo‘shing (qolgan kodni o‘chirmang) ===
 *
 * 1) CONFIG ichida faqat API_URL ni o‘zgartiring:
 *    API_URL: 'https://response-breed-aggregate-carolina.trycloudflare.com',
 *    FORM_KEY: '',   // lab — lokalda kalit yo‘q
 *
 * 2) Shu blokni Code.gs oxiriga paste
 * 3) Funksiya: syncPhotosNow → Выполнить
 */

var RESPONSES_SHEET_ID = '1q4fcQC94hQYnsF2ZRoQd3rIKjORARJl75wgGsovqdzU';

/** Yig‘ilgan Ответы → Drive silka → lokal HR HUB rasmlari */
function syncPhotosNow() {
  saveConfigProps_();
  var props = PropertiesService.getScriptProperties();
  var api = (props.getProperty('API_URL') || CONFIG.API_URL).replace(/\/$/, '');
  var key = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY || '';
  var tenant = props.getProperty('TENANT_CODE') || CONFIG.TENANT_CODE || 'demo';
  if (String(key).indexOf('CHANGE_ME') === 0) key = '';

  var ss = SpreadsheetApp.openById(RESPONSES_SHEET_ID);
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
    var lastName = cell(row, TITLES.lastName);
    var firstName = cell(row, TITLES.firstName);
    if (!lastName || !firstName) continue;

    var face = blobFromDriveUrl_(cell(row, TITLES.facePhotoLink));
    var pass = blobFromDriveUrl_(cell(row, TITLES.passportPhotoLink));
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
    var phone = cell(row, TITLES.phone);
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
      Logger.log('OK ' + lastName + ' ' + firstName);
    } else {
      fail++;
      Logger.log('FAIL ' + lastName + ' HTTP ' + code + ' ' + body.slice(0, 180));
    }
  }

  Logger.log('DONE ok=' + ok + ' miss=' + miss + ' fail=' + fail);
  return { ok: ok, miss: miss, fail: fail };
}

/** Tunnel tirikmi */
function pingLocalApi() {
  saveConfigProps_();
  var api = (PropertiesService.getScriptProperties().getProperty('API_URL') || CONFIG.API_URL).replace(/\/$/, '');
  var res = UrlFetchApp.fetch(api + '/api/health', { muteHttpExceptions: true });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
