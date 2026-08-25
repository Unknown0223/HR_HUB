/**
 * One-shot: replace leftover Uzbek UI strings with Russian (Verifix parity).
 * Uses word-boundary-ish matching for short tokens.
 * Run from hr-hub root: node scripts/ru-ify-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/web/src');

/** Long / unique phrases first (literal). */
const LITERAL = [
  ["Tenant topilmadi — qayta login qiling", 'Tenant не найден — войдите снова'],
  ['Export CSV', 'Экспорт CSV'],
  ['Kunlik', 'По дням'],
  ['GW ga qayta bog‘lash', 'Переподключить GW'],
  ['So‘rov yaratish', 'Создать запрос'],
  ['Kod (ixtiyoriy)', 'Код (необязательно)'],
  ['Grafik yaratish', 'Создать график'],
  ['QR yaratish', 'Создать QR'],
  ['QR kod', 'QR-код'],
  ['Yo‘nalish', 'Направление'],
  ['Mening joylashuvim', 'Моё местоположение'],
  ['Hal qilish', 'Решить'],
  ['← Oldingi', '← Назад'],
  ['Keyingi →', 'Вперёд →'],
  ['Sahifa ', 'Стр. '],
  [' · jami ', ' · всего '],
  ['Kirish QR', 'Вход QR'],
  ['Smena A 08–17', 'Смена A 08–17'],
  ['Foto yuklandi — terminalga sync…', 'Фото загружено — синхронизация с терминалом…'],
  ['Foto yuklandi, sync xato: ', 'Фото загружено, ошибка sync: '],
  ['Foto yuklandi, sync xato', 'Фото загружено, ошибка sync'],
  ['Face ID saqlandi', 'Face ID сохранён'],
  ['Upload xato', 'Ошибка загрузки'],
  ['Sync xato', 'Ошибка sync'],
  [' muvaffaqiyatli, ', ' успешно, '],
  [' xato`', ' ошибок`'],
  [' xato)', ' ошибок)'],
  [', ${fail} xato', ', ${fail} ошибок'],
  ['Bo‘lim:', 'Подразделение:'],
  ['Lavozim:', 'Должность:'],
  ['Ishga kirgan:', 'Дата приёма:'],
  ['Foto hali yuklanmagan', 'Фото ещё не загружено'],
  ['Foto yuklash', 'Загрузить фото'],
  ['Sync uchun chapdagi Face ID ni saqlang.', 'Для sync сохраните Face ID слева.'],
  ['Terminalga sync', 'Синхронизировать с терминалом'],
  ['← Ro‘yxat', '← К списку'],
  ['yo‘q', 'нет'],
  ['Jins:', 'Пол:'],
  ['Tug‘ilgan:', 'Дата рождения:'],
  ['Hujjat yo‘q', 'Нет документов'],
  ['Yo‘q', 'Нет'],
  ['Ishga kirgan sana', 'Дата приёма'],
  ['Barchasini tanlash', 'Выбрать все'],
  ['Tanlash ', 'Выбрать '],
  ['Bo‘lim topilmadi.', 'Подразделение не найдено.'],
  ['Lavozim topilmadi.', 'Должность не найдена.'],
  ['(root)', '(корень)'],
  ['Kechikish jarimasi (so‘m/min)', 'Штраф за опоздание (сум/мин)'],
  ['Yo‘qlik jarimasi', 'Штраф за отсутствие'],
  ['Default oylik', 'Оклад по умолчанию'],
  ['Davr ochish', 'Открыть период'],
  ['Faol xodimlar', 'Активные сотрудники'],
  ['Bugungi belgilar', 'Отметки сегодня'],
  ['Kutilayotgan so‘rovlar', 'Ожидающие заявки'],
  ['Muammoli belgilar', 'Проблемные отметки'],
  ['Ish haqi davrlari', 'Расчётные периоды'],
  ['Jami ФОТ', 'Итого ФОТ'],
  ['Jami min', 'Всего мин'],
  ['Tur: ', 'Тип: '],
  ['Bo‘lim: ', 'Подразделение: '],
  ["Noma’lum hisobot", 'Неизвестный отчёт'],
  ['Yangi yozuv', 'Новая запись'],
  ['Tahrirlash', 'Редактирование'],
  ['Excel eksport xatosi', 'Ошибка экспорта Excel'],
  ['To‘liq katalog hisobot · ', 'Каталог · отчёт · '],
  [' qator', ' строк'],
  [
    'Xodimlar, davomat va Face ID — bitta multi-tenant platformada.',
    'Сотрудники, посещения и Face ID — единая multi-tenant платформа.',
  ],
  ['Davomat → Tabel', 'Посещения → Табель'],
  ['Tenant admin yoki platform akkaunti bilan kiring.', 'Войдите как tenant admin или platform.'],
  ['Kutilmoqda…', 'Вход…'],
  ['Grafik:', 'График:'],
  ['Biriktirish', 'Назначить'],
  ['Yuborish', 'Отправить'],
  ['Sarlavha', 'Заголовок'],
  ['Yorliq', 'Метка'],
  ['Manzil', 'Адрес'],
  ['Boshlanish', 'Начало'],
  ['Tugash', 'Окончание'],
  ['Yangilash', 'Обновить'],
  ['Yopish', 'Отмена'],
  ['Jarimalar', 'Штрафы'],
  ['Metrika', 'Метрика'],
  ['Qiymat', 'Значение'],
  ['Kunlar', 'Дни'],
  ['Manba', 'Источник'],
  ['Vaqt', 'Время'],
  ['Xato', 'Ошибка'],
  ['Tahrir', 'Изменить'],
];

