/**
 * HR HUB — yangi xodim + RASM YUKLASH
 * =====================================================
 *
 * Google Form (Gmail) da skript «Fayl yuklash» yarata olmaydi.
 * Rasm yuklash uchun Web App:
 *
 * 1) Code.gs (+ ixtiyoriy SampleBlobs.gs, WebAppEmbed.gs) paste
 * 2) CONFIG ni to‘ldiring
 * 3) Funksiya: setupPhotoUploadApp → Выполнить
 * 4) Развернуть → Новое развертывание → Веб-приложение
 *    От имени: Меня · Доступ: Все
 * 5) URL ni kandidatlarga yuboring — u yerda 2 ta alohida rasm yuklanadi
 *
 * Railway: EMPLOYEE_FORM_INGEST_KEY = CONFIG.FORM_KEY
 */

var CONFIG = {
  API_URL: 'https://hr-hubapi-production.up.railway.app',
  FORM_KEY: 'CHANGE_ME_EMPLOYEE_FORM_INGEST_KEY',
  TENANT_CODE: 'demo',
  FORM_TITLE: 'HR HUB — Yangi xodim arizasi',
  FORM_DESCRIPTION:
    'Faqat kerakli maydonlar. Yuz rasmi Face ID terminal uchun; pasport rasmi — hujjat. ' +
    'Rasmlar: JPG yoki PNG, aniq, yorug‘.',
};

/**
 * ASOSIY: rasm yuklash Web App sozlash ko‘rsatmalari.
 * Shu funksiyani Run qiling, keyin Deploy qiling.
 */
function setupPhotoUploadApp() {
  saveConfigProps_();
  Logger.log('========== RASM YUKLASH (2 ta alohida fayl) ==========');
  Logger.log('4a Yuz rasmi — Face ID terminal');
  Logger.log('4b Pasport rasmi — hujjat');
  Logger.log('');
  Logger.log('1) Yuqorida: Развернуть / Deploy');
  Logger.log('2) Новое развертывание');
  Logger.log('3) Тип: Веб-приложение');
  Logger.log('4) Запуск от имени: Меня');
  Logger.log('5) У кого есть доступ: Все');
  Logger.log('6) Развернуть → Web App URL ni nusxa qiling');
  Logger.log('Kandidatlarga AYNAN SHU URL ni yuboring (Google Form emas).');
  Logger.log('CONFIG.FORM_KEY = Railway EMPLOYEE_FORM_INGEST_KEY');
  try {
    var u = ScriptApp.getService().getUrl();
    if (u) {
      Logger.log('');
      Logger.log('>>> APPLY URL (rasm yuklash ishlaydi): ' + u);
    } else {
      Logger.log('(Hali Deploy qilinmagan — URL Deploy dan keyin chiqadi)');
    }
  } catch (e) {
    Logger.log('(Hali Deploy qilinmagan)');
  }
  return 'OK — endi Deploy → Web app qiling';
}

/** Eski nom — setupPhotoUploadApp ga yo‘naltiradi */
function printWebAppDeployHelp() {
  return setupPhotoUploadApp();
}

/**
 * Web App ochilishi —
 *  ?action=photo&id=FILE_ID&key=FORM_KEY  → Drive rasm JSON (base64)
 *  aks holda → kandidat forma (HTML)
 */
