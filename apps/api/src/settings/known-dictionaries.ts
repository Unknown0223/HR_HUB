/** Mega-nav `?dict=` / admin `?panel=` codes → Dictionary seed (Verifix Справочники). */
export type KnownDictItem = {
  code: string;
  name: string;
  /** Extra columns: cars plate/vin; COA debit/credit/currency */
  meta?: Record<string, unknown>;
};

export type KnownDict = {
  code: string;
  name: string;
  kind: 'core' | 'extra' | 'admin';
  /** Sample items for demo seed / ensure */
  items?: KnownDictItem[];
};

export const KNOWN_DICTIONARIES: KnownDict[] = [
  // —— Справочники (tab=dictionaries) ——
  {
    code: 'edu',
    name: 'Виды образования',
    kind: 'core',
    items: [
      { code: 'HIGH', name: 'Высшее' },
      { code: 'SECONDARY', name: 'Среднее специальное' },
      { code: 'GENERAL', name: 'Среднее' },
    ],
  },
  {
    code: 'institutions',
    name: 'Учебные заведения',
    kind: 'core',
    items: [
      { code: 'NUU', name: 'НУУз' },
      { code: 'TUIT', name: 'ТУИТ' },
    ],
  },
  {
    code: 'specialties',
    name: 'Специальности',
    kind: 'core',
    items: [
      { code: 'IT', name: 'Информатика' },
      { code: 'ECON', name: 'Экономика' },
    ],
  },
  {
    code: 'doc_types',
    name: 'Типы документов',
    kind: 'core',
    items: [
      { code: 'PASSPORT', name: 'Паспорт' },
      { code: 'ID', name: 'ID-карта' },
      { code: 'DIPLOMA', name: 'Диплом' },
    ],
  },
  {
    code: 'labor_functions',
    name: 'Трудовые функции',
    kind: 'core',
    items: [
      { code: 'MGMT', name: 'Управление' },
      { code: 'EXEC', name: 'Исполнение' },
    ],
  },
  {
    code: 'science',
    name: 'Отрасли наук',
    kind: 'core',
    items: [
      { code: 'TECH', name: 'Технические' },
      { code: 'HUM', name: 'Гуманитарные' },
    ],
  },
  {
    code: 'languages',
    name: 'Языки',
    kind: 'core',
    items: [
      { code: 'UZ', name: 'Узбекский' },
      { code: 'RU', name: 'Русский' },
      { code: 'EN', name: 'Английский' },
    ],
  },
  {
    code: 'lang_levels',
    name: 'Степени знания языка',
    kind: 'core',
    items: [
      { code: 'A1', name: 'A1' },
      { code: 'A2', name: 'A2' },
      { code: 'B1', name: 'B1' },
      { code: 'B2', name: 'B2' },
      { code: 'C1', name: 'C1' },
      { code: 'C2', name: 'C2' },
    ],
  },
  {
    code: 'certificates',
    name: 'Виды справок',
    kind: 'core',
    items: [
      { code: 'WORK', name: 'С места работы' },
      { code: 'SALARY', name: 'О зарплате' },
    ],
  },
  {
    code: 'kinship',
    name: 'Степени родства',
    kind: 'core',
    items: [
      { code: 'SPOUSE', name: 'Супруг(а)' },
      { code: 'HUSBAND', name: 'Муж' },
      { code: 'WIFE', name: 'Жена' },
      { code: 'FATHER', name: 'Отец' },
      { code: 'MOTHER', name: 'Мать' },
      { code: 'SON', name: 'Сын' },
      { code: 'DAUGHTER', name: 'Дочь' },
      { code: 'BROTHER', name: 'Брат' },
      { code: 'SISTER', name: 'Сестра' },
      { code: 'CHILD', name: 'Ребёнок' },
      { code: 'PARENT', name: 'Родитель' },
    ],
  },
  {
    code: 'marital',
    name: 'Состояния в браке',
    kind: 'core',
    items: [
      { code: 'SINGLE', name: 'Не женат / не замужем' },
      { code: 'MARRIED', name: 'Женат / замужем' },
      { code: 'DIVORCED', name: 'Разведён(а)' },
    ],
  },
  {
    code: 'tenure',
    name: 'Виды стажа',
    kind: 'core',
    items: [
      { code: 'TOTAL', name: 'Общий' },
      { code: 'CONTINUOUS', name: 'Непрерывный' },
      { code: 'SPECIAL', name: 'Специальный' },
    ],
  },
  {
    code: 'awards',
    name: 'Награды',
    kind: 'core',
    items: [
      { code: 'HONOR', name: 'Почётная грамота' },
      { code: 'MEDAL', name: 'Медаль' },
    ],
  },
  {
    code: 'inventory_types',
    name: 'Типы инвентаря',
    kind: 'core',
    items: [
      { code: 'PC', name: 'Компьютер' },
      { code: 'PHONE', name: 'Телефон' },
      { code: 'UNIFORM', name: 'Форма' },
    ],
  },
  {
    code: 'inventory',
    name: 'Инвентари',
    kind: 'core',
    items: [
      { code: 'LAPTOP-01', name: 'Ноутбук Dell' },
      { code: 'PHONE-01', name: 'Смартфон' },
    ],
  },
  {
    code: 'cars',
    name: 'Список автомобилей',
    kind: 'core',
    items: [
      {
        code: '01A001AA',
        name: 'Chevrolet Cobalt',
        meta: { plate: '01A001AA', vin: 'XWBJA6CD5JA000001' },
      },
      {
        code: '01B002BB',
        name: 'Toyota Camry',
        meta: { plate: '01B002BB', vin: 'JTNB11HK40J000002' },
      },
    ],
  },

  // —— Дополнительные справочники (tab=extra) ——
  {
    code: 'trip_reasons',
    name: 'Причины ухода в командировку',
    kind: 'extra',
    items: [
      { code: 'CLIENT', name: 'Встреча с клиентом' },
      { code: 'TRAINING', name: 'Обучение' },
    ],
  },
  {
    code: 'sick_reasons',
    name: 'Причины ухода на больничный',
    kind: 'extra',
    items: [
      { code: 'ILLNESS', name: 'Заболевание' },
      { code: 'CARE', name: 'Уход за больным' },
    ],
  },
  {
    code: 'employment_sources',
    name: 'Источники занятости',
    kind: 'extra',
    items: [
      {
        code: 'HH',
        name: 'HeadHunter',
        meta: { sourceType: 'hire' },
      },
      {
        code: 'REF',
        name: 'Рекомендация',
        meta: { sourceType: 'hire' },
      },
      {
        code: 'SITE',
        name: 'Сайт компании',
        meta: { sourceType: 'hire_and_dismissal' },
      },
    ],
  },
  {
    code: 'indicator_groups',
    name: 'Группы показателей',
    kind: 'extra',
    items: [
      { code: 'PAYROLL', name: 'Показатели расчета зарплаты' },
      { code: 'ATTENDANCE', name: 'Показатели посещений' },
    ],
  },
  {
    code: 'indicators',
    name: 'Показатели',
    kind: 'extra',
    items: [
      {
        code: 'KPI',
        name: 'KPI',
        meta: {
          shortName: 'KPI',
          groupCode: 'PAYROLL',
          groupName: 'Показатели расчета зарплаты',
          description: '',
        },
      },
      {
        code: 'SALES',
        name: 'Продажи',
        meta: {
          shortName: 'Продажи',
          groupCode: 'PAYROLL',
          groupName: 'Показатели расчета зарплаты',
        },
      },
      {
        code: 'СверхурочныеЧасы',
        name: 'Сверхурочные часы',
        meta: {
          shortName: 'Сверх. часы',
          groupCode: 'PAYROLL',
          groupName: 'Показатели расчета зарплаты',
        },
      },
      {
        code: 'СвободноеВремяВнутриПланаСмены',
        name: 'Свободное время внутри плана смены',
        meta: {
          shortName: 'Своб. время',
          groupCode: 'ATTENDANCE',
          groupName: 'Показатели посещений',
        },
      },
      {
        code: 'СуммыОценокЗадач',
        name: 'Сумма оценок задач',
        meta: {
          shortName: 'Оценки',
          groupCode: 'PAYROLL',
          groupName: 'Показатели расчета зарплаты',
        },
      },
      {
        code: 'БонусЗаЭффективность',
        name: 'Бонус за эффективность',
        meta: {
          shortName: 'Бонус эфф.',
          groupCode: 'PAYROLL',
          groupName: 'Показатели расчета зарплаты',
        },
      },
      {
        code: 'ВремяОпозданияВМинутах',
        name: 'Время опоздания в минутах',
        meta: {
          shortName: 'Опоздание',
          groupCode: 'ATTENDANCE',
          groupName: 'Показатели посещений',
        },
      },
      {
        code: 'ЗарплатаВнутреннихКомандировок',
        name: 'Зарплата с внутренних командировок',
        meta: {
          shortName: 'Внутр. ком.',
          groupCode: 'PAYROLL',
          groupName: 'Показатели расчета зарплаты',
        },
      },
    ],
  },
  {
    code: 'avg_salary',
    name: 'Средние зарплаты',
    kind: 'extra',
    items: [],
  },
  {
    code: 'coa',
    name: 'План счетов',
    kind: 'extra',
    items: [
      {
        code: '0000',
        name: 'Остатки',
        meta: {
          isDebit: true,
          isCredit: true,
          currency: 'UZS',
          parentCode: '0000',
          parentName: 'Остатки',
          accountKind: 'transit',
          paymentKind: 'base',
          quantitative: false,
          balance: true,
          checkExceed: true,
          isMain: true,
        },
      },
      {
        code: '0110',
        name: 'Земля',
        meta: {
          isDebit: true,
          isCredit: false,
          currency: 'UZS',
          parentCode: '0000',
          parentName: 'Остатки',
          accountKind: 'active',
          paymentKind: 'base',
          quantitative: false,
          balance: true,
          checkExceed: true,
          isMain: true,
        },
      },
      {
        code: '0111',
        name: 'Благоустройство земли',
        meta: {
          isDebit: false,
          isCredit: true,
          currency: 'UZS',
          parentCode: '0110',
          parentName: 'Земля',
          accountKind: 'contra_passive',
          paymentKind: 'all',
          quantitative: false,
          balance: true,
          checkExceed: false,
          isMain: false,
        },
      },
      {
        code: '0120',
        name: 'Машины и оборудование',
        meta: {
          isDebit: true,
          isCredit: false,
          currency: 'UZS',
          parentCode: '0000',
          parentName: 'Остатки',
          accountKind: 'active',
          paymentKind: 'base',
          quantitative: false,
          balance: true,
          checkExceed: true,
          isMain: true,
        },
      },
      { code: '1010', name: 'Сырье и материалы', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '1012', name: 'Заказанные материалы на складе: в пути', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '1017', name: 'Сырье и материалы в пути', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '1020', name: 'ТМЦ на списание', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '1510', name: 'Заготовление и приобретение материалов', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '2010', name: 'Основное производство', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '2310', name: 'Вспомогательное производство', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '2810', name: 'Готовая продукция на складе', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '2910', name: 'Товары на складе', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '2912', name: 'Заказанные товары на складе: в пути', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '4010', name: 'Счета к получению от покупателей и заказчиков', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '4210', name: 'Авансы, выданные по оплате труда', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '4410', name: 'Налог на добавленную стоимость (НДС)', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '4412', name: 'Налог на добавленную стоимость (НДС) (авансовый платеж)', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '4610', name: 'Задолженность учредителей по вкладам в уставный капитал', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '5010', name: 'Денежные средства в национальной валюте', meta: { isDebit: true, isCredit: false, currency: 'UZS' } },
      { code: '5110', name: 'Расчетный счет', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6010', name: 'Счета к оплате поставщикам и подрядчикам', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6310', name: 'Авансы, полученные от покупателей и заказчиков', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6360', name: 'Задолженность по инвентаризации ТМЦ по корректировке', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6410', name: 'Подоходный налог', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6412', name: 'Налог на добавленную стоимость (НДС)', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6520', name: 'Платежи в Пенсионный фонд', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6521', name: 'Единый социальный платеж', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6610', name: 'Дивиденды к оплате', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6620', name: 'Паи и вклады', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '6710', name: 'Расчеты с персоналом по оплате труда', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '8710', name: 'Нераспределенная прибыль (непокрытый убыток) отчетного периода', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9010', name: 'Доходы от реализации готовой продукции', meta: { isDebit: false, isCredit: true, currency: 'UZS' } },
      { code: '9020', name: 'Доходы от реализации товаров', meta: { isDebit: false, isCredit: true, currency: 'UZS' } },
      { code: '9030', name: 'Доходы от выполнения работ и оказания услуг', meta: { isDebit: false, isCredit: true, currency: 'UZS' } },
      { code: '9040', name: 'Возврат проданных товаров', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9050', name: 'Скидки, предоставленные покупателям и заказчикам', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9110', name: 'Себестоимость реализованной готовой продукции', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9120', name: 'Себестоимость реализованных товаров', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9130', name: 'Себестоимость выполненных работ и оказанных услуг', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9210', name: 'ТМЦ на списание по корректировке', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9390', name: 'Прочие операционные доходы', meta: { isDebit: false, isCredit: true, currency: 'UZS' } },
      { code: '9420', name: 'Расходы отчетного периода, прочие возвраты', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9430', name: 'Прочие операционные расходы', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9540', name: 'Доходы от валютных курсовых разниц', meta: { isDebit: false, isCredit: true, currency: 'UZS' } },
      { code: '9620', name: 'Убытки от валютных курсовых разниц', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
      { code: '9910', name: 'Конечный финансовый результат', meta: { isDebit: true, isCredit: true, currency: 'UZS' } },
    ],
  },
  {
    code: 'cashboxes',
    name: 'Кассы',
    kind: 'extra',
    items: [
      { code: 'MAIN', name: 'Основная касса' },
      { code: 'PETTY', name: 'Подотчётная касса' },
    ],
  },
  {
    code: 'currencies',
    name: 'Валюты',
    kind: 'extra',
    items: [
      {
        code: '860',
        name: 'Узбекский сум',
        meta: {
          iso: 'UZS',
          unit: 'сум',
          subunit: 'тийин',
          affixKind: 'postfix',
          affix: 'сум',
          roundingType: 'nearest',
          rounding: '####.##0000',
          rates: [{ date: '2026-08-15', rate: 1 }],
        },
      },
      {
        code: '840',
        name: 'Доллар США',
        meta: {
          iso: 'USD',
          unit: 'USD',
          roundingType: 'nearest',
          rounding: '####.##0000',
        },
      },
      {
        code: '978',
        name: 'Евро',
        meta: {
          iso: 'EUR',
          unit: 'EUR',
          roundingType: 'nearest',
          rounding: '####.##0000',
        },
      },
      {
        code: '398',
        name: 'Казахстанский тенге',
        meta: {
          iso: 'KZT',
          unit: 'тенге',
          subunit: 'тиын',
          roundingType: 'nearest',
          rounding: '####.##0000',
        },
      },
      {
        code: '417',
        name: 'Киргизский сом',
        meta: {
          iso: 'KGS',
          unit: 'сом',
          subunit: 'тыйын',
          affixKind: 'postfix',
          affix: 'сом',
          roundingType: 'nearest',
          rounding: '####.##0000',
        },
      },
      {
        code: '944',
        name: 'Азербайджанский манат',
        meta: {
          iso: 'AZN',
          unit: 'манат',
          roundingType: 'nearest',
          rounding: '####.##0000',
        },
      },
      {
        code: 'UZS',
        name: 'Узбекский сум',
        meta: {
          iso: 'UZS',
          unit: 'сум',
          subunit: 'тийин',
          affixKind: 'postfix',
          affix: 'сум',
          roundingType: 'nearest',
          rounding: '####.##0000',
          rates: [{ date: '2026-08-15', rate: 1 }],
        },
      },
      {
        code: 'USD',
        name: 'Доллар США',
        meta: {
          iso: 'USD',
          unit: 'USD',
          roundingType: 'nearest',
          rounding: '####.##0000',
        },
      },
      {
        code: 'EUR',
        name: 'Евро',
        meta: {
          iso: 'EUR',
          unit: 'EUR',
          roundingType: 'nearest',
          rounding: '####.##0000',
        },
      },
    ],
  },
  {
    code: 'nationality',
    name: 'Национальность',
    kind: 'extra',
    items: [
      { code: 'UZB', name: 'Узбек' },
      { code: 'RUS', name: 'Русский' },
      { code: 'TAT', name: 'Татарин' },
      { code: 'AUTO_ARM', name: 'ARMAN' },
      { code: 'AUTO_AZE', name: 'AZARBAYJAN' },
      { code: 'AUTO_ALB', name: 'ALBAN' },
      { code: 'AUTO_IRN', name: 'Eron' },
      { code: 'AUTO_UKR', name: 'Ukraina' },
      { code: 'AUTO_KAZ', name: 'казах' },
      { code: 'AUTO_TJK', name: 'таджик' },
      { code: 'AUTO_KGZ', name: 'киргиз' },
      { code: 'AUTO_TKM', name: 'туркмен' },
      { code: 'AUTO_KKP', name: 'каракалпак' },
      { code: 'AUTO_KOR', name: 'кореец' },
      { code: 'AUTO_GEO', name: 'грузин' },
      { code: 'AUTO_BLR', name: 'белорус' },
    ],
  },
  {
    code: 'entities',
    name: 'Объекты',
    kind: 'extra',
    items: [
      { code: 'EMP', name: 'Сотрудник' },
      { code: 'DIV', name: 'Подразделение' },
      { code: 'POS', name: 'Должность' },
    ],
  },
  {
    code: 'facts',
    name: 'Факты',
    kind: 'extra',
    items: [
      { code: 'HIRE', name: 'Приём на работу' },
      { code: 'TRANSFER', name: 'Перевод' },
      { code: 'DISMISS', name: 'Увольнение' },
    ],
  },
  {
    code: 'news_feed',
    name: 'Новостная лента',
    kind: 'extra',
    items: [
      { code: 'WELCOME', name: 'Добро пожаловать в HR HUB' },
    ],
  },

  // —— Администрирование (tab=admin&panel=) ——
  {
    code: 'orgs',
    name: 'Организации',
    kind: 'admin',
    items: [
      { code: 'ADMIN', name: 'Администрирование' },
      { code: 'LALAKU', name: 'Lalaku' },
      { code: 'QOQON', name: 'Zavod QOQON' },
      { code: 'ZAV1', name: 'ZAVOD_1' },
      { code: 'ZAV2', name: 'ZAVOD_2' },
      { code: 'DEMO', name: 'Demo Company LLC' },
    ],
  },
  {
    code: 'app_roles',
    name: 'Роли',
    kind: 'admin',
    items: [
      { code: 'HR', name: 'HR-менеджер' },
      { code: 'MGR', name: 'Руководитель' },
      { code: 'EMP', name: 'Сотрудник' },
      { code: 'ACC', name: 'Бухгалтер' },
      { code: 'ADMIN', name: 'ADMIN' },
      { code: 'BOSHLIQ', name: 'boshliq' },
    ],
  },
  {
    code: 'legal_entities',
    name: 'Юридические лица',
    kind: 'admin',
    items: [
      { code: 'LE_DEMO', name: 'Demo Company LLC' },
      { code: 'LE_LALAKU', name: 'Lalaku' },
    ],
  },
  {
    code: 'countries',
    name: 'Страны',
    kind: 'admin',
    items: [
      { code: 'UZ', name: 'Узбекистан', meta: { altName: 'Uzbekistan', gps: '41.3111, 69.2797' } },
      { code: 'KZ', name: 'Казахстан', meta: { altName: 'Kazakhstan' } },
      { code: 'KG', name: 'Кыргызстан', meta: { altName: 'Kyrgyzstan' } },
      { code: 'TJ', name: 'Таджикистан', meta: { altName: 'Tajikistan' } },
      { code: 'TM', name: 'Туркменистан', meta: { altName: 'Turkmenistan' } },
      { code: 'RU', name: 'Россия', meta: { altName: 'Russia' } },
      { code: 'AZ', name: 'Азербайджан', meta: { altName: 'Azerbaijan' } },
      { code: 'AM', name: 'Армения', meta: { altName: 'Armenia' } },
      { code: 'BY', name: 'Беларусь', meta: { altName: 'Belarus' } },
      { code: 'UA', name: 'Украина', meta: { altName: 'Ukraine' } },
      { code: 'CV', name: 'Кабо-Верде', meta: { altName: 'Cabo Verde' } },
      { code: 'KH', name: 'Камбоджа', meta: { altName: 'Cambodia' } },
      { code: 'CM', name: 'Камерун', meta: { altName: 'Cameroon' } },
      { code: 'CA', name: 'Канада', meta: { altName: 'Canada' } },
      { code: 'QA', name: 'Катар', meta: { altName: 'Qatar' } },
      { code: 'KE', name: 'Кения', meta: { altName: 'Kenya' } },
      { code: 'CY', name: 'Кипр', meta: { altName: 'Cyprus' } },
      { code: 'CN', name: 'Китай', meta: { altName: 'China' } },
      { code: 'CO', name: 'Колумбия', meta: { altName: 'Colombia' } },
      { code: 'KR', name: 'Республика Корея', meta: { altName: 'Korea' } },
      { code: 'TR', name: 'Турция', meta: { altName: 'Turkey' } },
      { code: 'US', name: 'США', meta: { altName: 'United States' } },
      { code: 'DE', name: 'Германия', meta: { altName: 'Germany' } },
      { code: 'AE', name: 'ОАЭ', meta: { altName: 'UAE' } },
    ],
  },
  {
    code: 'regions',
    name: 'Регионы',
    kind: 'admin',
    items: [
      { code: 'TAS', name: 'г. Ташкент', meta: { countryCode: 'UZ' } },
      { code: 'SAM', name: 'Самаркандская область', meta: { countryCode: 'UZ' } },
      { code: 'AND', name: 'Андижанская область', meta: { countryCode: 'UZ' } },
      { code: 'QQR', name: 'Республика Каракалпакстан', meta: { countryCode: 'UZ' } },
      { code: 'BUX', name: 'Бухарская область', meta: { countryCode: 'UZ' } },
      { code: 'FER', name: 'Ферганская область', meta: { countryCode: 'UZ' } },
      { code: 'NAM', name: 'Наманганская область', meta: { countryCode: 'UZ' } },
      { code: 'NAV', name: 'Навоийская область', meta: { countryCode: 'UZ' } },
    ],
  },
  {
    code: 'banks',
    name: 'Банки',
    kind: 'admin',
    items: [
      {
        code: '00001',
        name: 'Центр расчетов Центрального банка по г. Ташкенту',
        meta: {
          address: '100001, г. Ташкент, Мирабадский район, проспект Узбекистанский, 6',
        },
      },
      {
        code: '00014',
        name: 'Расчетно-кассовый центр Центрального банка по г. Ташкенту',
        meta: {
          address: '100001, г. Ташкент, Мирабадский район, проспект Узбекистанский, 6',
        },
      },
      { code: 'NBU', name: 'НБУ' },
      { code: 'KAPITAL', name: 'Kapitalbank' },
      { code: 'IPOTEKA', name: 'Ipoteka Bank' },
    ],
  },
];

/** External systems from mega-nav `?sys=` (+ stubs for live externals) */
export const KNOWN_INTEGRATIONS: {
  sys: string;
  name: string;
  type: 'custom' | 'webhook' | 'onec' | 'bank' | 'hikvision';
  /** UI-only stub — no live outbound calls faked as success */
  stub?: boolean;
  note?: string;
}[] = [
  { sys: 'artix', name: 'Настройки ARTIX', type: 'custom' },
  { sys: 'iiko', name: 'Настройки IIKO', type: 'custom' },
  { sys: 'iiko_sales', name: 'Продажи IIKO', type: 'custom' },
  { sys: 'billz2', name: 'Настройки Billz 2.0', type: 'custom' },
  { sys: 'billz1', name: 'Продажи Billz 1.0', type: 'custom' },
  {
    sys: 'onec',
    name: '1С:Предприятие',
    type: 'onec',
    stub: true,
    note: 'Контракт UI/API готов; живой обмен с 1С не подключён',
  },
  {
    sys: 'esign',
    name: 'Электронная подпись (E-IMZO)',
    type: 'custom',
    stub: true,
    note: 'Шаблоны подписи / multi-step e-sign — stub без Biruni sign service',
  },
  {
    sys: 'mehnat',
    name: 'Mehnat.gov.uz',
    type: 'custom',
    stub: true,
    note: 'Гос. API синхронизации не клонируется; только контракт настроек',
  },
];
