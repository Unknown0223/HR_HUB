/**
 * Verifix formSiblings — second-row subheader links under page title.
 * Source: output/run_20260725_222506 clone pages (data-doc-subnav).
 */

export type SiblingLink = {
  label: string;
  href: string;
};

export type SiblingGroup = {
  title: string;
  siblings: SiblingLink[];
};

/** Map Verifix page title → sibling links (HR HUB routes). */
export const FORM_SIBLINGS: Record<string, SiblingGroup> = {
  employees: {
    title: 'Сотрудники',
    siblings: [
      { label: 'Организационная структура', href: '/divisions?tab=tree' },
      { label: 'Физические лица', href: '/catalog/persons' },
      { label: 'Уволенные сотрудники', href: '/employees?tab=dismissed' },
      { label: 'Сотрудники по договору ГПХ', href: '/employees?tab=gph' },
    ],
  },
  'employees-dismissed': {
    title: 'Уволенные сотрудники',
    siblings: [
      { label: 'Организационная структура', href: '/divisions?tab=tree' },
      { label: 'Физические лица', href: '/catalog/persons' },
    ],
  },
  'employees-gph': {
    title: 'Сотрудники по договору ГПХ',
    siblings: [
      { label: 'Организационная структура', href: '/divisions?tab=tree' },
      { label: 'Физические лица', href: '/catalog/persons' },
      { label: 'Договор ГПХ', href: '/catalog/gph-contracts' },
    ],
  },
  persons: {
    title: 'Физические лица',
    siblings: [
      { label: 'Сотрудники', href: '/employees' },
      { label: 'Уволенные сотрудники', href: '/employees?tab=dismissed' },
    ],
  },
  divisions: {
    title: 'Подразделения',
    siblings: [
      { label: 'Подразделения', href: '/divisions?tab=divisions' },
      { label: 'Организационная структура', href: '/divisions?tab=tree' },
      { label: 'Группы отделов', href: '/divisions?tab=groups' },
    ],
  },
  'division-form': {
    title: 'Подразделение',
    siblings: [],
  },
  'divisions-import': {
    title: 'Импорт подразделений',
    siblings: [
      { label: 'Подразделения', href: '/divisions?tab=divisions' },
    ],
  },
  'divisions-tree': {
    title: 'Подразделения',
    siblings: [
      { label: 'Подразделения', href: '/divisions?tab=divisions' },
      { label: 'Организационная структура', href: '/divisions?tab=tree' },
      { label: 'Группы отделов', href: '/divisions?tab=groups' },
    ],
  },
  'divisions-groups': {
    title: 'Подразделения',
    siblings: [
      { label: 'Подразделения', href: '/divisions?tab=divisions' },
      { label: 'Организационная структура', href: '/divisions?tab=tree' },
      { label: 'Группы отделов', href: '/divisions?tab=groups' },
    ],
  },
  positions: {
    title: 'Должности',
    siblings: [
      { label: 'Должности', href: '/positions?tab=positions' },
      { label: 'Группа должностей', href: '/positions?tab=groups' },
    ],
  },
  'position-form': {
    title: 'Должность',
    siblings: [],
  },
  'positions-import': {
    title: 'Импорт должностей',
    siblings: [{ label: 'Должности', href: '/positions?tab=positions' }],
  },
  'position-groups': {
    title: 'Должности',
    siblings: [
      { label: 'Должности', href: '/positions?tab=positions' },
      { label: 'Группа должностей', href: '/positions?tab=groups' },
    ],
  },
  'position-templates': {
    title: 'Шаблоны должностей',
    siblings: [
      { label: 'Группа должностей', href: '/catalog/position-groups' },
      { label: 'Позиции', href: '/catalog/staff-positions' },
    ],
  },
  'dynamic-fields': {
    title: 'Динамические поля',
    siblings: [
      { label: 'Объекты', href: '/catalog/dynamic-objects' },
      { label: 'Факты', href: '/catalog/dynamic-facts' },
    ],
  },
  'dynamic-objects': {
    title: 'Объекты',
    siblings: [
      { label: 'Динамические поля', href: '/catalog/dynamic-fields' },
      { label: 'Факты', href: '/catalog/dynamic-facts' },
    ],
  },
  'dynamic-facts': {
    title: 'Факты (метаданные)',
    siblings: [
      { label: 'Динамические поля', href: '/catalog/dynamic-fields' },
      { label: 'Объекты', href: '/catalog/dynamic-objects' },
    ],
  },
  facts: {
    title: 'Факты',
    siblings: [{ label: 'Типы фактов', href: '/catalog/fact-types' }],
  },
  'fact-types': {
    title: 'Типы фактов',
    siblings: [{ label: 'Факты', href: '/catalog/facts' }],
  },
  'accrual-types': {
    title: 'Начисления',
    siblings: [{ label: 'Удержания', href: '/catalog/deduction-types' }],
  },
  'deduction-types': {
    title: 'Удержания',
    siblings: [{ label: 'Начисления', href: '/catalog/accrual-types' }],
  },
  'staff-positions': {
    title: 'Позиции',
    siblings: [
      {
        label: 'Организационная структура по позициям',
        href: '/catalog/staff-positions/structure',
      },
    ],
  },
  'staff-positions-structure': {
    title: 'Организационная структура по позициям',
    siblings: [{ label: 'Позиции', href: '/catalog/staff-positions' }],
  },
  grades: {
    title: 'Разряды',
    siblings: [],
  },
  'grade-form': {
    title: 'Разряд',
    siblings: [],
  },
  'hr-documents': {
    title: 'Все кадровые документы',
    siblings: [
      { label: 'Договор ГПХ', href: '/catalog/gph-contracts' },
      { label: 'Кадровые переводы', href: '/catalog/transfers' },
      { label: 'Реестр изменения имени сотрудника', href: '/catalog/name-changes' },
      { label: 'Обходные листы', href: '/catalog/clearance-sheets' },
      { label: 'Все изменения в оплате труда', href: '/catalog/wage-changes' },
    ],
  },
  transfers: {
    title: 'Кадровые переводы',
    siblings: [
      { label: 'Все кадровые документы', href: '/catalog/hr-documents' },
      { label: 'Договор ГПХ', href: '/catalog/gph-contracts' },
      { label: 'Реестр изменения имени сотрудника', href: '/catalog/name-changes' },
      { label: 'Все изменения в оплате труда', href: '/catalog/wage-changes' },
    ],
  },
  'name-changes': {
    title: 'Реестр изменения имени сотрудника',
    siblings: [
      { label: 'Все кадровые документы', href: '/catalog/hr-documents' },
      { label: 'Кадровые переводы', href: '/catalog/transfers' },
      { label: 'Договор ГПХ', href: '/catalog/gph-contracts' },
    ],
  },
  absences: {
    title: 'Все отсутствия сотрудников',
    siblings: [
      { label: 'Запросы на отсутствие', href: '/catalog/absence-requests' },
      { label: 'Виды отсутствий', href: '/catalog/absence-types' },
    ],
  },
  'absence-types': {
    title: 'Виды отсутствий',
    siblings: [
      { label: 'Виды рабочего времени', href: '/catalog/time-types' },
    ],
  },
  'time-types': {
    title: 'Виды рабочего времени',
    siblings: [
      { label: 'Виды отсутствий', href: '/catalog/absence-types' },
    ],
  },
  'absence-requests': {
    title: 'Запросы на отсутствие',
    siblings: [
      { label: 'Виды отсутствий', href: '/catalog/absence-types' },
      { label: 'Виды рабочего времени', href: '/catalog/time-types' },
    ],
  },
  'schedule-change-requests': {
    title: 'Запросы на изменение графика',
    siblings: [
      { label: 'Изменение расписания', href: '/catalog/roster-change-requests' },
      { label: 'Графики работы', href: '/catalog/work-schedules' },
      { label: 'Список смен', href: '/catalog/schedule-shifts' },
    ],
  },
  'roster-change-requests': {
    title: 'Запросы на изменение расписания',
    siblings: [
      { label: 'Изменение графика', href: '/catalog/schedule-change-requests' },
      { label: 'Расписания', href: '/catalog/rosters' },
      { label: 'Список смен', href: '/catalog/schedule-shifts' },
    ],
  },
  'location-requests': {
    title: 'Запросы на локацию',
    siblings: [{ label: 'Локации', href: '/catalog/locations' }],
  },
  'overtime-requests': {
    title: 'Запросы на сверхурочные',
    siblings: [],
  },
  'schedule-shifts': {
    title: 'Список смен расписания',
    siblings: [
      { label: 'Расписания', href: '/catalog/rosters' },
      { label: 'Изменение расписания', href: '/catalog/roster-change-requests' },
      { label: 'Графики работы', href: '/catalog/work-schedules' },
    ],
  },
  incidents: {
    title: 'Инциденты',
    siblings: [{ label: 'Типы инцидента', href: '/catalog/incident-types' }],
  },
  'incident-types': {
    title: 'Типы инцидента',
    siblings: [],
  },
  'clearance-sheets': {
    title: 'Обходные листы',
    siblings: [
      { label: 'Шаблоны обходных листов', href: '/catalog/clearance-templates' },
    ],
  },
  'clearance-templates': {
    title: 'Шаблоны обходных листов',
    siblings: [
      { label: 'Обходные листы', href: '/catalog/clearance-sheets' },
    ],
  },
  'wage-changes': {
    title: 'Все изменения в оплате труда',
    siblings: [
      { label: 'Все кадровые документы', href: '/catalog/hr-documents' },
      { label: 'Кадровые переводы', href: '/catalog/transfers' },
      { label: 'Реестр изменения имени сотрудника', href: '/catalog/name-changes' },
    ],
  },
  'tariff-groups': {
    title: 'Тарифные группы',
    siblings: [
      {
        label: 'Утверждения тарифных групп',
        href: '/catalog/tariff-approvals',
      },
    ],
  },
  'tariff-approvals': {
    title: 'Утверждения тарифных групп',
    siblings: [
      { label: 'Тарифные группы', href: '/catalog/tariff-groups' },
    ],
  },
  'grade-history': {
    title: 'Повышение разрядов',
    siblings: [{ label: 'Карьерный путь', href: '/catalog/career-paths' }],
  },
  'dismissal-analytics': {
    title: 'Причины увольнений',
    siblings: [
      { label: 'Кадровые изменения', href: '/catalog/personnel-changes' },
      { label: 'Итоги года', href: '/catalog/year-summary' },
      { label: 'Причины увольнения', href: '/catalog/dismissal-reasons' },
    ],
  },
  'personnel-changes': {
    title: 'Кадровые изменения',
    siblings: [
      { label: 'Причины увольнений', href: '/catalog/dismissal-analytics' },
      { label: 'Итоги года', href: '/catalog/year-summary' },
      { label: 'Статистика подразделений', href: '/catalog/division-stats' },
    ],
  },
  'division-stats': {
    title: 'Статистика работы подразделений',
    siblings: [
      { label: 'Кадровые изменения', href: '/catalog/personnel-changes' },
      { label: 'Подразделения', href: '/divisions?tab=divisions' },
    ],
  },
  'year-summary': {
    title: 'Итоги года',
    siblings: [
      { label: 'Кадровые изменения', href: '/catalog/personnel-changes' },
      { label: 'Причины увольнений', href: '/catalog/dismissal-analytics' },
      { label: 'Статистика подразделений', href: '/catalog/division-stats' },
    ],
  },
  'dismissal-reasons': {
    title: 'Причины увольнения',
    siblings: [
      { label: 'Причины увольнений', href: '/catalog/dismissal-analytics' },
      { label: 'Кадровые изменения', href: '/catalog/personnel-changes' },
    ],
  },
  'employment-sources': {
    title: 'Источники занятости',
    siblings: [
      { label: 'Показатели', href: '/catalog/indicators' },
    ],
  },
  indicators: {
    title: 'Показатели',
    siblings: [
      { label: 'Источники занятости', href: '/catalog/employment-sources' },
    ],
  },
  'avg-salaries': {
    title: 'Средние зарплаты',
    siblings: [],
  },
  coa: {
    title: 'План счетов',
    siblings: [
      { label: 'План главных счетов', href: '/catalog/coa-main' },
      { label: 'Настройки счетов', href: '/settings/account-settings' },
    ],
  },
  'coa-main': {
    title: 'План главных счетов',
    siblings: [
      { label: 'План счетов', href: '/catalog/coa' },
      { label: 'Настройки счетов', href: '/settings/account-settings' },
    ],
  },
  cashboxes: {
    title: 'Кассы',
    siblings: [
      { label: 'История изменений', href: '/catalog/cashboxes/history' },
    ],
  },
  currencies: {
    title: 'Валюты',
    siblings: [
      { label: 'История изменений', href: '/catalog/currencies/history' },
    ],
  },
  nationality: {
    title: 'Национальность',
    siblings: [],
  },
  artix: {
    title: 'Настройки ARTIX',
    siblings: [{ label: 'Список ролей ARTIX', href: '/settings/artix/roles' }],
  },
  iiko: {
    title: 'Настройки IIKO',
    siblings: [{ label: 'Продажи IIKO', href: '/settings/iiko-sales' }],
  },
  'iiko-sales': {
    title: 'Продажи IIKO',
    siblings: [{ label: 'Настройки IIKO', href: '/settings/iiko' }],
  },
  'app-users': {
    title: 'Пользователи',
    siblings: [
      { label: 'Роли', href: '/settings/users/roles' },
      { label: 'Все пользователи', href: '/settings/users' },
    ],
  },
  'app-roles': {
    title: 'Роли',
    siblings: [{ label: 'Пользователи', href: '/settings/users' }],
  },
  organizations: {
    title: 'Организации',
    siblings: [],
  },
  countries: {
    title: 'Страны',
    siblings: [],
  },
  'countries-history': {
    title: 'История изменений',
    siblings: [],
  },
  banks: {
    title: 'Банки',
    siblings: [],
  },
  'banks-import': {
    title: 'Банки (импорт)',
    siblings: [],
  },
  quickstart: {
    title: 'Инструкция для быстрого запуска',
    siblings: [],
  },
  photos: {
    title: 'Загрузка фотографий сотрудников',
    siblings: [],
  },
  'person-docs': {
    title: 'Импорт персональных документов',
    siblings: [],
  },
  billz: {
    title: 'Настройки Billz 2.0',
    siblings: [{ label: 'Продажи Billz 1.0', href: '/settings/billz-sales' }],
  },
  'billz-sales': {
    title: 'Продажи Billz 1.0',
    siblings: [{ label: 'Настройки Billz 2.0', href: '/settings/billz' }],
  },
  'grade-history-form': {
    title: 'Повышение разрядов',
    siblings: [{ label: 'Карьерный путь', href: '/catalog/career-paths' }],
  },
  'grade-recommendations': {
    title: 'Рекомендуемый список сотрудников',
    siblings: [{ label: 'Повышение разрядов', href: '/catalog/grade-history' }],
  },
  'career-paths': {
    title: 'Карьерный путь',
    siblings: [{ label: 'Повышение разрядов', href: '/catalog/grade-history' }],
  },
  'career-path-form': {
    title: 'Карьерный путь',
    siblings: [{ label: 'Повышение разрядов', href: '/catalog/grade-history' }],
  },
  locations: {
    title: 'Локации',
    siblings: [
      { label: 'Устройства', href: '/catalog/devices' },
      { label: 'Новые устройства', href: '/catalog/devices?filter=new' },
      { label: 'Локации', href: '/catalog/locations' },
      { label: 'Удалённое управление', href: '/catalog/device-control' },
      { label: 'Типы локаций', href: '/catalog/location-types' },
    ],
  },
  devices: {
    title: 'Устройства',
    siblings: [
      { label: 'Устройства', href: '/catalog/devices' },
      { label: 'Новые устройства', href: '/catalog/devices?filter=new' },
      { label: 'Локации', href: '/catalog/locations' },
      { label: 'Удалённое управление', href: '/catalog/device-control' },
    ],
  },
  'device-control': {
    title: 'Удалённое управление устройствами',
    siblings: [
      { label: 'Устройства', href: '/catalog/devices' },
      { label: 'Новые устройства', href: '/catalog/devices?filter=new' },
      { label: 'Локации', href: '/catalog/locations' },
      { label: 'Удалённое управление', href: '/catalog/device-control' },
    ],
  },
  marks: {
    title: 'Отметки',
    siblings: [
      { label: 'Отслеживание местоположения', href: '/attendance/location-tracking' },
      { label: 'GPS отслеживание', href: '/attendance/gps-tracking' },
      { label: 'Список проблемных отметок', href: '/attendance/problems' },
      { label: 'Отображение последних отметок', href: '/attendance/latest' },
    ],
  },
  schedules: {
    title: 'Графики работы',
    siblings: [
      { label: 'Производственные календари', href: '/catalog/production-calendars' },
    ],
  },
  'work-schedules': {
    title: 'Графики работы',
    siblings: [
      { label: 'Производственные календари', href: '/catalog/production-calendars' },
    ],
  },
  'production-calendars': {
    title: 'Производственные календари',
    siblings: [{ label: 'Графики работы', href: '/catalog/work-schedules' }],
  },
  'schedule-overrides': {
    title: 'Индивидуальные графики',
    siblings: [
      { label: 'Графики работы', href: '/catalog/work-schedules' },
      { label: 'Для позиций', href: '/catalog/position-schedules' },
      { label: 'Список смен', href: '/catalog/schedule-shifts' },
    ],
  },
  'position-schedules': {
    title: 'Индивидуальные графики для позиций',
    siblings: [
      { label: 'Индивидуальные графики', href: '/catalog/schedule-overrides' },
      { label: 'Расписания', href: '/catalog/rosters' },
      { label: 'Графики работы', href: '/catalog/work-schedules' },
    ],
  },
  rosters: {
    title: 'Расписание',
    siblings: [
      { label: 'Графики работы', href: '/catalog/work-schedules' },
      { label: 'Индивидуальные графики', href: '/catalog/schedule-overrides' },
      { label: 'Для позиций', href: '/catalog/position-schedules' },
    ],
  },
  timesheet: {
    title: 'Табель',
    siblings: [],
  },
  'timesheet-adjustments': {
    title: 'Корректировки табеля',
    siblings: [],
  },
  'hr-requests': {
    title: 'Заявки на кадровые изменения',
    siblings: [],
  },
  'payroll-lines': {
    title: 'Все начисления',
    siblings: [{ label: 'Поручения', href: '/catalog/payment-orders' }],
  },
  'payment-orders': {
    title: 'Поручения',
    siblings: [],
  },
  accruals: {
    title: 'Все начисления',
    siblings: [{ label: 'Поручения', href: '/catalog/payment-orders' }],
  },
  settlements: {
    title: 'Взаиморасчеты',
    siblings: [{ label: 'Парные счета', href: '/catalog/account-pairs' }],
  },
  'account-pairs': {
    title: 'Парные счета',
    siblings: [{ label: 'Взаиморасчеты', href: '/catalog/settlements' }],
  },
  'sales-accruals': {
    title: 'Начисления процентов от продаж',
    siblings: [{ label: 'Настройка процентов продаж', href: '/catalog/sales-policies' }],
  },
  'sales-policies': {
    title: 'Настройка процентов продаж',
    siblings: [{ label: 'Начисления процентов от продаж', href: '/catalog/sales-accruals' }],
  },
  'one-time-accruals': {
    title: 'Разовые начисления',
    siblings: [],
  },
  'gph-contracts': {
    title: 'Договор ГПХ',
    siblings: [{ label: 'Список услуг договора ГПХ', href: '/catalog/gph-services' }],
  },
  'gph-services': {
    title: 'Список услуг договора ГПХ',
    siblings: [{ label: 'Договор ГПХ', href: '/catalog/gph-contracts' }],
  },
  qr: {
    title: 'Сгенерированные QR-коды',
    siblings: [
      { label: 'Локации', href: '/catalog/locations' },
      { label: 'Устройства', href: '/catalog/devices' },
    ],
  },
  gps: {
    title: 'GPS отслеживание',
    siblings: [
      { label: 'Отметки', href: '/attendance/marks' },
      { label: 'Отслеживание местоположения', href: '/attendance/location-tracking' },
    ],
  },
  problems: {
    title: 'Список проблемных отметок',
    siblings: [
      { label: 'Отметки', href: '/attendance/marks' },
      { label: 'Отображение последних отметок', href: '/attendance/latest' },
    ],
  },
  days: {
    title: 'Отображение последних отметок',
    siblings: [
      { label: 'Отметки', href: '/attendance/marks' },
      { label: 'Список проблемных отметок', href: '/attendance/problems' },
    ],
  },
  policies: {
    title: 'Политики штрафов',
    siblings: [],
  },
  'allowance-policies': {
    title: 'Политики выплат',
    siblings: [],
  },
  periods: {
    title: 'Расчётные периоды',
    siblings: [],
  },
  vedomost: {
    title: 'Ведомость',
    siblings: [],
  },
  'manual-ops': {
    title: 'Ручные операции',
    siblings: [],
  },
  advances: {
    title: 'Аванс',
    siblings: [],
  },
  loans: {
    title: 'Займы',
    siblings: [],
  },
  'loan-payments': {
    title: 'Платежи по займам',
    siblings: [{ label: 'Займы', href: '/catalog/loans' }],
  },
  'travel-expenses': {
    title: 'Авансовый отчет по командировке',
    siblings: [],
  },
  'bonus-accruals': {
    title: 'Бонусные начисления',
    siblings: [],
  },
  'internal-trips': {
    title: 'Внутренние командировки',
    siblings: [
      { label: 'Авансовый отчет по командировке', href: '/catalog/travel-expenses' },
    ],
  },
  candidates: {
    title: 'Кандидаты',
    siblings: [{ label: 'Вакансии', href: '/catalog/vacancies' }],
  },
  vacancies: {
    title: 'Вакансии',
    siblings: [{ label: 'Кандидаты', href: '/catalog/candidates' }],
  },
  'reports-candidates': {
    title: 'Отчет по кандидатам',
    siblings: [],
  },
  'reports-vacancies': {
    title: 'Отчет по вакантным позициям',
    siblings: [],
  },
  'reports-schedule-plan': {
    title: 'Отчет по плану графиков',
    siblings: [],
  },
  'reports-occupancy': {
    title: 'Отчет по занятости',
    siblings: [],
  },
  'reports-employees': {
    title: 'Отчет по сотрудникам',
    siblings: [],
  },
  'reports-tenure': {
    title: 'Отчет по стажам',
    siblings: [],
  },
  'reports-grades': {
    title: 'Отчет по разрядам',
    siblings: [],
  },
};