function doGet(e) {
  saveConfigProps_();
  e = e || {};
  var p = e.parameter || {};
  if (String(p.action || '') === 'photo') {
    return serveDrivePhotoProxy_(p);
  }
  var html = '';
  try {
    html = HtmlService.createHtmlOutputFromFile('WebApp').getContent();
  } catch (e0) {
    try {
      html = hrHubWebAppHtml_();
    } catch (e1) {
      html =
        '<html><body><h1>WebApp.html yoki WebAppEmbed.gs qo‘shing</h1></body></html>';
    }
  }
  try {
    if (typeof hrHubFaceSampleBlob_ === 'function') {
      var fb = hrHubFaceSampleBlob_();
      html = html.replace(
        '</head>',
        '<script>window.SAMPLE_FACE="data:image/jpeg;base64,' +
          Utilities.base64Encode(fb.getBytes()) +
          '";</script></head>',
      );
    }
  } catch (e2) {
    /* ignore */
  }
  try {
    if (typeof hrHubPassportSampleBlob_ === 'function') {
      var pb = hrHubPassportSampleBlob_();
      html = html.replace(
        '</head>',
        '<script>window.SAMPLE_PASSPORT="data:image/jpeg;base64,' +
          Utilities.base64Encode(pb.getBytes()) +
          '";</script></head>',
      );
    }
  } catch (e3) {
    /* ignore */
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle(CONFIG.FORM_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Drive silkasidagi faylni egasi sifatida o‘qiydi → JSON { ok, base64, contentType }
 * HR HUB / lokal import shu proxy orqali yuklaydi (zip yuklamasdan).
 */
function serveDrivePhotoProxy_(p) {
  var props = PropertiesService.getScriptProperties();
  var expected = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY;
  var key = String(p.key || '').trim();
  if (!expected || key !== expected) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'unauthorized' }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
  var id = String(p.id || '').trim();
  if (!id) {
    var url = String(p.url || '').trim();
    var m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) id = m[1];
  }
  if (!id) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'id required' }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        id: id,
        name: file.getName(),
        contentType: blob.getContentType() || 'image/jpeg',
        base64: Utilities.base64Encode(blob.getBytes()),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: false,
        error: String(err),
        id: id,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Deploy qilingan Web App URL + photo proxy namuna. */
function printPhotoProxyHelp() {
  setupPhotoUploadApp();
  try {
    var u = ScriptApp.getService().getUrl();
    if (u) {
      Logger.log('');
      Logger.log('=== PHOTO PROXY (silka orqali rasm) ===');
      Logger.log(u + '?action=photo&id=DRIVE_FILE_ID&key=FORM_KEY');
      Logger.log('HR HUB .env:');
      Logger.log('GOOGLE_DRIVE_PHOTO_PROXY=' + u);
      Logger.log('EMPLOYEE_FORM_INGEST_KEY=<FORM_KEY bilan bir xil>');
    }
  } catch (e) {
    Logger.log('Avval Deploy → Web app qiling');
  }
}

/**
 * Sheets dagi Drive SILKALARIDAN rasmlarni o‘qiydi (zip yo‘q) → HR HUB attach-photos.
 * Xodimlar allaqachon import qilingan bo‘lsa shu funksiya yetarli.
 *
 * Run: syncPhotosFromDriveLinksOnly
 * CONFIG.API_URL = Railway YOKI lokal tunnel (https://….trycloudflare.com)
 * Lab: FORM_KEY bo‘sh / CHANGE_ME bo‘lishi mumkin (API kalitsiz ochiq bo‘lsa).
 */
function syncPhotosFromDriveLinksOnly() {
  saveConfigProps_();
  var props = PropertiesService.getScriptProperties();
  var api = (props.getProperty('API_URL') || CONFIG.API_URL).replace(/\/$/, '');
  var key = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY || '';
  var tenant = props.getProperty('TENANT_CODE') || CONFIG.TENANT_CODE;
  if (key.indexOf('CHANGE_ME') === 0) key = '';

  var ss = openResponsesSpreadsheet_();
  var sh = ss.getSheets()[0];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log('Jadval bo‘sh');
    return { ok: 0, miss: 0, fail: 0 };
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
    var v = row[i];
    if (v instanceof Date) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return String(v == null ? '' : v).trim();
  }

  var ok = 0;
  var miss = 0;
  var fail = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var lastName = cell(row, TITLES.lastName);
    var firstName = cell(row, TITLES.firstName);
    if (!lastName || !firstName) continue;

    var faceLink = cell(row, TITLES.facePhotoLink);
    var passLink = cell(row, TITLES.passportPhotoLink);
    var faceBlob = blobFromDriveUrl_(faceLink);
    var passBlob = blobFromDriveUrl_(passLink);
    if (!faceBlob && !passBlob) {
      miss++;
      Logger.log('MISS row ' + (r + 1) + ' ' + lastName + ' ' + firstName);
      continue;
    }

    var payload = {
      tenantCode: tenant,
      source: 'apps_script',
      lastName: lastName,
      firstName: firstName,
      phone: cell(row, TITLES.phone) || undefined,
    };
    if (faceBlob) {
      payload.facePhotoBase64 = faceBlob.b64;
      payload.facePhotoContentType = faceBlob.type;
    }
    if (passBlob) {
      payload.passportPhotoBase64 = passBlob.b64;
      payload.passportPhotoContentType = passBlob.type;
    }
    Object.keys(payload).forEach(function (k) {
      if (payload[k] === '' || payload[k] == null) delete payload[k];
    });

    var headersOut = { 'Content-Type': 'application/json' };
    if (key) headersOut['X-Employee-Form-Key'] = key;
    var att = UrlFetchApp.fetch(api + '/api/employee-form/attach-photos', {
      method: 'post',
      contentType: 'application/json',
      headers: headersOut,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var ac = att.getResponseCode();
    var body = att.getContentText();
    if (ac >= 200 && ac < 300) {
      ok++;
      Logger.log('OK row ' + (r + 1) + ' ' + lastName + ' ' + firstName + ' ' + body.slice(0, 120));
    } else {
      fail++;
      Logger.log('FAIL row ' + (r + 1) + ' HTTP ' + ac + ' ' + body.slice(0, 200));
    }
  }
  Logger.log('DONE ok=' + ok + ' miss=' + miss + ' fail=' + fail);
  return { ok: ok, miss: miss, fail: fail };
}

/**
 * Brauzer formasidan yuborish — 2 ta alohida rasm (yuz + pasport).
 */
function submitHrHubApplication(formObject) {
  saveConfigProps_();
  var props = PropertiesService.getScriptProperties();
  var api = (props.getProperty('API_URL') || CONFIG.API_URL).replace(/\/$/, '');
  var key = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY;
  var tenant = props.getProperty('TENANT_CODE') || CONFIG.TENANT_CODE;

  function s(v) {
    return v == null ? '' : String(v).trim();
  }

  var face = formObject.facePhoto;
  var pass = formObject.passportPhoto;
  if (!face || !face.getBytes || !face.getBytes().length) {
    return { ok: false, error: '4a: Yuz rasmini alohida yuklang (terminal Face ID).' };
  }
  if (!pass || !pass.getBytes || !pass.getBytes().length) {
    return { ok: false, error: '4b: Pasport rasmini alohida yuklang (hujjat).' };
  }
  // Ikkalasi ham rasm bo‘lishi kerak
  var faceCt = String(face.getContentType() || '');
  var passCt = String(pass.getContentType() || '');
  if (faceCt && faceCt.indexOf('image/') !== 0) {
    return { ok: false, error: 'Yuz fayli rasm bo‘lishi kerak (JPG/PNG).' };
  }
  if (passCt && passCt.indexOf('image/') !== 0) {
    return { ok: false, error: 'Pasport fayli rasm bo‘lishi kerak (JPG/PNG).' };
  }

  var lastName = s(formObject.lastName);
  var firstName = s(formObject.firstName);
  var phone = s(formObject.phone);
  if (!lastName || !firstName) {
    return { ok: false, error: 'Familiya va ism majburiy.' };
  }
  if (!phone) {
    return { ok: false, error: 'Telefon majburiy.' };
  }

  var payload = {
    tenantCode: tenant,
    source: 'apps_script',
    lastName: lastName,
    firstName: firstName,
    middleName: s(formObject.middleName),
    phone: phone,
    pinfl: s(formObject.pinfl),
    birthDate: s(formObject.birthDate),
    gender: s(formObject.gender),
    passportDocType: s(formObject.passportDocType),
    passportSeries: s(formObject.passportSeries),
    passportNumber: s(formObject.passportNumber),
    divisionCode: s(formObject.divisionCode),
    positionCode: s(formObject.positionCode),
    employmentType: s(formObject.employmentType),
    hiredAt: s(formObject.hiredAt),
    facePhotoBase64: Utilities.base64Encode(face.getBytes()),
    facePhotoContentType: face.getContentType() || 'image/jpeg',
    passportPhotoBase64: Utilities.base64Encode(pass.getBytes()),
    passportPhotoContentType: pass.getContentType() || 'image/jpeg',
  };

  Object.keys(payload).forEach(function (k) {
    if (payload[k] === '' || payload[k] == null) delete payload[k];
  });
  payload.tenantCode = tenant;
  payload.source = 'apps_script';

  var res = UrlFetchApp.fetch(api + '/api/employee-form/ingest', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Employee-Form-Key': key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  Logger.log('web ingest HTTP ' + code + ': ' + body);
  if (code < 200 || code >= 300) {
    return { ok: false, error: 'Server: HTTP ' + code + ' ' + body.slice(0, 240) };
  }
  try {
    var parsed = JSON.parse(body);
    return {
      ok: true,
      tabNumber: parsed.tabNumber || '',
      employeeId: parsed.employeeId || '',
    };
  } catch (e) {
    return { ok: true };
  }
}

function saveConfigProps_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('API_URL', String(CONFIG.API_URL || '').replace(/\/$/, ''));
  props.setProperty('FORM_KEY', CONFIG.FORM_KEY);
  props.setProperty('TENANT_CODE', CONFIG.TENANT_CODE);
}

var TITLES = {
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
  facePhoto: 'Yuz rasmi (Face ID terminal) / Фото лица',
  passportPhoto: 'Pasport / ID rasmi / Фото паспорта',
  facePhotoLink: 'Yuz rasmi — Google Drive havolasi',
  passportPhotoLink: 'Pasport rasmi — Google Drive havolasi',
};

/**
 * Yangi forma yaratadi (birinchi marta).
 */
function createHrHubEmployeeForm() {
  Logger.log(
    '★ RASM YUKLASH uchun Google Form emas — setupPhotoUploadApp + Deploy Web app.',
  );
  setupPhotoUploadApp();
  var form = FormApp.create(CONFIG.FORM_TITLE + ' (matn)');
  fillHrHubForm_(form);
  saveFormConfig_(form);
  ensureSubmitTrigger_(form);
  Logger.log('Google Form (rasmsiz/matn): ' + form.getPublishedUrl());
  return form.getPublishedUrl();
}

/**
 * Mavjud formani yangilaydi (URL o‘zgarmaydi).
 * CONFIG yoki Script Properties dagi FORM_ID bo‘yicha.
 */
function updateHrHubEmployeeForm() {
  var form = openExistingHrHubForm_();
  clearFormItems_(form);
  fillHrHubForm_(form);
  saveFormConfig_(form);
  ensureSubmitTrigger_(form);
  Logger.log('Updated. Form URL: ' + form.getPublishedUrl());
  Logger.log('Edit URL: ' + form.getEditUrl());
  return form.getPublishedUrl();
}

function openExistingHrHubForm_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FORM_ID');
  if (!id) {
    throw new Error(
      'FORM_ID yo‘q. Avval createHrHubEmployeeForm() ni ishga tushiring ' +
        'yoki Script Properties ga FORM_ID qo‘ying.',
    );
  }
  return FormApp.openById(id);
}

