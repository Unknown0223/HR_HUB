const Map<String, String> ruRequests = {
  // Requests list
  'Yo‘qlik': 'Отсутствие',
  'Yo\'qlik': 'Отсутствие',
  'Jadvalni o‘zgartirish': 'Изменение графика',
  'Smena almashinuvi': 'Обмен сменами',
  'Qo‘shimcha ish vaqti': 'Сверхурочная работа',
  'Ish joyi': 'Место работы',
  'HR murojaati': 'Обращение в HR',
  'Barchasi': 'Все',
  'Bekor qilingan': 'Отменено',
  'So\'rovlar ro\'yxati': 'Список заявок',
  'Holat bo‘yicha': 'По статусу',
  'Yaratish': 'Создать',
  'Bu oyda so‘rovlar yo‘q': 'В этом месяце заявок нет',
  'Bu oyda «{0}» so‘rovlar yo‘q': 'В этом месяце нет заявок со статусом «{0}»',
  'So‘rov': 'Заявка',
  'Ish joyida yo‘qlik': 'Отсутствие на работе',
  'Ta’til, kasallik, shaxsiy ish': 'Отпуск, болезнь, личные дела',
  'Avans': 'Аванс',
  'Ish haqi hisobidan avans so‘rash': 'Запросить аванс в счёт зарплаты',

  // Create absence
  'Bu kunlarga allaqachon yo‘qlik so‘rovi bor (kutilayotgan yoki tasdiqlangan)':
      'На эти дни уже есть заявка на отсутствие (на рассмотрении или одобренная)',
  'Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak':
      'Время окончания должно быть позже времени начала',
  'Yo‘qlik turini tanlang': 'Выберите тип отсутствия',
  'Sanalarni belgilang': 'Укажите даты',
  'Sanani belgilang': 'Укажите дату',
  'Boshlanish va tugash vaqtini belgilang': 'Укажите время начала и окончания',
  'So‘rov rahbarga yuborildi': 'Заявка отправлена руководителю',
  'Yo‘qlik sanalari': 'Даты отсутствия',
  'Tanlash': 'Выбрать',
  'Ish joyida yo\'qlik so\'rovi': 'Заявка на отсутствие',
  'Yo‘qlik turlari sozlanmagan. HR bo‘limiga murojaat qiling.':
      'Типы отсутствия не настроены. Обратитесь в отдел кадров.',
  'Kunlik': 'По дням',
  'Soatlik': 'По часам',
  'Yo‘qlik turi': 'Тип отсутствия',
  'Ko\'rsatilmagan': 'Не указано',
  'sanalar': 'даты',
  '{0} kun': '{0} дн.',
  'Belgilash': 'Указать',
  'sana': 'дата',
  'Boshlanish vaqti': 'Время начала',
  'Tugash vaqti': 'Время окончания',
  'Izoh': 'Комментарий',
  'Sabab yoki qo‘shimcha ma’lumot': 'Причина или дополнительная информация',

  // Approval inbox
  'Tasdiq navbati': 'Очередь на согласование',
  'Kutilayotgan so‘rov yo‘q': 'Нет заявок на рассмотрении',
  'Tasdiqlandi': 'Одобрено',
  'Rad etildi': 'Отклонено',
  'Rad': 'Отклонить',

  // Advance
  'Summani kiriting': 'Введите сумму',
  'Summa limitdan oshdi — avans nima uchun kerakligini izohda yozing':
      'Сумма превышает лимит — укажите в комментарии, зачем нужен аванс',
  'So‘rov yuborildi. Javob bildirishnoma orqali keladi':
      'Заявка отправлена. Ответ придёт в уведомлении',
  'So‘rovni bekor qilasizmi?': 'Отменить заявку?',
  'Avans so‘rovi': 'Заявка на аванс',
  'Avvalgi so‘rovingiz ko‘rib chiqilmoqda. Yangi so‘rovni u hal qilingandan keyin yuborishingiz mumkin.':
      'Ваша предыдущая заявка ещё на рассмотрении. Новую заявку можно отправить после того, как по ней примут решение.',
  'Summa': 'Сумма',
  '(ixtiyoriy)': '(необязательно)',
  'Avans nima uchun kerak (masalan: davolanish, o‘qish to‘lovi)':
      'Зачем нужен аванс (например: лечение, оплата учёбы)',
  'Qo‘shimcha ma’lumot': 'Дополнительная информация',
  'Mening so‘rovlarim': 'Мои заявки',
  'Hali avans so‘ramagansiz': 'Вы ещё не запрашивали аванс',
  'Avans limiti belgilanmagan': 'Лимит аванса не установлен',
  'Izohsiz so‘rash mumkin: {0} gacha': 'Без комментария можно запросить до {0}',
  'Istalgan summani so‘rashingiz mumkin, izoh ixtiyoriy.':
      'Можно запросить любую сумму, комментарий необязателен.',
  'Bundan katta summa uchun avans nima maqsadda kerakligini yozish majburiy.':
      'Для большей суммы обязательно укажите, на какие цели нужен аванс.',
  'Summa limitdan {0} ga ko‘p. Izoh majburiy: avans nima uchun kerakligini yozing — rahbar shunga qarab qaror qiladi.':
      'Сумма превышает лимит на {0}. Комментарий обязателен: укажите, зачем нужен аванс — руководитель примет решение на его основе.',
  'Limitdan yuqori': 'Сверх лимита',

  // Payroll
  'Ish haqi': 'Зарплата',
  'Bu oy uchun ish haqi hali hisoblanmagan':
      'Зарплата за этот месяц ещё не начислена',
  'Oklad (oylik stavka)': 'Оклад (месячная ставка)',
  'Yopilgan': 'Закрыто',
  'Hisoblangan': 'Начислено',
  'Hisoblanmoqda': 'Идёт расчёт',
  'Hisoblandi': 'Начислено',
  'Ushlab qolindi': 'Удержано',
  'Avans to‘landi': 'Выплачен аванс',
  'To‘lanishi kerak': 'К выплате',
  'Hisoblashlar': 'Начисления',
  'Ushlab qolishlar': 'Удержания',
  'Avanslar': 'Авансы',
};
