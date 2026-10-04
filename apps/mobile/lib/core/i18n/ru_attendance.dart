const Map<String, String> ruAttendance = {
  // Calendar
  'Taqvim': 'Календарь',
  '{0} min': '{0} мин',
  '{0} soat': '{0} ч',
  '{0} soat {1} min': '{0} ч {1} мин',
  'kirish': 'приход',
  'chiqish': 'уход',
  'Kechikish: {0}': 'Опоздание: {0}',
  'sababli deb hisoblandi': 'признано уважительным',
  'Qaydnoma · {0}': 'Журнал отметок · {0}',
  'Barchasi': 'Все',
  'Bu kunda qayd yo‘q': 'В этот день отметок нет',
  'Kech · to‘liq emas': 'Опоздание · неполный день',
  'Kech · sababli': 'Опоздание · уважительное',
  'So\'rovlar': 'Заявки',
  'Bu oyda yo‘qlik so‘rovlari yo‘q': 'В этом месяце нет заявок на отсутствие',
  'Yo\'qlik': 'Отсутствие',
  'Oylik statistika · {0}': 'Статистика за месяц · {0}',
  'Bu oy uchun davomat hali hisoblanmagan. Ish jadvali biriktirilgach '
          'va qaydlar tushgach, statistika shu yerda chiqadi.':
      'Посещаемость за этот месяц ещё не рассчитана. Статистика появится '
      'здесь после назначения графика работы и поступления отметок.',
  '{0}: {1} kun ({2}%)': '{0}: {1} дн. ({2}%)',
  'ishlangan vaqt': 'отработано',
  'jami kechikish': 'всего опозданий',
  'Kech qolgan': 'Опоздание',
  'Kelmagan / hisoblanmagan': 'Неявка / не засчитано',
  'Dam olish': 'Выходной',

  // Timesheet
  'Tabel': 'Табель',
  'Barcha qaydlar': 'Все отметки',
  'Akkauntingiz xodim kartasiga bog‘lanmagan — tabel bo‘sh. '
          'HR bo‘limiga murojaat qiling.':
      'Ваш аккаунт не привязан к карточке сотрудника — табель пуст. '
      'Обратитесь в отдел кадров.',
  'Oy xulosasi': 'Итоги месяца',
  'Kech (daq)': 'Опоздание (мин)',
  'Kunlar': 'Дни',
  'Bu oy uchun kunlar hali yo‘q': 'Дней за этот месяц пока нет',
  'Belgilar': 'Отметки',
  'Belgilar yo‘q': 'Отметок нет',

  // Marks
  'Faqat kirish': 'Только приход',
  'Faqat chiqish': 'Только уход',
  'Saralash': 'Фильтр',
  'Xato: {0}': 'Ошибка: {0}',
  'Bu oyda qaydlar yo‘q': 'В этом месяце отметок нет',
  '«{0}» bo‘yicha qayd topilmadi': 'По фильтру «{0}» отметок не найдено',
  'Hududdan tashqarida': 'Вне зоны',
  'Hududdan tashqarida · {0}': 'Вне зоны · {0}',
  'Yaroqsiz belgi': 'Недействительная отметка',

  // Mobile punch
  'Telefoningizda soxta lokatsiya (Fake GPS) aniqlandi. Siz ruxsatsiz uchinchi '
          'tomon tizimidan foydalanib, davomat qoidalarini aylanib o‘tishga urindingiz. '
          'Belgi qabul qilinmadi va bu holat HR bo‘limiga yuborildi. Takrorlansa, '
          'akkauntingiz qora ro‘yxatga tushirilishi va bloklanishi mumkin.':
      'На вашем телефоне обнаружена поддельная геолокация (Fake GPS). Вы '
      'пытались обойти правила учёта посещаемости с помощью стороннего '
      'приложения. Отметка не принята, а случай передан в отдел кадров. При '
      'повторении ваш аккаунт может быть внесён в чёрный список и заблокирован.',
  'Joylashuv aniqlanmoqda…': 'Определение местоположения…',
  'GPS sun’iy yo‘ldosh signali kutilmoqda…': 'Ожидание сигнала спутников GPS…',
  'Aniqlik: {0} m · o‘lchov {1}': 'Точность: {0} м · замер {1}',
  'GPS aniqligi past ({0} m). '
          'Ochiq joyga chiqib qayta urinib ko‘ring.':
      'Низкая точность GPS ({0} м). '
      'Выйдите на открытое место и попробуйте снова.',
  'Soxta lokatsiya aniqlandi': 'Обнаружена поддельная геолокация',
  'Yuz mos kelmadi': 'Лицо не совпало',
  'Yuz tekshirilmoqda…': 'Проверка лица…',
  'Yuz aniqlanmadi': 'Лицо не найдено',
  'Tushundim': 'Понятно',
  'Foto-hisobot tayyorlanmoqda…': 'Подготовка фотоотчёта…',
  'Foto-hisobot tayyorlanmadi: {0}': 'Не удалось подготовить фотоотчёт: {0}',
  'Serverga yuborilmoqda…': 'Отправка на сервер…',
  '{0} — telefon orqali': '{0} — с телефона',
  'Aniq joylashuv olinmoqda': 'Определяем точное местоположение',
  'Faqat tizim GPS · soxta lokatsiya tekshiriladi':
      'Только системный GPS · проверка на подделку',
  'Izoh (majburiy)': 'Комментарий (обязательно)',
  'Masalan: mijoz oldida, xizmat safari…': 'Например: у клиента, командировка…',
  'Kamida {0} ta belgi': 'Минимум {0} символа',
  'Joylashuvni yangilash': 'Обновить местоположение',
  'Yuzni tekshirishni boshlash': 'Начать проверку лица',
  'Avval izoh yozing': 'Сначала напишите комментарий',
  'foto-hisobot yuborildi': 'фотоотчёт отправлен',
  'hududdan tashqarida': 'вне зоны',
  'Bosh sahifaga qaytilmoqda…': 'Возврат на главную…',
  'Yuborilmadi': 'Не отправлено',
  'Qayta yuborish': 'Отправить снова',
  'Bosh sahifaga qaytish': 'Вернуться на главную',
  'Hudud belgilanmagan': 'Зона не задана',
  'Hudud ichidasiz': 'Вы в зоне',
  'Hududdan tashqaridasiz': 'Вы вне зоны',
  'Ruxsat: {0} m': 'Допуск: {0} м',
  'Siz: {0} m': 'Вы: {0} м',
  '±{0} m aniqlik': 'точность ±{0} м',
  '{0} ta o‘lchov': 'замеров: {0}',
  'Tizim GPS · himoyalangan': 'Системный GPS · защищено',
  'Hudud belgilanmagan — izoh talab qilinmaydi.':
      'Зона не задана — комментарий не требуется.',
  'Belgi qabul qilinadi, lekin izoh majburiy va u '
          '«hududdan tashqarida» deb belgilanadi.':
      'Отметка будет принята, но комментарий обязателен, и она будет '
      'помечена как «вне зоны».',
  'Ishga kelish': 'Приход на работу',
  'Ishdan ketish': 'Уход с работы',
  '{0} {1} · telefon orqali': '{0} {1} · с телефона',
  'Qanday o‘tadi': 'Как это работает',
  'Insonlik tekshiruvi': 'Проверка живого лица',
  'Boshingizni ekrandagi yo‘nalishlarga buring (3–8 ta, tasodifiy)':
      'Поворачивайте голову по указаниям на экране (3–8 случайных)',
  'Foto-hisobot': 'Фотоотчёт',
  'Bitta bosishda orqa va old kamera suratga oladi':
      'Одно нажатие — снимки основной и фронтальной камерой',
  'Suratlar birlashtirilib avtomatik yuboriladi':
      'Снимки объединяются и отправляются автоматически',
  'Tasdiq': 'Подтверждение',
  '2 soniyalik bildirishnoma, so‘ng bosh sahifa':
      'Уведомление на 2 секунды, затем главная',

  // Liveness
  'Chapga': 'Влево',
  'O\'ngga': 'Вправо',
  'Yuqoriga': 'Вверх',
  'Pastga': 'Вниз',
  'Chap-yuqoriga': 'Влево-вверх',
  'O\'ng-yuqoriga': 'Вправо-вверх',
  'Chap-pastga': 'Влево-вниз',
  'O\'ng-pastga': 'Вправо-вниз',
  'Vaqt tugadi — harakatni tezroq bajaring':
      'Время вышло — выполняйте движение быстрее',
  'Kadrdagi yuz almashdi': 'Лицо в кадре сменилось',
  'Old kamera topilmadi': 'Фронтальная камера не найдена',
  'Kamera ishga tushmadi: {0}': 'Не удалось запустить камеру: {0}',
  'Selfie olinmadi: {0}': 'Не удалось сделать селфи: {0}',
  'Yuzni aniqlash ishlamadi: {0}': 'Распознавание лица не работает: {0}',
  'Yuzingizni ramka ichiga joylang': 'Поместите лицо в рамку',
  'Telefonni yuz balandligida ushlang': 'Держите телефон на уровне лица',
  'Kadrda faqat o‘zingiz bo‘ling': 'В кадре должны быть только вы',
  'Boshqa odamlar kadrdan chiqsin': 'Попросите других выйти из кадра',
  'To‘g‘ri kameraga qarang': 'Смотрите прямо в камеру',
  'Tekshiruv boshlanmoqda': 'Проверка начинается',
  'Boshingizni {0} buring': 'Поверните голову {0}',
  'Strelka yo‘nalishida sekin buriling': 'Медленно поворачивайтесь по стрелке',
  'Yonga burilib, iyagingizni biroz ko‘taring':
      'Повернитесь в сторону и слегка поднимите подбородок',
  'Yonga burilib, iyagingizni biroz tushiring':
      'Повернитесь в сторону и слегка опустите подбородок',
  'Yana to‘g‘ri qarang': 'Снова смотрите прямо',
  'Boshingizni markazga qaytaring': 'Верните голову в центр',
  'To‘g‘ri qarang': 'Смотрите прямо',
  'Surat avtomatik olinadi': 'Снимок будет сделан автоматически',
  'Surat saqlanmoqda…': 'Сохранение снимка…',
  'Tekshiruv muvaffaqiyatsiz': 'Проверка не пройдена',
  'Qaytadan boshlab, ko‘rsatmalarni bajaring':
      'Начните заново и следуйте указаниям',
  'Yuz aniqlandi': 'Лицо обнаружено',
  '{0} ta yuz': 'Лиц: {0}',
  'Yuz qidirilmoqda': 'Поиск лица',
  'Jonli tekshiruv': 'Живая проверка',
  'Qaytadan boshlash': 'Начать заново',
  'Harakatlar': 'Движения',

  // Dual capture
  'Orqa kamera topilmadi': 'Основная камера не найдена',
  'Surat olinmadi: {0}': 'Не удалось сделать снимок: {0}',
  'Ish joyingizni kadrga oling va tugmani bosing':
      'Наведите камеру на рабочее место и нажмите кнопку',
  'Orqa kamera suratga olmoqda…': 'Снимает основная камера…',
  'Old kamera: kameraga qarang…': 'Фронтальная камера: смотрите в камеру…',
  'Bitta bosishda ikkala kamera suratga oladi':
      'Одно нажатие — снимки обеими камерами',

  // GPS tracking
  'GPS kuzatuv': 'GPS-отслеживание',
  'Kuzatuv ulanmagan': 'Отслеживание не подключено',
  'Hisobingiz xodim kartasiga bog‘lanmagan':
      'Ваш аккаунт не привязан к карточке сотрудника',
  'Ruxsat yo‘q': 'Нет разрешения',
  'Joylashuv ruxsatini «Doim ruxsat» qiling':
      'Установите разрешение геолокации «Разрешить всегда»',
  'GPS o‘chirilgan': 'GPS выключен',
  'Telefonda joylashuv xizmatini yoqing': 'Включите геолокацию на телефоне',
  'Kuzatuv faol': 'Отслеживание активно',
  'Ish vaqti: joylashuv avtomatik uzatilmoqda':
      'Рабочее время: геолокация передаётся автоматически',
  'Bugun joylashuv uzatilmaydi': 'Сегодня геолокация не передаётся',
  'Bayram kuni': 'Праздничный день',
  'Ta’til / ruxsat': 'Отпуск / отгул',
  'Tasdiqlangan ta’tilda kuzatuv o‘chadi':
      'Во время одобренного отпуска отслеживание отключается',
  'Ish hali boshlanmagan': 'Рабочий день ещё не начался',
  'Ish vaqti boshlanishi bilan kuzatuv yoqiladi':
      'Отслеживание включится с началом рабочего времени',
  'Ish vaqtidan tashqari': 'Нерабочее время',
  'Ish vaqti tugadi — joylashuv uzatilmaydi':
      'Рабочее время закончилось — геолокация не передаётся',
  'Ish vaqti: {0} – {1}': 'Рабочее время: {0} – {1}',
  'Oxirgi yuborish': 'Последняя отправка',
  'Bugun nuqtalar': 'Точек сегодня',
  'Batareya': 'Батарея',
  'Fon xizmati': 'Фоновая служба',
  'Ishlamoqda': 'Работает',
  'To‘xtagan': 'Остановлена',
  'Batareya cheklovi': 'Ограничение батареи',
  'O‘chirilgan': 'Отключено',
  'Yoqilgan': 'Включено',
  'Oxirgi GPS nuqta': 'Последняя GPS-точка',
  'Joylashuv faqat ish jadvalingizdagi vaqtda uzatiladi. Dam olish, '
          'bayram va tasdiqlangan ta’til kunlarida hamda ish vaqtidan '
          'tashqarida server ma’lumotni qabul qilmaydi.':
      'Геолокация передаётся только в рабочее время по вашему графику. В '
      'выходные, праздники, дни одобренного отпуска и вне рабочего времени '
      'сервер данные не принимает.',
  'Quvvatlanayotganda nuqtalar tez-tez, batareya kamayganda va '
          'bir joyda turganingizda kamroq olinadi.':
      'Во время зарядки точки фиксируются чаще, а при низком заряде и когда '
      'вы стоите на месте — реже.',
  'Bu telefonda alohida avtoishga tushirish sozlamasi yo‘q':
      'На этом телефоне нет отдельной настройки автозапуска',
  'Avtoishga tushirish (Xiaomi, Oppo, Vivo…)': 'Автозапуск (Xiaomi, Oppo, Vivo…)',
};
