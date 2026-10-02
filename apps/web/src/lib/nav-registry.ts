/**
 * Canonical web navigation: one owner section per page.
 *
 * `href` values double as roleAccess grant keys (`<href>::*`), so an existing href
 * must never be renamed — add the new URL as the item href and keep the old one in
 * `aliases`, or keep the old href as-is. `scripts/check-nav-registry.js` enforces
 * that every legacy grant key still exists and that each href appears once.
 */

import { REPORT_CATEGORIES, reportsByCategory } from './reports-registry';

export type NavSectionId =
  | 'home'
  | 'employees'
  | 'hr-docs'
  | 'org'
  | 'attendance'
  | 'schedules'
  | 'requests'
  | 'payroll'
  | 'payments'
  | 'reports'
  | 'analytics'
  | 'access'
  | 'maintenance'
  | 'communications'
  | 'dictionaries'
  | 'settings';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  /** Font Awesome class without the `fas` prefix */
  faIcon: string;
  /** Other URLs of the same screen (tabs, query variants, legacy paths) — active state only. */
  aliases?: string[];
  /** Visible to platform_admin only. */
  platformOnly?: boolean;
  /** Hub page: owns only its own path, not child routes of other modules. */
  exact?: boolean;
};

export type NavGroup = { id: string; title: string; items: NavItem[] };

