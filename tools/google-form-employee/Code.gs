/**
 * HR HUB — Google Form: yangi xodim (hodim) qo'shish
 * =====================================================
 *
 * 1) Google Drive da: New → Google Apps Script
 * 2) Shu fayl kodini paste qiling
 * 3) CONFIG ni to'ldiring (API_URL, FORM_KEY, TENANT_CODE)
 * 4) createHrHubEmployeeForm() ni bir marta Run qiling
 *    → Form yaratiladi, onSubmit trigger ulangadi
 * 5) Form linkini odamlarga yuboring
 *
 * 5) Har bir javob → POST /api/employee-form/ingest → HR HUB bazaga xodim.
 *
 * Railway env: EMPLOYEE_FORM_INGEST_KEY=<FORM_KEY bilan bir xil>
 */

var CONFIG = {
  // Masalan: https://hr-hubapi-production.up.railway.app
  API_URL: 'https://hr-hubapi-production.up.railway.app',
  FORM_KEY: 'CHANGE_ME_EMPLOYEE_FORM_INGEST_KEY',
  TENANT_CODE: 'demo',
  FORM_TITLE: 'HR HUB — Yangi xodim arizasi',
  FORM_DESCRIPTION:
    "Ma'lumotlar to'g'ridan-to'g'ri HR HUB platformasiga yoziladi. Majburiy maydonlarni to'ldiring.",
};

/**
 * Bir marta ishga tushiring: form + trigger yaratadi.
 */
function createHrHubEmployeeForm() {
  var form = FormApp.create(CONFIG.FORM_TITLE);
  form.setDescription(CONFIG.FORM_DESCRIPTION);
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);

  form.addTextItem().setTitle('Familiya / Фамилия').setRequired(true);
  form.addTextItem().setTitle('Ism / Имя').setRequired(true);
  form.addTextItem().setTitle('Otasi ismi / Отчество').setRequired(false);
  form.addTextItem().setTitle('Telefon').setRequired(false);
  form.addTextItem().setTitle('Email').setRequired(false);
  form.addTextItem().setTitle('Telegram (@username)').setRequired(false);
  form.addTextItem().setTitle('JSHSHIR (PINFL) / ПИНФЛ').setRequired(false);
  form.addDateItem().setTitle("Tug'ilgan sana / Дата рождения").setRequired(false);
  form
    .addMultipleChoiceItem()
    .setTitle('Jins / Пол')
    .setChoiceValues(['Erkak', 'Ayol'])
    .setRequired(false);
  form.addTextItem().setTitle('Fuqarolik / Гражданство').setRequired(false);
  form
    .addMultipleChoiceItem()
    .setTitle('Hujjat turi / Тип документа')
    .setChoiceValues(['Pasport', 'ID karta'])
    .setRequired(false);
  form.addTextItem().setTitle('Pasport seriyasi / Серия').setRequired(false);
  form.addTextItem().setTitle('Pasport raqami / Номер').setRequired(false);
  form.addTextItem().setTitle('Kim bergan / Кем выдан').setRequired(false);
  form.addDateItem().setTitle('Berilgan sana / Дата выдачи').setRequired(false);
  form.addDateItem().setTitle('Amal qilish muddati / Срок').setRequired(false);
  form
    .addTextItem()
    .setTitle("Bo'lim kodi yoki nomi / Подразделение")
    .setRequired(false);
  form
    .addTextItem()
    .setTitle('Lavozim kodi yoki nomi / Должность')
    .setRequired(false);
  form
    .addMultipleChoiceItem()
    .setTitle('Ish turi / Тип занятости')
    .setChoiceValues(['Shtat', 'GPH'])
    .setRequired(false);
  form.addDateItem().setTitle('Qabul sanasi / Дата приёма').setRequired(false);
  form
    .addTextItem()
    .setTitle('Tabel raqami (bo‘sh = avto) / Таб. номер')
    .setRequired(false);
  form.addTextItem().setTitle('Face ID / terminal PIN').setRequired(false);
  form
    .addParagraphTextItem()
    .setTitle('Yashash manzili / Адрес')
    .setRequired(false);
  form.addParagraphTextItem().setTitle('Izoh / Примечание').setRequired(false);

  // Persist form id for the installable trigger.
  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());
  PropertiesService.getScriptProperties().setProperty(
    'API_URL',
    String(CONFIG.API_URL || '').replace(/\/$/, ''),
  );
  PropertiesService.getScriptProperties().setProperty('FORM_KEY', CONFIG.FORM_KEY);
  PropertiesService.getScriptProperties().setProperty(
    'TENANT_CODE',
    CONFIG.TENANT_CODE,
  );

  ScriptApp.newTrigger('onHrHubFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log('Form URL: ' + form.getPublishedUrl());
  Logger.log('Edit URL: ' + form.getEditUrl());
  return form.getPublishedUrl();
}

/**
 * Form yuborilganda — platformaga yozadi.
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
    // Google may send dd.MM.yyyy or yyyy-MM-dd
    var m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) {
      return (
        m[3] +
        '-' +
        ('0' + m[2]).slice(-2) +
        '-' +
        ('0' + m[1]).slice(-2)
      );
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return '';
  }

  var payload = {
    tenantCode: tenant,
    source: 'google_form',
    googleResponseId: e && e.response ? e.response.getId() : '',
    lastName: val('Familiya / Фамилия'),
    firstName: val('Ism / Имя'),
    middleName: val('Otasi ismi / Отчество'),
    phone: val('Telefon'),
    email: val('Email'),
    telegramUsername: val('Telegram (@username)'),
    pinfl: val('JSHSHIR (PINFL) / ПИНФЛ'),
    birthDate: ymd(val("Tug'ilgan sana / Дата рождения")),
    gender: val('Jins / Пол'),
    nationality: val('Fuqarolik / Гражданство'),
    passportDocType: val('Hujjat turi / Тип документа'),
    passportSeries: val('Pasport seriyasi / Серия'),
    passportNumber: val('Pasport raqami / Номер'),
    passportIssuer: val('Kim bergan / Кем выдан'),
    passportIssuedAt: ymd(val('Berilgan sana / Дата выдачи')),
    passportExpiresAt: ymd(val('Amal qilish muddati / Срок')),
    divisionCode: val("Bo'lim kodi yoki nomi / Подразделение"),
    positionCode: val('Lavozim kodi yoki nomi / Должность'),
    employmentType: val('Ish turi / Тип занятости'),
    hiredAt: ymd(val('Qabul sanasi / Дата приёма')),
    tabNumber: val('Tabel raqami (bo‘sh = avto) / Таб. номер'),
    externalId: val('Face ID / terminal PIN'),
    address: val('Yashash manzili / Адрес'),
    note: val('Izoh / Примечание'),
  };

  // Drop empty strings so class-validator optional dates don't fail.
  Object.keys(payload).forEach(function (k) {
    if (payload[k] === '' || payload[k] == null) delete payload[k];
  });
  payload.tenantCode = tenant;
  payload.source = 'google_form';

  var url = api + '/api/employee-form/ingest';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Employee-Form-Key': key,
    },
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

/** Qo'lda sinash (oxirgi form javobisiz). */
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
      source: 'apps_script',
      note: 'manual testIngestPing',
    }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