function clearFormItems_(form) {
  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) {
    form.deleteItem(items[i]);
  }
}

function fillHrHubForm_(form) {
  form.setTitle(CONFIG.FORM_TITLE);
  form.setDescription(CONFIG.FORM_DESCRIPTION);
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  // File upload requires signed-in Google account.
  try {
    form.setRequireLogin(true);
  } catch (e) {
    // Consumer accounts may ignore / differ.
  }

  form
    .addSectionHeaderItem()
    .setTitle('1. Shaxsiy ma’lumot')
    .setHelpText('Majburiy maydonlarni to‘ldiring.');

  form.addTextItem().setTitle(TITLES.lastName).setRequired(true);
  form.addTextItem().setTitle(TITLES.firstName).setRequired(true);
  form.addTextItem().setTitle(TITLES.middleName).setRequired(false);
  form.addTextItem().setTitle(TITLES.phone).setRequired(true);
  form.addTextItem().setTitle(TITLES.pinfl).setRequired(false);
  form.addDateItem().setTitle(TITLES.birthDate).setRequired(false);
  form
    .addMultipleChoiceItem()
    .setTitle(TITLES.gender)
    .setChoiceValues(['Erkak', 'Ayol'])
    .setRequired(false);

  form
    .addSectionHeaderItem()
    .setTitle('2. Hujjat')
    .setHelpText('Pasport yoki ID karta ma’lumotlari.');

  form
    .addMultipleChoiceItem()
    .setTitle(TITLES.passportDocType)
    .setChoiceValues(['Pasport', 'ID karta'])
    .setRequired(false);
  form.addTextItem().setTitle(TITLES.passportSeries).setRequired(false);
  form.addTextItem().setTitle(TITLES.passportNumber).setRequired(false);

  form
    .addSectionHeaderItem()
    .setTitle('3. Ish')
    .setHelpText('Bo‘lim va lavozim — nom yoki kod.');

  form.addTextItem().setTitle(TITLES.division).setRequired(false);
  form.addTextItem().setTitle(TITLES.position).setRequired(false);
  form
    .addMultipleChoiceItem()
    .setTitle(TITLES.employmentType)
    .setChoiceValues(['Shtat', 'GPH'])
    .setRequired(false);
  form.addDateItem().setTitle(TITLES.hiredAt).setRequired(false);

  form
    .addSectionHeaderItem()
    .setTitle('4. Rasmlar')
    .setHelpText(
      'Format: JPG yoki PNG. Hajm: odatda 200 KB–5 MB.\n' +
        'Yuz: oldindan, yuz markazda, yorug‘ xona, oddiy fon, ko‘zoynak/shapkasiz (mumkin bo‘lsa), ' +
        'bitta odam. Terminal Face ID shu rasm bilan tanidi.\n' +
        'Pasport: butun sahifa/karta kadrda, matn o‘qiladi, aks/blur yo‘q.',
    );

  // Namuna rasmlar (SampleBlobs.gs kerak)
  try {
    if (typeof hrHubFaceSampleBlob_ === 'function') {
      form
        .addImageItem()
        .setImage(hrHubFaceSampleBlob_())
        .setTitle('Namuna — yuz rasmi')
        .setHelpText('Shu kabi: yuz markazda, vertikal kadr.');
    }
  } catch (e1) {
    Logger.log('face sample skip: ' + e1);
  }
  try {
    if (typeof hrHubPassportSampleBlob_ === 'function') {
      form
        .addImageItem()
        .setImage(hrHubPassportSampleBlob_())
        .setTitle('Namuna — pasport rasmi')
        .setHelpText('Shu kabi: hujjat to‘liq, aniq.');
    }
  } catch (e2) {
    Logger.log('passport sample skip: ' + e2);
  }

  // Gmail (@gmail.com): Apps Script da addFileUploadItem yo‘q.
  // Workspace da ishlaydi; aks holda Drive havolasi maydonlari + qo‘lda File upload.
  addPhotoQuestions_(form);
}

