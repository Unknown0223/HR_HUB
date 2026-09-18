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
 * Web App ochilishi — rasm yuklash formasi.
 */
function doGet() {
  saveConfigProps_();
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