export type NavSection = {
  id: NavSectionId;
  label: string;
  faIcon: string;
  /** Path prefixes owned by the section when no item matches (detail pages, tabs). */
  prefixes: string[];
  groups: NavGroup[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'home',
    label: 'Главная',
    faIcon: 'fa-home',
    prefixes: ['/dashboard'],
    groups: [
      {
        id: 'home',
        title: 'Главная',
        items: [{ id: 'dashboard', label: 'Статистика посещений', href: '/dashboard', faIcon: 'fa-chart-pie' }],
      },
    ],
  },
  {
    id: 'employees',
    label: 'Сотрудники',
    faIcon: 'fa-users',
    prefixes: ['/employees'],
    groups: [
      {
        id: 'staff',
        title: 'Персонал',
        items: [
          {
            id: 'employees',
            label: 'Сотрудники',
            href: '/employees',
            faIcon: 'fa-users',
            aliases: ['/employees?tab=dismissed', '/employees?tab=gph'],
          },
          { id: 'persons', label: 'Физические лица', href: '/catalog/persons', faIcon: 'fa-address-card' },
          { id: 'gph-contracts', label: 'Договоры ГПХ', href: '/catalog/gph-contracts', faIcon: 'fa-file-contract' },
          { id: 'relatives', label: 'Родственники', href: '/catalog/relatives', faIcon: 'fa-user-friends' },
        ],
      },
      {
        id: 'recruiting',
        title: 'Подбор',
        items: [
          { id: 'candidates', label: 'Кандидаты', href: '/catalog/candidates', faIcon: 'fa-user-plus' },
          { id: 'vacancies', label: 'Вакансии', href: '/catalog/vacancies', faIcon: 'fa-door-open' },
        ],
      },
    ],
  },
  {
    id: 'hr-docs',
    label: 'Кадровые документы',
    faIcon: 'fa-folder-open',
    prefixes: [],
    groups: [
      {
        id: 'hr-docs',
        title: 'Документы',
        items: [
          { id: 'hr-documents', label: 'Все кадровые документы', href: '/catalog/hr-documents', faIcon: 'fa-file-alt' },
          { id: 'transfers', label: 'Кадровые переводы', href: '/catalog/transfers', faIcon: 'fa-random' },
          { id: 'name-changes', label: 'Изменения имени', href: '/catalog/name-changes', faIcon: 'fa-signature' },
          { id: 'wage-changes', label: 'Изменения оплаты труда', href: '/catalog/wage-changes', faIcon: 'fa-money-bill-wave' },
          { id: 'hr-requests', label: 'Заявки на кадровые изменения', href: '/catalog/hr-requests', faIcon: 'fa-file-signature' },
        ],
      },
      {
        id: 'absence-clearance',
        title: 'Отсутствия и обходные листы',
        items: [
          { id: 'absences', label: 'Все отсутствия сотрудников', href: '/catalog/absences', faIcon: 'fa-calendar-times' },
          { id: 'clearance-sheets', label: 'Обходные листы', href: '/catalog/clearance-sheets', faIcon: 'fa-clipboard-list' },
          { id: 'clearance-templates', label: 'Шаблоны обходных листов', href: '/catalog/clearance-templates', faIcon: 'fa-clipboard' },
        ],
      },
      {
        id: 'incidents',
        title: 'Инциденты',
        items: [
          { id: 'incidents', label: 'Инциденты', href: '/catalog/incidents', faIcon: 'fa-exclamation-circle' },
          { id: 'incident-types', label: 'Типы инцидента', href: '/catalog/incident-types', faIcon: 'fa-tags' },
        ],
      },
    ],
  },
  {
    id: 'org',
    label: 'Оргструктура',
    faIcon: 'fa-sitemap',
    prefixes: ['/divisions', '/positions'],
    groups: [
      {
        id: 'structure',
        title: 'Структура',
        items: [
          {
            id: 'divisions',
            label: 'Подразделения',
            href: '/divisions?tab=divisions',
            faIcon: 'fa-sitemap',
            aliases: ['/divisions', '/divisions?tab=tree', '/divisions?tab=groups', '/catalog/division-groups'],
          },
          {
            id: 'positions',
            label: 'Должности',
            href: '/positions?tab=positions',
            faIcon: 'fa-briefcase',
            aliases: ['/positions', '/positions?tab=groups', '/catalog/position-groups'],
          },
          {
            id: 'staff-positions',
            label: 'Позиции',
            href: '/catalog/staff-positions',
            faIcon: 'fa-code-branch',
            aliases: ['/catalog/staff-positions/structure'],
          },
        ],
      },
      {
        id: 'grades',
        title: 'Разряды и карьера',
        items: [
          { id: 'grades', label: 'Разряды', href: '/catalog/grades', faIcon: 'fa-layer-group' },
          { id: 'grade-history', label: 'Повышение разрядов', href: '/catalog/grade-history', faIcon: 'fa-chart-line' },
          { id: 'tariff-groups', label: 'Тарифные группы', href: '/catalog/tariff-groups', faIcon: 'fa-percent' },
          { id: 'tariff-approvals', label: 'Утверждения тарифных групп', href: '/catalog/tariff-approvals', faIcon: 'fa-check-square' },
          {
            id: 'career-paths',
            label: 'Карьерный путь',
            href: '/catalog/career-paths',
            faIcon: 'fa-route',
            aliases: ['/catalog/career-steps'],
          },
        ],
      },
    ],
  },
  {
    id: 'attendance',
    label: 'Посещаемость',
    faIcon: 'fa-user-clock',
    prefixes: ['/attendance'],
    groups: [
      {
        id: 'marks',
        title: 'Отметки',
        items: [
          { id: 'attendance', label: 'Журнал посещаемости', href: '/attendance', faIcon: 'fa-clipboard-check' },
          { id: 'marks', label: 'Отметки', href: '/attendance/marks', faIcon: 'fa-check-double' },
          { id: 'problems', label: 'Проблемные отметки', href: '/attendance/problems', faIcon: 'fa-exclamation-triangle' },
          { id: 'latest', label: 'Последние отметки', href: '/attendance/latest', faIcon: 'fa-stream' },
          { id: 'correction', label: 'Корректировка табеля', href: '/attendance/correction', faIcon: 'fa-edit' },
          { id: 'timesheet-adjustments', label: 'Корректировки табеля (часы)', href: '/catalog/timesheet-adjustments', faIcon: 'fa-th' },
        ],
      },
      {
        id: 'locations',
        title: 'Локации и GPS',
        items: [
          {
            id: 'locations',
            label: 'Локации',
            href: '/catalog/locations',
            faIcon: 'fa-map',
            aliases: ['/catalog/location-types'],
          },
          { id: 'location-tracking', label: 'Отслеживание местоположения', href: '/attendance/location-tracking', faIcon: 'fa-map-marked-alt' },
          { id: 'gps-tracking', label: 'GPS отслеживание', href: '/attendance/gps-tracking', faIcon: 'fa-satellite' },
        ],
      },
    ],
  },
  {
    id: 'schedules',
    label: 'Графики работы',
    faIcon: 'fa-calendar-alt',
    prefixes: [],
    groups: [
      {
        id: 'schedules',
        title: 'Графики',
        items: [
          { id: 'work-schedules', label: 'Графики работы', href: '/catalog/work-schedules', faIcon: 'fa-calendar-alt' },
          { id: 'production-calendars', label: 'Производственные календари', href: '/catalog/production-calendars', faIcon: 'fa-calendar' },
          { id: 'schedule-overrides', label: 'Индивидуальные графики', href: '/catalog/schedule-overrides', faIcon: 'fa-user-edit' },
          { id: 'position-schedules', label: 'Индивидуальные графики для позиций', href: '/catalog/position-schedules', faIcon: 'fa-briefcase' },
        ],
      },
      {
        id: 'rosters',
        title: 'Расписания и смены',
        items: [
          { id: 'rosters', label: 'Расписания', href: '/catalog/rosters', faIcon: 'fa-calendar-week' },
          { id: 'schedule-shifts', label: 'Список смен расписания', href: '/catalog/schedule-shifts', faIcon: 'fa-clock' },
        ],
      },
    ],
  },
  {
    id: 'requests',
    label: 'Заявки',
    faIcon: 'fa-inbox',
    prefixes: [],
    groups: [
      {
        id: 'requests',
        title: 'Заявки сотрудников',
        items: [
          { id: 'absence-requests', label: 'Запросы на отсутствие', href: '/catalog/absence-requests', faIcon: 'fa-calendar-minus' },
          { id: 'schedule-change-requests', label: 'Запросы на изменение графика', href: '/catalog/schedule-change-requests', faIcon: 'fa-exchange-alt' },
          { id: 'roster-change-requests', label: 'Запросы на изменение расписания', href: '/catalog/roster-change-requests', faIcon: 'fa-random' },
          { id: 'overtime-requests', label: 'Запросы на сверхурочные', href: '/catalog/overtime-requests', faIcon: 'fa-hourglass-half' },
          { id: 'location-requests', label: 'Запросы на локацию', href: '/catalog/location-requests', faIcon: 'fa-map-marker-alt' },
          { id: 'internal-trips', label: 'Внутренние командировки', href: '/catalog/internal-trips', faIcon: 'fa-suitcase' },
        ],
      },
    ],
  },
  {
    id: 'payroll',
    label: 'Зарплата',
    faIcon: 'fa-wallet',
    prefixes: ['/payroll'],
    groups: [
      {
        id: 'calc',
        title: 'Расчёт',
        items: [
          { id: 'payroll', label: 'Периоды и авансы', href: '/payroll', faIcon: 'fa-calculator' },
          {
            id: 'advance-requests',
            label: 'Заявки на аванс',
            href: '/payroll/advance-requests',
            faIcon: 'fa-hand-holding-usd',
          },
          { id: 'timesheets', label: 'Табель', href: '/payroll/timesheets', faIcon: 'fa-calendar-check' },
          { id: 'accruals', label: 'Все начисления', href: '/payroll/accruals', faIcon: 'fa-coins' },
          { id: 'vedomost', label: 'Ведомость', href: '/payroll/vedomost', faIcon: 'fa-file-invoice-dollar' },
          { id: 'manual', label: 'Ручные операции', href: '/payroll/manual', faIcon: 'fa-edit' },
        ],
      },
      {
        id: 'policies',
        title: 'Политики',
        items: [
          { id: 'fine-policies', label: 'Политики штрафов', href: '/payroll/fine-policies', faIcon: 'fa-gavel' },
          { id: 'allowance-policies', label: 'Политика доплат', href: '/payroll/allowance-policies', faIcon: 'fa-hand-holding-usd' },
          { id: 'sales-policies', label: 'Проценты от продаж', href: '/catalog/sales-policies', faIcon: 'fa-percentage' },
        ],
      },
    ],
  },
  {
    id: 'payments',
    label: 'Начисления и выплаты',
    faIcon: 'fa-hand-holding-usd',
    prefixes: [],
    groups: [
      {
        id: 'accruals',
        title: 'Начисления',
        items: [
          { id: 'one-time-accruals', label: 'Разовые начисления', href: '/catalog/one-time-accruals', faIcon: 'fa-bolt' },
          { id: 'bonus-accruals', label: 'Бонусные начисления', href: '/catalog/bonus-accruals', faIcon: 'fa-gift' },
          { id: 'sales-accruals', label: 'Начисления процентов от продаж', href: '/catalog/sales-accruals', faIcon: 'fa-chart-pie' },
          { id: 'gph-services', label: 'Список услуг договора ГПХ', href: '/catalog/gph-services', faIcon: 'fa-file-contract' },
        ],
      },
      {
        id: 'payouts',
        title: 'Выплаты и расчёты',
        items: [
          { id: 'settlements', label: 'Взаиморасчеты', href: '/catalog/settlements', faIcon: 'fa-balance-scale' },
          { id: 'payment-orders', label: 'Поручения', href: '/catalog/payment-orders', faIcon: 'fa-file-signature' },
          { id: 'loans', label: 'Займы', href: '/catalog/loans', faIcon: 'fa-university' },
          { id: 'travel-expenses', label: 'Авансовый отчет по командировке', href: '/catalog/travel-expenses', faIcon: 'fa-plane' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Отчёты',
    faIcon: 'fa-chart-bar',
    prefixes: ['/reports', '/catalog/reports'],
    groups: [
      {
        id: 'hub',
        title: 'Отчёты',
        items: [
          { id: 'reports', label: 'Все отчёты', href: '/reports', faIcon: 'fa-chart-bar' },
          ...(['hr', 'attendance', 'payroll', 'finance'] as const).map((cat) => ({
            id: `reports-${cat}`,
            label: REPORT_CATEGORIES.find((c) => c.id === cat)!.label,
            href: `/reports?category=${cat}`,
            faIcon: REPORT_CATEGORIES.find((c) => c.id === cat)!.faIcon,
            aliases: reportsByCategory(cat).map((r) => r.href),
          })),
          {
            id: 'reports-quick',
            label: 'Быстрые отчёты',
            href: '/reports?tab=overview',
            faIcon: 'fa-bolt',
            aliases: reportsByCategory('quick')
              .map((r) => r.href)
              .filter((h) => h !== '/reports?tab=overview'),
          },
        ],
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Аналитика',
    faIcon: 'fa-chart-line',
    prefixes: [],
    groups: [
      {
        id: 'analytics',
        title: 'Аналитика',
        items: [
          { id: 'division-stats', label: 'Статистика работы подразделений', href: '/catalog/division-stats', faIcon: 'fa-calendar-alt' },
          { id: 'year-summary', label: 'Итоги года', href: '/catalog/year-summary', faIcon: 'fa-chart-area' },
          { id: 'dismissal-analytics', label: 'Причины увольнений', href: '/catalog/dismissal-analytics', faIcon: 'fa-chart-line' },
          { id: 'personnel-changes', label: 'Кадровые изменения', href: '/catalog/personnel-changes', faIcon: 'fa-exchange-alt' },
          {
            id: 'personnel-moves',
            label: 'Кадровые перемещения',
            href: '/catalog/personnel-changes?groupBy=position',
            faIcon: 'fa-chart-bar',
          },
        ],
      },
    ],
  },
  {
    id: 'access',
    label: 'Доступы',
    faIcon: 'fa-key',
    prefixes: ['/access', '/settings/users'],
    groups: [
      {
        id: 'access',
        title: 'Доступы',
        items: [
          { id: 'overview', label: 'Обзор', href: '/access', faIcon: 'fa-th-large', exact: true },
          {
            id: 'access-grants',
            label: 'Доступы сотрудников',
            href: '/access/employees',
            faIcon: 'fa-key',
            aliases: ['/catalog/access-grants'],
          },
          { id: 'users', label: 'Пользователи', href: '/settings/users', faIcon: 'fa-users-cog' },
          {
            id: 'roles',
            label: 'Роли',
            href: '/settings/users/roles',
            faIcon: 'fa-user-tag',
            aliases: ['/settings/users/roles/products'],
          },
          { id: 'role-access', label: 'Права ролей', href: '/settings/users/roles/access', faIcon: 'fa-user-shield' },
          { id: 'mobile-access', label: 'Мобильное приложение', href: '/settings/mobile-access', faIcon: 'fa-mobile-alt' },
          { id: 'audit', label: 'Журнал аудита', href: '/settings/audit', faIcon: 'fa-history' },
        ],
      },
    ],
  },
  {
    id: 'maintenance',
    label: 'Устройства и интеграции',
    faIcon: 'fa-tools',
    prefixes: ['/settings/artix', '/settings/iiko', '/settings/billz'],
    groups: [
      {
        id: 'devices',
        title: 'Устройства',
        items: [
          {
            id: 'devices',
            label: 'Устройства',
            href: '/catalog/devices',
            faIcon: 'fa-tablet-alt',
            aliases: ['/catalog/devices?filter=new'],
          },
          { id: 'device-control', label: 'Удалённое управление', href: '/catalog/device-control', faIcon: 'fa-sliders-h' },
          { id: 'device-link', label: 'Связь с офисом', href: '/catalog/devices/link', faIcon: 'fa-link' },
        ],
      },
      {
        id: 'pos',
        title: 'Кассовые и учётные системы',
        items: [
          { id: 'artix', label: 'ARTIX', href: '/settings/artix', faIcon: 'fa-plug' },
          { id: 'iiko', label: 'IIKO', href: '/settings/iiko', faIcon: 'fa-utensils' },
          { id: 'iiko-sales', label: 'Продажи IIKO', href: '/settings/iiko-sales', faIcon: 'fa-receipt' },
          { id: 'billz', label: 'Billz 2.0', href: '/settings/billz', faIcon: 'fa-store' },
          { id: 'billz-sales', label: 'Продажи Billz 1.0', href: '/settings/billz-sales', faIcon: 'fa-shopping-bag' },
        ],
      },
      {
        // 1С / E-IMZO / Mehnat are configuration records only: the backend marks them as stubs.
        id: 'external',
        title: 'Внешние системы (обмен не подключён)',
        items: [
          {
            id: 'onec',
            label: '1С:Предприятие',
            href: '/settings?tab=integrations&sys=onec',
            faIcon: 'fa-server',
            aliases: ['/settings?tab=integrations'],
          },
          { id: 'esign', label: 'Электронная подпись', href: '/settings?tab=integrations&sys=esign', faIcon: 'fa-pen' },
          { id: 'mehnat', label: 'Mehnat.gov.uz', href: '/settings?tab=integrations&sys=mehnat', faIcon: 'fa-landmark' },
        ],
      },
    ],
  },
  {
    id: 'communications',
    label: 'Коммуникации',
    faIcon: 'fa-comments',
    prefixes: ['/news'],
    groups: [
      {
        id: 'publications',
        title: 'Публикации',
        items: [{ id: 'news', label: 'Новости', href: '/news', faIcon: 'fa-newspaper' }],
      },
      {
        id: 'channels',
        title: 'Каналы и заявки',
        items: [
          { id: 'join-requests', label: 'Заявки из Telegram', href: '/employees/join-requests', faIcon: 'fa-user-clock' },
          { id: 'telegram', label: 'Telegram Bot', href: '/settings/telegram', faIcon: 'fa-paper-plane' },
          { id: 'google-form', label: 'Google Form', href: '/settings/google-form', faIcon: 'fa-wpforms' },
        ],
      },
    ],
  },
  {
    id: 'dictionaries',
    label: 'Справочники',
    faIcon: 'fa-book',
    prefixes: [],
    groups: [
      {
        id: 'dict-hr',
        title: 'Кадровые',
        items: [
          { id: 'document-types', label: 'Типы документов', href: '/catalog/document-types', faIcon: 'fa-file' },
          {
            id: 'hire-document-exceptions',
            label: 'Исключения по документам при приеме',
            href: '/catalog/hire-document-exceptions',
            faIcon: 'fa-exclamation-triangle',
          },
          { id: 'dismissal-reasons', label: 'Причины увольнения', href: '/catalog/dismissal-reasons', faIcon: 'fa-user-times' },
          { id: 'employment-sources', label: 'Источники занятости', href: '/catalog/employment-sources', faIcon: 'fa-search' },
          { id: 'nationality', label: 'Национальность', href: '/catalog/nationality', faIcon: 'fa-globe' },
          {
            id: 'labor-functions',
            label: 'Трудовые функции',
            href: '/settings?tab=dictionaries&dict=labor_functions',
            faIcon: 'fa-briefcase',
            aliases: ['/settings?tab=dictionaries'],
          },
          { id: 'certificates', label: 'Виды справок', href: '/settings?tab=dictionaries&dict=certificates', faIcon: 'fa-certificate' },
          { id: 'kinship', label: 'Степени родства', href: '/settings?tab=dictionaries&dict=kinship', faIcon: 'fa-home' },
          { id: 'marital', label: 'Состояния в браке', href: '/settings?tab=dictionaries&dict=marital', faIcon: 'fa-heart' },
          { id: 'tenure', label: 'Виды стажа', href: '/settings?tab=dictionaries&dict=tenure', faIcon: 'fa-hourglass-half' },
          { id: 'awards', label: 'Награды', href: '/settings?tab=dictionaries&dict=awards', faIcon: 'fa-medal' },
        ],
      },
      {
        id: 'dict-education',
        title: 'Образование и квалификация',
        items: [
          { id: 'education-types', label: 'Виды образования', href: '/catalog/education-types', faIcon: 'fa-graduation-cap' },
          { id: 'institutions', label: 'Учебные заведения', href: '/catalog/institutions', faIcon: 'fa-university' },
          { id: 'specialties', label: 'Специальности', href: '/catalog/specialties', faIcon: 'fa-user-graduate' },
          { id: 'science', label: 'Отрасли наук', href: '/settings?tab=dictionaries&dict=science', faIcon: 'fa-flask' },
          { id: 'languages', label: 'Языки', href: '/settings?tab=dictionaries&dict=languages', faIcon: 'fa-language' },
          { id: 'lang-levels', label: 'Степени знания языка', href: '/settings?tab=dictionaries&dict=lang_levels', faIcon: 'fa-signal' },
        ],
      },
      {
        id: 'dict-time',
        title: 'Время и отсутствия',
        items: [
          { id: 'absence-types', label: 'Виды отсутствий', href: '/catalog/absence-types', faIcon: 'fa-calendar-times' },
          { id: 'time-types', label: 'Виды рабочего времени', href: '/catalog/time-types', faIcon: 'fa-clock' },
          {
            id: 'trip-reasons',
            label: 'Причины ухода в командировку',
            href: '/settings?tab=extra&dict=trip_reasons',
            faIcon: 'fa-plane',
            aliases: ['/settings?tab=extra'],
          },
          { id: 'sick-reasons', label: 'Причины ухода на больничный', href: '/settings?tab=extra&dict=sick_reasons', faIcon: 'fa-briefcase-medical' },
        ],
      },
      {
        id: 'dict-assets',
        title: 'Имущество',
        items: [
          { id: 'inventory-types', label: 'Типы инвентаря', href: '/settings?tab=dictionaries&dict=inventory_types', faIcon: 'fa-tags' },
          { id: 'inventory', label: 'Инвентари', href: '/settings?tab=dictionaries&dict=inventory', faIcon: 'fa-box' },
          { id: 'cars', label: 'Список автомобилей', href: '/settings?tab=dictionaries&dict=cars', faIcon: 'fa-car' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Настройки',
    faIcon: 'fa-cog',
    prefixes: ['/settings', '/catalog', '/tenants'],
    groups: [
      {
        id: 'system',
        title: 'Система',
        items: [
          {
            id: 'system',
            label: 'Настройки системы',
            href: '/settings?tab=main',
            faIcon: 'fa-cog',
            aliases: ['/settings', '/settings?tab=admin', '/settings?tab=audit'],
          },
          { id: 'quickstart', label: 'Инструкции для быстрого запуска', href: '/settings/quickstart', faIcon: 'fa-rocket' },
          { id: 'tenants', label: 'Tenants', href: '/tenants', faIcon: 'fa-cloud', platformOnly: true },
        ],
      },
      {
        id: 'organization',
        title: 'Организация',
        items: [
          { id: 'hr-accounting', label: 'Кадровый учет', href: '/settings?tab=org', faIcon: 'fa-id-badge' },
          { id: 'organizations', label: 'Организации', href: '/settings/organizations', faIcon: 'fa-building' },
          { id: 'countries', label: 'Регионы', href: '/settings/countries', faIcon: 'fa-map-marked-alt' },
          { id: 'banks', label: 'Банки', href: '/settings/banks', faIcon: 'fa-university' },
        ],
      },
      {
        id: 'payroll-setup',
        title: 'Расчёт и счета',
        items: [
          { id: 'payroll-calc', label: 'Расчет зарплаты', href: '/settings/payroll-calc', faIcon: 'fa-calculator' },
          { id: 'accrual-types', label: 'Виды начислений', href: '/catalog/accrual-types', faIcon: 'fa-plus-circle' },
          { id: 'deduction-types', label: 'Виды удержаний', href: '/catalog/deduction-types', faIcon: 'fa-minus-circle' },
          { id: 'account-settings', label: 'Настройки счетов', href: '/settings/account-settings', faIcon: 'fa-sliders-h' },
          { id: 'account-pairs', label: 'Парные счета', href: '/catalog/account-pairs', faIcon: 'fa-link' },
          { id: 'coa', label: 'План счетов', href: '/catalog/coa', faIcon: 'fa-list-ol', aliases: ['/catalog/coa-main'] },
          { id: 'cashboxes', label: 'Кассы', href: '/catalog/cashboxes', faIcon: 'fa-money-bill-wave' },
          { id: 'currencies', label: 'Валюты', href: '/catalog/currencies', faIcon: 'fa-coins' },
          { id: 'avg-salaries', label: 'Средние зарплаты', href: '/catalog/avg-salaries', faIcon: 'fa-chart-bar' },
          { id: 'indicators', label: 'Показатели', href: '/catalog/indicators', faIcon: 'fa-chart-line' },
        ],
      },
      {
        id: 'builder',
        title: 'Шаблоны и метаданные',
        items: [
          { id: 'report-templates', label: 'Шаблоны отчетов', href: '/catalog/report-templates', faIcon: 'fa-file-alt' },
          { id: 'position-templates', label: 'Шаблоны должностей', href: '/catalog/position-templates', faIcon: 'fa-copy' },
          { id: 'facts', label: 'Факты', href: '/catalog/facts', faIcon: 'fa-database' },
          { id: 'fact-types', label: 'Типы фактов', href: '/catalog/fact-types', faIcon: 'fa-cubes' },
          { id: 'dynamic-fields', label: 'Динамические поля', href: '/catalog/dynamic-fields', faIcon: 'fa-puzzle-piece' },
          { id: 'dynamic-objects', label: 'Объекты', href: '/catalog/dynamic-objects', faIcon: 'fa-cube' },
          { id: 'dynamic-facts', label: 'Факты (метаданные)', href: '/catalog/dynamic-facts', faIcon: 'fa-project-diagram' },
        ],
      },
      {
        id: 'import',
        title: 'Импорт',
        items: [
          { id: 'photos', label: 'Загрузка фотографий сотрудников', href: '/settings/photos', faIcon: 'fa-camera' },
          { id: 'person-docs', label: 'Импорт персональных документов', href: '/settings/person-docs', faIcon: 'fa-upload' },
        ],
      },
    ],
  },
];

export const NAV_ITEMS: (NavItem & { section: NavSectionId; group: string })[] = NAV_SECTIONS.flatMap((s) =>
  s.groups.flatMap((g) => g.items.map((i) => ({ ...i, section: s.id, group: g.id }))),
);

/** Match strength of `href` for the current URL; -1 when it does not apply. */
export function hrefMatchScore(href: string, pathname: string, params: URLSearchParams): number {
  const [path, qs] = href.split('?');
  let score: number;
  if (pathname === path) score = path.length * 100 + 50;
  else if (path !== '/' && pathname.startsWith(`${path}/`)) score = path.length * 100;
  else return -1;
  if (qs) {
    for (const [k, v] of new URLSearchParams(qs).entries()) {
      if (params.get(k) !== v) return -1;
      score += 10;
    }
  }
  return score;
}

function toParams(search: string) {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/** Best matching nav item for a URL (href or alias), or null. */
export function findActiveNavItem(pathname: string, search = '') {
  const params = toParams(search);
  let best: (typeof NAV_ITEMS)[number] | null = null;
  let bestScore = -1;
  for (const item of NAV_ITEMS) {
    for (const href of [item.href, ...(item.aliases ?? [])]) {
      if (item.exact && pathname !== href.split('?')[0]) continue;
      const s = hrefMatchScore(href, pathname, params);
      if (s > bestScore) {
        bestScore = s;
        best = item;
      }
    }
  }
  return best;
}

/**
 * Page-top sibling links that belong to the current page: its own tabs, aliases and
 * child pages (same sidebar item), plus same-section pages that have no sidebar entry.
 * Links to other sidebar items are dropped — the sidebar already offers them.
 */
export function relatedSiblings<T extends { href: string }>(
  siblings: readonly T[],
  pathname: string,
  search = '',
): T[] {
  const current = findActiveNavItem(pathname, search);
  const section = findNavSection(pathname, search);
  return siblings.filter((s) => {
    const [path, qs = ''] = s.href.split('?');
    const target = findActiveNavItem(path, qs);
    if (target) return target === current;
    return section !== null && findNavSection(path, qs) === section;
  });
}

/** Owning section for a URL: matching item first, then the longest section prefix. */
export function findNavSection(pathname: string, search = ''): NavSectionId | null {
  const item = findActiveNavItem(pathname, search);
  if (item) return item.section;
  let best: NavSectionId | null = null;
  let len = 0;
  for (const s of NAV_SECTIONS) {
    for (const p of s.prefixes) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > len) {
        best = s.id;
        len = p.length;
      }
    }
  }
  return best;
}