/**
 * Fayl yuklash (Workspace) yoki Drive link (Gmail) maydonlari.
 */
function addPhotoQuestions_(form) {
  var canUpload =
    typeof form.addFileUploadItem === 'function' ||
    typeof form['addFileUploadItem'] === 'function';

  if (canUpload) {
    try {
      form
        .addSectionHeaderItem()
        .setTitle('4a. Yuz rasmi — Face ID terminal')
        .setHelpText('Alohida fayl. Terminal shu rasm bilan tanidi.');
      var faceUp = form.addFileUploadItem();
      faceUp
        .setTitle(TITLES.facePhoto)
        .setHelpText('JPG/PNG. Faqat yuz. Face ID terminal.')
        .setRequired(true);
      try {
        faceUp.setMaxFiles(1);
      } catch (e3) {
        /* ignore */
      }

      form
        .addSectionHeaderItem()
        .setTitle('4b. Pasport / ID rasmi')
        .setHelpText('Alohida fayl (yuzdan boshqa). Hujjat tahlili.');
      var passUp = form.addFileUploadItem();
      passUp
        .setTitle(TITLES.passportPhoto)
        .setHelpText('JPG/PNG. Faqat pasport/ID.')
        .setRequired(true);
      try {
        passUp.setMaxFiles(1);
      } catch (e4) {
        /* ignore */
      }

      PropertiesService.getScriptProperties().setProperty(
        'PHOTO_MODE',
        'file_upload',
      );
      Logger.log('PHOTO_MODE=file_upload — 4a yuz + 4b pasport alohida');
      return;
    } catch (eUp) {
      Logger.log('addFileUploadItem failed: ' + eUp);
    }
  }

  // Fallback — Gmail personal: ikkita ALOHIDA Drive-havola maydoni
  form
    .addSectionHeaderItem()
    .setTitle('4a. Yuz rasmi (Face ID terminal) — ALOHIDA')
    .setHelpText(
      'Terminal xodimni tanishi uchun. JPG/PNG. ' +
        'Drive ga yuklang → «Все, у кого есть ссылка» → havolani pastga yozing. ' +
        'Yoki Edit da shu o‘ringa «Загрузка файла» qo‘ying: ' +
        TITLES.facePhoto,
    );
  form
    .addTextItem()
    .setTitle(TITLES.facePhotoLink)
    .setHelpText('Faqat YUZ rasmi havolasi (pasport emas).')
    .setRequired(true);

  form
    .addSectionHeaderItem()
    .setTitle('4b. Pasport / ID rasmi — ALOHIDA')
    .setHelpText(
      'Hujjat tahlili uchun. Yuz rasmidan BOSHQA fayl. ' +
        'Yoki Edit da «Загрузка файла»: ' +
        TITLES.passportPhoto,
    );
  form
    .addTextItem()
    .setTitle(TITLES.passportPhotoLink)
    .setHelpText('Faqat PASPORT/ID rasmi havolasi (yuz emas).')
    .setRequired(true);

  PropertiesService.getScriptProperties().setProperty('PHOTO_MODE', 'drive_link');
  Logger.log('PHOTO_MODE=drive_link — 4a yuz + 4b pasport alohida');
  Logger.log('Rasmni to‘g‘ridan-to‘g‘ri yuklash: WebApp.html + Deploy Web app');
}