/** Resolve sibling group for catalog resource slug. */
export const CATALOG_SIBLING_KEY: Record<string, string> = {
  persons: 'persons',
  'hr-documents': 'hr-documents',
  transfers: 'transfers',
  'gph-contracts': 'gph-contracts',
  'name-changes': 'name-changes',
  'wage-changes': 'wage-changes',
  'clearance-sheets': 'clearance-sheets',
  'clearance-templates': 'clearance-templates',
  incidents: 'incidents',
  'incident-types': 'incident-types',
  'absence-types': 'absence-types',
  'absence-requests': 'absence-requests',
  'schedule-change-requests': 'schedule-change-requests',
  'roster-change-requests': 'roster-change-requests',
  'location-requests': 'location-requests',
  'overtime-requests': 'overtime-requests',
  absences: 'absences',
  'division-groups': 'divisions',
  'position-groups': 'positions',
  'position-templates': 'position-templates',
  'dynamic-fields': 'dynamic-fields',
  'dynamic-objects': 'dynamic-objects',
  'dynamic-facts': 'dynamic-facts',
  facts: 'facts',
  'fact-types': 'fact-types',
  'accrual-types': 'accrual-types',
  'deduction-types': 'deduction-types',
  'staff-positions': 'staff-positions',
  grades: 'grades',
  'tariff-approvals': 'tariff-approvals',
  'tariff-groups': 'tariff-groups',
  'grade-history': 'grade-history',
  'grade-recommendations': 'grade-recommendations',
  'career-paths': 'career-paths',
  'career-steps': 'career-paths',
  'dismissal-analytics': 'dismissal-analytics',
  'dismissal-reasons': 'dismissal-reasons',
  'employment-sources': 'employment-sources',
  indicators: 'indicators',
  'avg-salaries': 'avg-salaries',
  coa: 'coa',
  'coa-main': 'coa-main',
  cashboxes: 'cashboxes',
  currencies: 'currencies',
  nationality: 'nationality',
  'personnel-changes': 'personnel-changes',
  'division-stats': 'division-stats',
  'year-summary': 'year-summary',
  'work-schedules': 'work-schedules',
  'schedule-shifts': 'schedule-shifts',
  'production-calendars': 'production-calendars',
  schedules: 'work-schedules',
  'location-types': 'locations',
  'device-control': 'device-control',
  devices: 'devices',
  'gps-tracks': 'marks',
  'payroll-lines': 'payroll-lines',
  'payment-orders': 'payment-orders',
  settlements: 'settlements',
  'account-pairs': 'account-pairs',
  'sales-accruals': 'sales-accruals',
  'sales-policies': 'sales-policies',
  'one-time-accruals': 'one-time-accruals',
  'gph-services': 'gph-services',
  'timesheet-adjustments': 'timesheet-adjustments',
  'schedule-overrides': 'schedule-overrides',
  'position-schedules': 'position-schedules',
  rosters: 'rosters',
  'hr-requests': 'hr-requests',
  loans: 'loans',
  'loan-payments': 'loan-payments',
  'travel-expenses': 'travel-expenses',
  'bonus-accruals': 'bonus-accruals',
  'internal-trips': 'internal-trips',
  candidates: 'candidates',
  vacancies: 'vacancies',
};
