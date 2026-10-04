const Map<String, String> ruAuth = {
  // Login
  'Server silkasi noto‘g‘ri. Masalan: {0}': 'Неверная ссылка на сервер. Например: {0}',
  'Server silkasi (HR beradi)': 'Ссылка на сервер (выдаёт HR)',
  'Silka noto‘g‘ri — masalan: hr-akfa.up.railway.app': 'Неверная ссылка — например: hr-akfa.up.railway.app',
  'Server, login va parolni kiriting': 'Введите сервер, логин и пароль',
  'Login yoki parol noto‘g‘ri': 'Неверный логин или пароль',
  'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring': 'Слишком много попыток. Повторите через 15 минут',
  'Xush kelibsiz!': 'Добро пожаловать!',
  'Login va parolni HR bo\'limidan oling': 'Логин и пароль выдаёт отдел кадров',
  'Server': 'Сервер',
  'Login': 'Логин',
  'masalan: ali.valiyev': 'например: ali.valiyev',
  'Parol': 'Пароль',
  'Parolni ko‘rsatish': 'Показать пароль',
  'Parolni yashirish': 'Скрыть пароль',
  'Tekshirilmoqda…': 'Проверка…',

  // One-time password change
  'Barcha maydonlarni to‘ldiring': 'Заполните все поля',
  'Yangi parol kamida {0} belgidan iborat bo‘lsin': 'Новый пароль должен содержать не менее {0} символов',
  'Yangi parollar bir xil emas': 'Новые пароли не совпадают',
  'Yangi parol bir martalik paroldan farq qilishi kerak': 'Новый пароль должен отличаться от одноразового',
  'Bir martalik parol noto‘g‘ri': 'Неверный одноразовый пароль',
  'Yangi parol bir martalik parol bilan bir xil': 'Новый пароль совпадает с одноразовым',
  'Parol saqlandi. Endi shu parol bilan kirasiz': 'Пароль сохранён. Теперь входите с ним',
  'Parolni almashtiring': 'Смените пароль',
  'Siz HR bergan bir martalik parol bilan kirdingiz. O‘zingizning shaxsiy '
          'parolingizni o‘rnating — shundan keyin ilova ochiladi.':
      'Вы вошли с одноразовым паролем от HR. Установите личный пароль — '
          'после этого приложение откроется.',
  'Bir martalik parol': 'Одноразовый пароль',
  'HR bergan 6 xonali kod': '6-значный код от HR',
  'Yangi parol': 'Новый пароль',
  'kamida {0} belgi': 'не менее {0} символов',
  'Yangi parolni qayta kiriting': 'Повторите новый пароль',
  'Kamida {0} belgi': 'Не менее {0} символов',
  'Ikkala yangi parol bir xil': 'Новые пароли совпадают',
  'Bir martalik paroldan farq qiladi': 'Отличается от одноразового пароля',
  'Parolingizni hech kim, hatto administrator ham ko‘ra olmaydi.':
      'Ваш пароль никто не увидит, даже администратор.',
  'Saqlash va kirish': 'Сохранить и войти',
  'Juda qisqa': 'Слишком короткий',
  'O‘rtacha — harf va raqam qo‘shing': 'Средний — добавьте буквы и цифры',
  'Yaxshi': 'Хороший',
  'Kuchli': 'Надёжный',

  // Permissions
  'Ba’zi ruxsatlar rad etilgan. «Sozlamalar» tugmasi orqali '
          'ilova sozlamalarini ochib, ruxsatni qo‘lda yoqing — so‘ng shu '
          'ekranga qayting.':
      'Некоторые разрешения отклонены. Кнопкой «Настройки» откройте настройки '
          'приложения, включите разрешение вручную и вернитесь на этот экран.',
  'Kutilmoqda…': 'Подождите…',
  'Barcha ruxsatlarni berish': 'Выдать все разрешения',
  'Barcha ruxsatlar berilmaguncha ilovadan foydalanib bo‘lmaydi':
      'Пока не выданы все разрешения, приложением пользоваться нельзя',
  'Ruxsatlar kerak': 'Нужны разрешения',
  'Worklyn ishlashi uchun {0} ta ruxsat zarur': 'Для работы Worklyn нужны разрешения: {0}',
  '{0} / {1} berildi': 'Выдано: {0} / {1}',
  'Sozlamalar': 'Настройки',
  'Berish': 'Разрешить',
  'Aniq joylashuv': 'Точная геолокация',
  'Kirish/chiqish belgisini GPS orqali tasdiqlash uchun': 'Для подтверждения отметок прихода и ухода по GPS',
  'Joylashuv — «Doim ruxsat»': 'Геолокация — «Разрешить всегда»',
  'Ilova yopiq bo‘lsa ham ish vaqtida joylashuvni uzatish uchun':
      'Для передачи геолокации в рабочее время, даже когда приложение закрыто',
  'GPS yoqilgan': 'GPS включён',
  'Telefon sozlamalarida joylashuv xizmati yoqilgan bo‘lishi kerak':
      'В настройках телефона должна быть включена служба геолокации',
  'Kamera': 'Камера',
  'Yuzni tekshirish va foto-hisobot uchun': 'Для проверки лица и фотоотчётов',
  'Bildirishnomalar': 'Уведомления',
  'Kuzatuv holati va HR xabarlarini ko‘rsatish uchun': 'Для показа статуса отслеживания и сообщений HR',
  'Batareya cheklovisiz': 'Без ограничений батареи',
  'Tizim ilovani fonda o‘chirib qo‘ymasligi uchun': 'Чтобы система не закрывала приложение в фоне',

  // Splash / brand chip
  'Davomat · GPS · Kadrlar': 'Учёт времени · GPS · Кадры',

  // App lock
  'Noto‘g‘ri PIN-kod. Yana {0} ta urinish qoldi': 'Неверный PIN-код. Осталось попыток: {0}',
  'Salom, {0}!': 'Здравствуйте, {0}!',
  'Ilovani ochish uchun PIN-kodni kiriting': 'Введите PIN-код, чтобы открыть приложение',
  'Barmoq izi': 'Отпечаток пальца',
  'Parol bilan qayta kirasiz.': 'Нужно будет снова войти с паролем.',
  'PIN-kodni unutdingizmi?': 'Забыли PIN-код?',
  'Joriy PIN-kod noto‘g‘ri': 'Неверный текущий PIN-код',
  'Juda oddiy kod — boshqasini tanlang': 'Слишком простой код — выберите другой',
  'Kodlar mos kelmadi — qaytadan o‘ylab toping': 'Коды не совпали — придумайте заново',
  'Barmoq izi bilan ochishni tasdiqlang': 'Подтвердите вход по отпечатку пальца',
  'Joriy PIN-kodni kiriting': 'Введите текущий PIN-код',
  'O‘zgartirishdan oldin tasdiqlang': 'Подтвердите перед изменением',
  'PIN-kod o‘rnating': 'Установите PIN-код',
  'Ilovaga tez kirish uchun 4 xonali kod o‘ylab toping': 'Придумайте 4-значный код для быстрого входа',
  'PIN-kodni takrorlang': 'Повторите PIN-код',
  'Xuddi shu 4 raqamni yana kiriting': 'Введите те же 4 цифры ещё раз',
  'Barmoq izi bilan ochish': 'Вход по отпечатку пальца',
  'PIN-kod o‘rnatildi. Endi ilovani bir teginish bilan ochishingiz mumkin — '
          'PIN-kod zaxira sifatida qoladi.':
      'PIN-код установлен. Теперь приложение можно открывать одним касанием — '
          'PIN-код останется запасным.',
  'Yoqish': 'Включить',
  'Keyinroq': 'Позже',
  'PIN-kod yangilandi': 'PIN-код обновлён',
  'O‘chirish': 'Удалить',
};