function saveFormConfig_(form) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('FORM_ID', form.getId());
  props.setProperty('API_URL', String(CONFIG.API_URL || '').replace(/\/$/, ''));
  props.setProperty('FORM_KEY', CONFIG.FORM_KEY);
  props.setProperty('TENANT_CODE', CONFIG.TENANT_CODE);
}

function ensureSubmitTrigger_(form) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onHrHubFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onHrHubFormSubmit').forForm(form).onFormSubmit().create();
}

/**
 * Form yuborilganda — platformaga yozadi (+ rasmlar base64).
 */
function onHrHubFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var api = props.getProperty('API_URL') || CONFIG.API_URL;
  var key = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY;
  var tenant = props.getProperty('TENANT_CODE') || CONFIG.TENANT_CODE;
  api = String(api || '').replace(/\/$/, '');

  var named = e && e.namedValues ? e.namedValues : {};
  function val(title) {
    var v = named[title];
    if (v == null) return '';
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return String(v[0] || '').trim();
    }
    return String(v || '').trim();
  }

  function ymd(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) {
      return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return '';
  }

  var photos = extractUploadPhotos_(e);

  var payload = {
    tenantCode: tenant,
    source: 'google_form',
    googleResponseId: e && e.response ? e.response.getId() : '',
    lastName: val(TITLES.lastName),
    firstName: val(TITLES.firstName),
    middleName: val(TITLES.middleName),
    phone: val(TITLES.phone),
    pinfl: val(TITLES.pinfl),
    birthDate: ymd(val(TITLES.birthDate)),
    gender: val(TITLES.gender),
    passportDocType: val(TITLES.passportDocType),
    passportSeries: val(TITLES.passportSeries),
    passportNumber: val(TITLES.passportNumber),
    divisionCode: val(TITLES.division),
    positionCode: val(TITLES.position),
    employmentType: val(TITLES.employmentType),
    hiredAt: ymd(val(TITLES.hiredAt)),
    facePhotoBase64: photos.faceBase64 || '',
    facePhotoContentType: photos.faceType || '',
    passportPhotoBase64: photos.passportBase64 || '',
    passportPhotoContentType: photos.passportType || '',
  };

  Object.keys(payload).forEach(function (k) {
    if (payload[k] === '' || payload[k] == null) delete payload[k];
  });
  payload.tenantCode = tenant;
  payload.source = 'google_form';

  var url = api + '/api/employee-form/ingest';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Employee-Form-Key': key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  Logger.log('ingest HTTP ' + code + ': ' + body);
  if (code < 200 || code >= 300) {
    throw new Error('HR HUB ingest failed: HTTP ' + code + ' ' + body);
  }
}