/** Short label tokens — only when bounded by non-letters (JSX text / attributes). */
const BOUNDED = [
  ['Xodim', 'Сотрудник'],
  ['Izoh', 'Примечание'],
  ['Summa', 'Сумма'],
  ['Davr', 'Период'],
  ['Yil', 'Год'],
  ['Oy', 'Месяц'],
  ['Kod', 'Код'],
  ['Nom', 'Наименование'],
  ['Tur', 'Тип'],
  ['Dan', 'С'],
  ['Gacha', 'По'],
  ['Sana', 'Дата'],
  ['Parol', 'Пароль'],
  ['Kirish', 'Вход'],
  ['Shared', 'Общие'],
  ['Parent', 'Родитель'],
  ['Bo‘lim', 'Подразделение'],
];

function replaceLiteral(text, from, to) {
  if (!text.includes(from)) return { text, n: 0 };
  let n = 0;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(from, i);
    if (idx === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, idx) + to;
    i = idx + from.length;
    n++;
  }
  return { text: out, n };
}

function isLetter(ch) {
  return /[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳʼ'‘’`]/.test(ch);
}

function replaceBounded(text, from, to) {
  let n = 0;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(from, i);
    if (idx === -1) {
      out += text.slice(i);
      break;
    }
    const before = idx === 0 ? '' : text[idx - 1];
    const after = text[idx + from.length] ?? '';
    const okBefore = !before || !isLetter(before);
    const okAfter = !after || !isLetter(after);
    if (okBefore && okAfter) {
      out += text.slice(i, idx) + to;
      i = idx + from.length;
      n++;
    } else {
      out += text.slice(i, idx + from.length);
      i = idx + from.length;
    }
  }
  return { text: out, n };
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

let filesChanged = 0;
let totalHits = 0;
for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  for (const [from, to] of LITERAL) {
    const r = replaceLiteral(text, from, to);
    text = r.text;
    totalHits += r.n;
  }
  for (const [from, to] of BOUNDED) {
    const r = replaceBounded(text, from, to);
    text = r.text;
    totalHits += r.n;
  }
  if (text !== before) {
    fs.writeFileSync(file, text, 'utf8');
    filesChanged++;
    console.log('updated', path.relative(root, file));
  }
}
console.log(`Done: ${filesChanged} files, ${totalHits} replacements`);