function extractUploadPhotos_(e) {
  var out = {
    faceBase64: '',
    faceType: '',
    passportBase64: '',
    passportType: '',
  };
  if (!e || !e.response) return out;

  // 1) File upload javoblari
  var items = e.response.getItemResponses();
  for (var i = 0; i < items.length; i++) {
    var ir = items[i];
    var title = ir.getItem().getTitle();
    var type = ir.getItem().getType();
    var isUpload =
      type === FormApp.ItemType.FILE_UPLOAD ||
      String(type) === 'FILE_UPLOAD';
    if (!isUpload) continue;
    var ids = ir.getResponse();
    if (!ids || !ids.length) continue;
    try {
      var file = DriveApp.getFileById(ids[0]);
      var blob = file.getBlob();
      var b64 = Utilities.base64Encode(blob.getBytes());
      var ct = blob.getContentType() || 'image/jpeg';
      if (title.indexOf('Yuz rasmi') === 0) {
        out.faceBase64 = b64;
        out.faceType = ct;
      } else if (
        title.indexOf('Pasport / ID rasmi') === 0 ||
        title.indexOf('Pasport rasmi') === 0
      ) {
        out.passportBase64 = b64;
        out.passportType = ct;
      }
    } catch (errFile) {
      Logger.log('file upload read: ' + errFile);
    }
  }

  // 2) Drive havolasi (Gmail fallback)
  var named = e.namedValues || {};
  function namedVal(title) {
    var v = named[title];
    if (v == null) return '';
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return String(v[0] || '').trim();
    }
    return String(v || '').trim();
  }
  if (!out.faceBase64) {
    var faceLink = namedVal(TITLES.facePhotoLink);
    var faceFromUrl = blobFromDriveUrl_(faceLink);
    if (faceFromUrl) {
      out.faceBase64 = faceFromUrl.b64;
      out.faceType = faceFromUrl.type;
    }
  }
  if (!out.passportBase64) {
    var passLink = namedVal(TITLES.passportPhotoLink);
    var passFromUrl = blobFromDriveUrl_(passLink);
    if (passFromUrl) {
      out.passportBase64 = passFromUrl.b64;
      out.passportType = passFromUrl.type;
    }
  }
  return out;
}

/** Drive "anyone with link" URL yoki fileId → base64 */
function blobFromDriveUrl_(urlOrId) {
  var s = String(urlOrId || '').trim();
  if (!s) return null;
  var id = s;
  var m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  else {
    var m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) id = m2[1];
  }
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    return {
      b64: Utilities.base64Encode(blob.getBytes()),
      type: blob.getContentType() || 'image/jpeg',
    };
  } catch (e1) {
    try {
      // Public link fetch (if shared)
      var res = UrlFetchApp.fetch(s, { muteHttpExceptions: true, followRedirects: true });
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
        var blob2 = res.getBlob();
        return {
          b64: Utilities.base64Encode(blob2.getBytes()),
          type: blob2.getContentType() || 'image/jpeg',
        };
      }
    } catch (e2) {
      Logger.log('blobFromDriveUrl_: ' + e1 + ' / ' + e2);
    }
  }
  return null;
}

/** Qo'lda sinash (rasmsiz). */
function testIngestPing() {
  var props = PropertiesService.getScriptProperties();
  var api = (props.getProperty('API_URL') || CONFIG.API_URL).replace(/\/$/, '');
  var key = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY;
  var tenant = props.getProperty('TENANT_CODE') || CONFIG.TENANT_CODE;
  var res = UrlFetchApp.fetch(api + '/api/employee-form/ingest', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Employee-Form-Key': key },
    payload: JSON.stringify({
      tenantCode: tenant,
      lastName: 'Testov',
      firstName: 'Test',
      phone: '+998901112233',
      source: 'apps_script',
      note: 'manual testIngestPing',
    }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}

/**
 * Javoblar jadvalidagi (Ответы) BARCHA qatorlarni HR HUB ga yuboradi + Drive rasmlar.
 * DriveApp egasi sifatida ishlaydi — yopiq fayllar ham o‘qiladi.
 *
 * Run: syncAllResponsesSheetToHrHub
 * Ixtiyoriy: Script Properties RESPONSES_SHEET_ID = jadval ID
 */
function syncAllResponsesSheetToHrHub() {
  saveConfigProps_();
  var props = PropertiesService.getScriptProperties();
  var api = (props.getProperty('API_URL') || CONFIG.API_URL).replace(/\/$/, '');
  var key = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY;
  var tenant = props.getProperty('TENANT_CODE') || CONFIG.TENANT_CODE;
  if (key.indexOf('CHANGE_ME') === 0) key = '';

  var ss = openResponsesSpreadsheet_();
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
    var v = row[i];
    if (v instanceof Date) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return String(v == null ? '' : v).trim();
  }

  var ok = 0;
  var photos = 0;
  var fail = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var lastName = cell(row, TITLES.lastName);
    var firstName = cell(row, TITLES.firstName);
    if (!lastName || !firstName) continue;

    var faceLink = cell(row, TITLES.facePhotoLink);
    var passLink = cell(row, TITLES.passportPhotoLink);
    var faceBlob = blobFromDriveUrl_(faceLink);
    var passBlob = blobFromDriveUrl_(passLink);

    var payload = {
      tenantCode: tenant,
      source: 'apps_script',
      lastName: lastName,
      firstName: firstName,
      middleName: cell(row, TITLES.middleName) || undefined,
      phone: cell(row, TITLES.phone) || undefined,
      pinfl: cell(row, TITLES.pinfl) || undefined,
      birthDate: cell(row, TITLES.birthDate) || undefined,
      gender: cell(row, TITLES.gender) || undefined,
      passportDocType: cell(row, TITLES.passportDocType) || undefined,
      passportSeries: cell(row, TITLES.passportSeries) || undefined,
      passportNumber: cell(row, TITLES.passportNumber) || undefined,
      divisionCode: cell(row, TITLES.division) || undefined,
      divisionName: cell(row, TITLES.division) || undefined,
      positionCode: cell(row, TITLES.position) || undefined,
      positionName: cell(row, TITLES.position) || undefined,
      employmentType: cell(row, TITLES.employmentType) || undefined,
      hiredAt: cell(row, TITLES.hiredAt) || undefined,
      note: 'syncAllResponsesSheetToHrHub row=' + (r + 1),
    };
    if (faceBlob) {
      payload.facePhotoBase64 = faceBlob.b64;
      payload.facePhotoContentType = faceBlob.type;
    } else if (faceLink) {
      payload.facePhotoUrl = faceLink;
    }
    if (passBlob) {
      payload.passportPhotoBase64 = passBlob.b64;
      payload.passportPhotoContentType = passBlob.type;
    } else if (passLink) {
      payload.passportPhotoUrl = passLink;
    }
    Object.keys(payload).forEach(function (k) {
      if (payload[k] === '' || payload[k] == null) delete payload[k];
    });

    var ingestHeaders = {};
    if (key) ingestHeaders['X-Employee-Form-Key'] = key;
    var ingest = UrlFetchApp.fetch(api + '/api/employee-form/ingest', {
      method: 'post',
      contentType: 'application/json',
      headers: ingestHeaders,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var code = ingest.getResponseCode();
    var body = ingest.getContentText();
    if (code >= 200 && code < 300) {
      ok++;
      if (faceBlob || passBlob) photos++;
      Logger.log('OK ingest row ' + (r + 1) + ' ' + lastName + ' ' + firstName);
      continue;
    }
    // Already exists → attach photos only
    if (code === 409 || String(body).indexOf('already exists') >= 0 || code === 400) {
      var attachPayload = {
        tenantCode: tenant,
        source: 'apps_script',
        lastName: lastName,
        firstName: firstName,
        phone: payload.phone,
        facePhotoBase64: payload.facePhotoBase64,
        facePhotoContentType: payload.facePhotoContentType,
        passportPhotoBase64: payload.passportPhotoBase64,
        passportPhotoContentType: payload.passportPhotoContentType,
        facePhotoUrl: payload.facePhotoUrl,
        passportPhotoUrl: payload.passportPhotoUrl,
      };
      Object.keys(attachPayload).forEach(function (k) {
        if (attachPayload[k] === '' || attachPayload[k] == null) delete attachPayload[k];
      });
      var attachHeaders = {};
      if (key) attachHeaders['X-Employee-Form-Key'] = key;
      var att = UrlFetchApp.fetch(api + '/api/employee-form/attach-photos', {
        method: 'post',
        contentType: 'application/json',
        headers: attachHeaders,
        payload: JSON.stringify(attachPayload),
        muteHttpExceptions: true,
      });
      var ac = att.getResponseCode();
      Logger.log(
        'attach row ' + (r + 1) + ' HTTP ' + ac + ' ' + att.getContentText().slice(0, 180),
      );
      if (ac >= 200 && ac < 300) {
        ok++;
        photos++;
      } else {
        fail++;
      }
      continue;
    }
    fail++;
    Logger.log('FAIL row ' + (r + 1) + ' HTTP ' + code + ' ' + body.slice(0, 200));
  }
  Logger.log('DONE ok=' + ok + ' photos=' + photos + ' fail=' + fail);
  return { ok: ok, photos: photos, fail: fail };
}

function openResponsesSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var sid = props.getProperty('RESPONSES_SHEET_ID');
  if (sid) return SpreadsheetApp.openById(sid);
  // Formga bog‘langan javoblar jadvali
  try {
    var form = openExistingHrHubForm_();
    var dest = form.getDestinationId();
    if (dest) return SpreadsheetApp.openById(dest);
  } catch (e) {
    Logger.log('form destination: ' + e);
  }
  // Nom bo‘yicha qidirish
  var files = DriveApp.getFilesByName(CONFIG.FORM_TITLE + ' (Ответы)');
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  files = DriveApp.getFilesByName('HR HUB – Yangi xodim arizasi (Ответы)');
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  throw new Error(
    'Javoblar jadvali topilmadi. Script Properties ga RESPONSES_SHEET_ID qo‘ying ' +
      '(Sheets URL dagi /d/XXXX/ id).',
  );
}

/**
 * Rasm: Drive dagi «Yuz rasmi …» va «Pasport rasmi …» papkalaridan
 * fayl nomidagi FIO bo‘yicha topib, mavjud xodimlarga biriktiradi.
 *
 * Run: syncPhotosFromYuzPasportFolders
 * CONFIG.API_URL = Railway (localhost Google dan ochilmaydi!)
 */
function syncPhotosFromYuzPasportFolders() {
  saveConfigProps_();
  var props = PropertiesService.getScriptProperties();
  var api = (props.getProperty('API_URL') || CONFIG.API_URL).replace(/\/$/, '');
  var key = props.getProperty('FORM_KEY') || CONFIG.FORM_KEY;
  var tenant = props.getProperty('TENANT_CODE') || CONFIG.TENANT_CODE;
  if (!key || key.indexOf('CHANGE_ME') === 0) {
    throw new Error('CONFIG.FORM_KEY ni Railway EMPLOYEE_FORM_INGEST_KEY ga teng qiling');
  }

  var faceFolder = findPhotoFolder_('Yuz rasmi');
  var passFolder = findPhotoFolder_('Pasport rasmi');
  if (!faceFolder && !passFolder) {
    throw new Error(
      '«Yuz rasmi» / «Pasport rasmi» papkalari topilmadi. Drive da form upload papkalarini tekshiring.',
    );
  }
  Logger.log('Face folder: ' + (faceFolder ? faceFolder.getName() : '—'));
  Logger.log('Passport folder: ' + (passFolder ? passFolder.getName() : '—'));

  var faceFiles = indexPhotoFiles_(faceFolder);
  var passFiles = indexPhotoFiles_(passFolder);
  Logger.log('Face files=' + faceFiles.length + ' Passport files=' + passFiles.length);

  var ss = openResponsesSpreadsheet_();
  var sh = ss.getSheets()[0];
  var values = sh.getDataRange().getValues();
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
  var fail = 0;
  var miss = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var lastName = cell(row, TITLES.lastName);
    var firstName = cell(row, TITLES.firstName);
    if (!lastName || !firstName) continue;

    var faceBlob = matchPhotoBlob_(faceFiles, lastName, firstName);
    var passBlob = matchPhotoBlob_(passFiles, lastName, firstName);
    // fallback: sheet Drive links
    if (!faceBlob) faceBlob = blobFromDriveUrl_(cell(row, TITLES.facePhotoLink));
    if (!passBlob) passBlob = blobFromDriveUrl_(cell(row, TITLES.passportPhotoLink));

    if (!faceBlob && !passBlob) {
      miss++;
      Logger.log('NO PHOTO ' + lastName + ' ' + firstName);
      continue;
    }

    var payload = {
      tenantCode: tenant,
      source: 'apps_script',
      lastName: lastName,
      firstName: firstName,
      phone: cell(row, TITLES.phone) || undefined,
    };
    if (faceBlob) {
      payload.facePhotoBase64 = faceBlob.b64;
      payload.facePhotoContentType = faceBlob.type;
    }
    if (passBlob) {
      payload.passportPhotoBase64 = passBlob.b64;
      payload.passportPhotoContentType = passBlob.type;
    }
    Object.keys(payload).forEach(function (k) {
      if (payload[k] === '' || payload[k] == null) delete payload[k];
    });

    var att = UrlFetchApp.fetch(api + '/api/employee-form/attach-photos', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Employee-Form-Key': key },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var ac = att.getResponseCode();
    var body = att.getContentText();
    if (ac >= 200 && ac < 300) {
      ok++;
      Logger.log(
        'PHOTO OK ' +
          lastName +
          ' ' +
          firstName +
          ' face=' +
          !!faceBlob +
          ' pass=' +
          !!passBlob,
      );
    } else {
      fail++;
      Logger.log('PHOTO FAIL ' + lastName + ' HTTP ' + ac + ' ' + body.slice(0, 160));
    }
  }
  Logger.log('DONE photos ok=' + ok + ' fail=' + fail + ' miss=' + miss);
  return { ok: ok, fail: fail, miss: miss };
}

function findPhotoFolder_(needle) {
  var it = DriveApp.getFolders();
  var n = String(needle || '').toLowerCase();
  while (it.hasNext()) {
    var f = it.next();
    var name = String(f.getName() || '').toLowerCase();
    if (name.indexOf(n) >= 0) return f;
  }
  // nested (form creates folders under a parent)
  var parents = DriveApp.getFoldersByName('HR HUB – Yangi xodim arizasi');
  while (parents.hasNext()) {
    var p = parents.next();
    var sub = p.getFolders();
    while (sub.hasNext()) {
      var s = sub.next();
      if (String(s.getName() || '').toLowerCase().indexOf(n) >= 0) return s;
    }
  }
  return null;
}

function indexPhotoFiles_(folder) {
  var out = [];
  if (!folder) return out;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    var mime = file.getMimeType() || '';
    if (mime.indexOf('image/') !== 0 && !/\.(jpe?g|png|webp|gif)$/i.test(name)) {
      continue;
    }
    out.push({
      name: name,
      nameLow: String(name).toLowerCase(),
      file: file,
    });
  }
  return out;
}

function matchPhotoBlob_(index, lastName, firstName) {
  if (!index || !index.length) return null;
  var ln = String(lastName || '').toLowerCase().trim();
  var fn = String(firstName || '').toLowerCase().trim();
  if (!ln && !fn) return null;
  var best = null;
  for (var i = 0; i < index.length; i++) {
    var n = index[i].nameLow;
    var score = 0;
    if (ln && n.indexOf(ln) >= 0) score += 2;
    if (fn && n.indexOf(fn) >= 0) score += 2;
    // partial (first 4 chars) for typos
    if (ln && ln.length >= 4 && n.indexOf(ln.slice(0, 4)) >= 0) score += 1;
    if (fn && fn.length >= 4 && n.indexOf(fn.slice(0, 4)) >= 0) score += 1;
    if (score >= 3 && (!best || score > best.score)) {
      best = { score: score, file: index[i].file };
    }
  }
  if (!best) return null;
  try {
    var blob = best.file.getBlob();
    return {
      b64: Utilities.base64Encode(blob.getBytes()),
      type: blob.getContentType() || 'image/jpeg',
    };
  } catch (e) {
    Logger.log('matchPhotoBlob_: ' + e);
    return null;
  }
}
