/**
 * Mega-menu — exact Verifix header menu clone
 * Source: output/run_20260725_222506/clone/pages/001_.../page.html (#kt_header_menu)
 * Keep: brand HR HUB + multi-tenant Tenants (platform only).
 * Nested page links (Физические лица, Типы отпуска, …) stay out of mega —
 * they open from inside list pages, same as Verifix.
 */

import { REPORTS_NAV } from './reports-nav';

export type MegaLink = {
  href: string;
  label: string;
  badge?: string;
  /** Short label for rich home cards */
  short?: string;
  description?: string;
  /** CSS gradient for icon tile: "from #a to #b" handled in shell */
  accent?: string;
  icon?: 'chart' | 'news' | 'devices';
  /** Font Awesome class without prefix, e.g. fa-users */
  faIcon?: string;
  /** CSS linear-gradient for colorful mega icon tile */
  iconAccent?: string;
};

export type MegaColumn = {
  title: string;
  items: MegaLink[];
};

export type MegaSection = {
  id: string;
  label: string;
  columns: MegaColumn[];
};

export const MEGA_NAV: MegaSection[] = [
  {
    id: 'home',
    label: 'Главная',
    columns: [
      {
        title: 'Раздел «Главная»',
        items: [
          {
            href: '/dashboard',
            label: 'Статистика посещений сотрудников',
            short: 'Статистика',
            description: 'Диаграмма, таблица явки и фильтры по дню',
            accent: 'chart',
            icon: 'chart',
          },
          {
            href: '/news',
            label: 'Новостная лента',
            short: 'Новости',
            description: 'Объявления, приказы и события компании',
            accent: 'news',
            icon: 'news',
          },
          {
            href: '/catalog/device-control',
            label: 'Удалённое управление устройствами',
            short: 'Устройства',
            description: 'Терминалы Face ID, синхронизация, статусы',
            accent: 'devices',
            icon: 'devices',
          },
        ],
      },
    ],
  },
  {
    id: 'hr',
    label: 'Кадры',
    columns: [
      {
        title: 'Главное',
        items: [
          {
            href: '/employees',
            label: 'Сотрудники',
            faIcon: 'fa-users',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)',
          },
          {
            href: '/catalog/hr-documents',
            label: 'Все кадровые документы',
            faIcon: 'fa-file-alt',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/transfers',
            label: 'Кадровые переводы',
            faIcon: 'fa-exchange-alt',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
          },
          {
            href: '/catalog/absences',
            label: 'Все отсутствия сотрудников',
            faIcon: 'fa-calendar-times',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          },
          {
            href: '/catalog/timesheet-adjustments',
            label: 'Корректировки табеля',
            faIcon: 'fa-th',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)',
          },
          {
            href: '/catalog/hr-requests',
            label: 'Заявки на кадровые изменения',
            faIcon: 'fa-file-signature',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/clearance-sheets',
            label: 'Обходные листы',
            faIcon: 'fa-clipboard-list',
            iconAccent: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
          },
          {
            href: '/catalog/wage-changes',
            label: 'Все изменения в оплате труда',
            faIcon: 'fa-money-bill-wave',
            iconAccent: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          },
          {
            href: '/catalog/incidents',
            label: 'Инциденты',
            faIcon: 'fa-exclamation-circle',
            iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
          },
        ],
      },
      {
        title: 'Организация',
        items: [
          {
            href: '/divisions?tab=divisions',
            label: 'Подразделения',
            faIcon: 'fa-sitemap',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)',
          },
          {
            href: '/positions?tab=positions',
            label: 'Должности',
            faIcon: 'fa-briefcase',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
          },
          {
            href: '/catalog/grades',
            label: 'Разряды',
            faIcon: 'fa-layer-group',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/staff-positions',
            label: 'Позиции',
            faIcon: 'fa-code-branch',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          },
          {
            href: '/catalog/staff-positions/structure',
            label: 'Оргструктура по позициям',
            faIcon: 'fa-project-diagram',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #d946ef 100%)',
          },
          {
            href: '/catalog/tariff-groups',
            label: 'Тарифные группы',
            faIcon: 'fa-percent',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/tariff-approvals',
            label: 'Утверждения тарифных групп',
            faIcon: 'fa-clipboard-check',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/grade-history',
            label: 'Повышение разрядов',
            faIcon: 'fa-chart-line',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          },
          {
            href: '/catalog/career-paths',
            label: 'Карьерный путь',
            faIcon: 'fa-route',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
          },
        ],
      },
      {
        title: 'Дашборд',
        items: [
          {
            href: '/catalog/dismissal-analytics',
            label: 'Причины увольнений',
            faIcon: 'fa-chart-line',
            iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
          },
          {
            href: '/catalog/personnel-changes',
            label: 'Кадровые изменения',
            faIcon: 'fa-exchange-alt',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)',
          },
          {
            href: '/catalog/personnel-changes?groupBy=position',
            label: 'Кадровые перемещения',
            faIcon: 'fa-chart-bar',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
          },
          {
            href: '/catalog/division-stats',
            label: 'Статистика работы подразделений',
            faIcon: 'fa-calendar-alt',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/year-summary',
            label: 'Итоги года',
            faIcon: 'fa-chart-area',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          },
        ],
      },
    ],
  },
  {
    id: 'attendance',
    label: 'Посещения',
    // Two side-by-side columns (empty titles → megaGrid, not flyout).
    columns: [
      {
        title: '',
        items: [
          {
            href: '/catalog/reports/attendance-overview',
            label: 'Отчет по посещениям сотрудников',
            faIcon: 'fa-clock',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)',
          },
          {
            href: '/catalog/reports/attendance-t13',
            label: 'Отчет по посещениям сотрудников (Т-13)',
            faIcon: 'fa-table',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/reports/marks-detail',
            label: 'Детальный отчет по отметкам',
            faIcon: 'fa-list-alt',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/reports/discipline',
            label: 'Отчет по дисциплине посещений',
            faIcon: 'fa-balance-scale',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          },
          {
            href: '/catalog/reports/division-mode?period=1',
            label: 'Отчет по режиму работы подразделения (период)',
            faIcon: 'fa-building',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/work-schedules',
            label: 'Графики работы',
            faIcon: 'fa-calendar-alt',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)',
          },
          {
            href: '/catalog/absence-requests',
            label: 'Запросы на отсутствие',
            faIcon: 'fa-calendar-minus',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #d946ef 100%)',
          },
          {
            href: '/catalog/schedule-change-requests',
            label: 'Запросы на изменение графика',
            faIcon: 'fa-exchange-alt',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)',
          },
          {
            href: '/catalog/internal-trips',
            label: 'Внутренние командировки',
            faIcon: 'fa-suitcase',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
          },
          {
            href: '/catalog/location-requests',
            label: 'Запросы на локацию',
            faIcon: 'fa-map-marker-alt',
            iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)',
          },
        ],
      },
      {
        title: '',
        items: [
          {
            href: '/catalog/overtime-requests',
            label: 'Запросы на сверхурочные',
            faIcon: 'fa-hourglass-half',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #f59e0b 100%)',
          },
          {
            href: '/catalog/locations',
            label: 'Локации',
            faIcon: 'fa-map',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #06b6d4 100%)',
          },
          {
            href: '/catalog/devices',
            label: 'Устройства',
            faIcon: 'fa-tablet-alt',
            iconAccent: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)',
          },
          {
            href: '/attendance/marks',
            label: 'Отметки',
            faIcon: 'fa-check-double',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #6366f1 100%)',
          },
          {
            href: '/catalog/schedule-overrides',
            label: 'Индивидуальные графики',
            faIcon: 'fa-user-edit',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/position-schedules',
            label: 'Индивидуальные графики для позиций',
            faIcon: 'fa-briefcase',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #7c3aed 100%)',
          },
          {
            href: '/catalog/rosters',
            label: 'Расписания',
            faIcon: 'fa-calendar',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)',
          },
          {
            href: '/catalog/roster-change-requests',
            label: 'Запросы на изменение расписания',
            faIcon: 'fa-random',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/schedule-shifts',
            label: 'Список смен расписания',
            faIcon: 'fa-clock',
            iconAccent: 'linear-gradient(135deg, #e11d48 0%, #7c3aed 100%)',
          },
        ],
      },
    ],
  },
  {
    id: 'payroll',
    label: 'Зарплата',
    columns: [
      {
        title: '',
        items: [
          {
            href: '/payroll/fine-policies',
            label: 'Политики штрафов',
            faIcon: 'fa-gavel',
            iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
          },
          {
            href: '/payroll/allowance-policies',
            label: 'Политики выплат',
            faIcon: 'fa-hand-holding-usd',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)',
          },
          {
            href: '/payroll/timesheets',
            label: 'Табель',
            faIcon: 'fa-calendar-check',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)',
          },
          {
            href: '/payroll/accruals',
            label: 'Все начисления',
            faIcon: 'fa-coins',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          },
          {
            href: '/catalog/settlements',
            label: 'Взаиморасчеты',
            faIcon: 'fa-balance-scale',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
          },
          {
            href: '/payroll/vedomost',
            label: 'Ведомость',
            faIcon: 'fa-file-invoice-dollar',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
          },
          {
            href: '/payroll/manual',
            label: 'Ручные операции',
            faIcon: 'fa-edit',
            iconAccent: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
          },
          {
            href: '/catalog/gph-services',
            label: 'Список услуг договора ГПХ',
            faIcon: 'fa-file-contract',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)',
          },
          {
            href: '/catalog/sales-accruals',
            label: 'Начисления процентов от продаж',
            faIcon: 'fa-chart-pie',
            iconAccent: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          },
          {
            href: '/catalog/one-time-accruals',
            label: 'Разовые начисления',
            faIcon: 'fa-bolt',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #d946ef 100%)',
          },
          {
            href: '/catalog/loans',
            label: 'Займы',
            faIcon: 'fa-university',
            iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)',
          },
          {
            href: '/catalog/payment-orders',
            label: 'Поручения',
            faIcon: 'fa-file-signature',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/travel-expenses',
            label: 'Авансовый отчет по командировке',
            faIcon: 'fa-plane',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)',
          },
          {
            href: '/catalog/bonus-accruals',
            label: 'Бонусные начисления',
            faIcon: 'fa-gift',
            iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)',
          },
        ],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Отчетность',
    columns: REPORTS_NAV,
  },
  {
    id: 'settings',
    label: 'Настройки',
    columns: [
      {
        title: 'Главное',
        items: [
          { href: '/settings?tab=main', label: 'Настройки системы', faIcon: 'fa-cog', iconAccent: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)' },
          { href: '/catalog/absence-types', label: 'Виды отсутствий', faIcon: 'fa-calendar-times', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
          { href: '/catalog/time-types', label: 'Виды рабочего времени', faIcon: 'fa-clock', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)' },
          { href: '/settings?tab=org', label: 'Кадровый учет', faIcon: 'fa-id-badge', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          { href: '/settings/payroll-calc', label: 'Расчет зарплаты', faIcon: 'fa-calculator', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)' },
          { href: '/catalog/report-templates', label: 'Шаблоны отчетов', faIcon: 'fa-file-alt', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)' },
          { href: '/catalog/position-templates', label: 'Шаблоны должностей', faIcon: 'fa-copy', iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)' },
          { href: '/catalog/facts', label: 'Факты', faIcon: 'fa-database', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          { href: '/catalog/fact-types', label: 'Типы фактов', faIcon: 'fa-cubes', iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)' },
          { href: '/catalog/dynamic-fields', label: 'Динамические поля', faIcon: 'fa-puzzle-piece', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #7c3aed 100%)' },
          { href: '/catalog/dynamic-objects', label: 'Объекты', faIcon: 'fa-cube', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #6366f1 100%)' },
          { href: '/catalog/dynamic-facts', label: 'Факты (метаданные)', faIcon: 'fa-project-diagram', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #0a85e2 100%)' },
          { href: '/news', label: 'Новостная лента', faIcon: 'fa-newspaper', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
        ],
      },
      {
        title: 'Организация',
        items: [
          { href: '/catalog/accrual-types', label: 'Начисления', faIcon: 'fa-plus-circle', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)' },
          { href: '/catalog/deduction-types', label: 'Удержания', faIcon: 'fa-minus-circle', iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)' },
          { href: '/settings/account-settings', label: 'Настройки счетов', faIcon: 'fa-sliders-h', iconAccent: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)' },
          { href: '/catalog/account-pairs', label: 'Парные счета', faIcon: 'fa-link', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          {
            href: '/catalog/reports/account-balance',
            label: 'Оборотно-сальдовая ведомость по счету',
            faIcon: 'fa-file-invoice',
            iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
          },
          { href: '/catalog/reports/trial-balance', label: 'Оборотно-сальдовая ведомость', faIcon: 'fa-balance-scale', iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)' },
        ],
      },
      {
        title: 'Справочники',
        items: [
          { href: '/catalog/education-types', label: 'Виды образования', faIcon: 'fa-graduation-cap', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          { href: '/catalog/institutions', label: 'Учебные заведения', faIcon: 'fa-university', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)' },
          { href: '/catalog/specialties', label: 'Специальности', faIcon: 'fa-user-graduate', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #7c3aed 100%)' },
          { href: '/catalog/persons', label: 'Физические лица', faIcon: 'fa-address-card', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)' },
          { href: '/catalog/document-types', label: 'Типы документов', faIcon: 'fa-file', iconAccent: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)' },
          {
            href: '/catalog/hire-document-exceptions',
            label: 'Исключения по документам при приеме',
            faIcon: 'fa-exclamation-triangle',
            iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          },
          {
            href: '/settings?tab=dictionaries&dict=labor_functions',
            label: 'Трудовые функции',
            faIcon: 'fa-briefcase',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
          },
          { href: '/settings?tab=dictionaries&dict=science', label: 'Отрасли наук', faIcon: 'fa-flask', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)' },
          { href: '/settings?tab=dictionaries&dict=languages', label: 'Языки', faIcon: 'fa-language', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          {
            href: '/settings?tab=dictionaries&dict=lang_levels',
            label: 'Степени знания языка',
            faIcon: 'fa-signal',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #6366f1 100%)',
          },
          { href: '/settings?tab=dictionaries&dict=certificates', label: 'Виды справок', faIcon: 'fa-certificate', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #0a85e2 100%)' },
          { href: '/settings?tab=dictionaries&dict=kinship', label: 'Степени родства', faIcon: 'fa-home', iconAccent: 'linear-gradient(135deg, #e11d48 0%, #7c3aed 100%)' },
          { href: '/settings?tab=dictionaries&dict=marital', label: 'Состояния в браке', faIcon: 'fa-heart', iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)' },
          { href: '/settings?tab=dictionaries&dict=tenure', label: 'Виды стажа', faIcon: 'fa-hourglass-half', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)' },
          { href: '/settings?tab=dictionaries&dict=awards', label: 'Награды', faIcon: 'fa-medal', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
          { href: '/settings?tab=dictionaries&dict=inventory_types', label: 'Типы инвентаря', faIcon: 'fa-tags', iconAccent: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)' },
          { href: '/settings?tab=dictionaries&dict=inventory', label: 'Инвентари', faIcon: 'fa-box', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)' },
          { href: '/settings?tab=dictionaries&dict=cars', label: 'Список автомобилей', faIcon: 'fa-car', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
        ],
      },
      {
        title: 'Дополнительные справочники',
        items: [
          {
            href: '/settings?tab=extra&dict=trip_reasons',
            label: 'Причины ухода в командировку',
            faIcon: 'fa-plane',
            iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)',
          },
          {
            href: '/settings?tab=extra&dict=sick_reasons',
            label: 'Причины ухода на больничный',
            faIcon: 'fa-briefcase-medical',
            iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)',
          },
          { href: '/catalog/dismissal-reasons', label: 'Причины увольнения', faIcon: 'fa-user-times', iconAccent: 'linear-gradient(135deg, #e11d48 0%, #7c3aed 100%)' },
          {
            href: '/catalog/employment-sources',
            label: 'Источники занятости',
            faIcon: 'fa-search',
            iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)',
          },
          { href: '/catalog/indicators', label: 'Показатели', faIcon: 'fa-chart-line', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          { href: '/catalog/avg-salaries', label: 'Средние зарплаты', faIcon: 'fa-chart-bar', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #f59e0b 100%)' },
          { href: '/catalog/coa', label: 'План счетов', faIcon: 'fa-list-ol', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)' },
          { href: '/catalog/cashboxes', label: 'Кассы', faIcon: 'fa-money-bill-wave', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #0e9f6e 100%)' },
          { href: '/catalog/currencies', label: 'Валюты', faIcon: 'fa-coins', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #0a85e2 100%)' },
          { href: '/catalog/nationality', label: 'Национальность', faIcon: 'fa-globe', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)' },
        ],
      },
      {
        title: 'Внешние системы',
        items: [
          { href: '/settings/artix', label: 'Настройки ARTIX', faIcon: 'fa-plug', iconAccent: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)' },
          { href: '/settings/iiko', label: 'Настройки IIKO', faIcon: 'fa-utensils', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)' },
          { href: '/settings/iiko-sales', label: 'Продажи IIKO', faIcon: 'fa-receipt', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0e9f6e 100%)' },
          { href: '/settings/billz', label: 'Настройки Billz 2.0', faIcon: 'fa-store', iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)' },
          { href: '/settings/billz-sales', label: 'Продажи Billz 1.0', faIcon: 'fa-shopping-bag', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #7c3aed 100%)' },
          { href: '/settings/telegram', label: 'Telegram Bot', faIcon: 'fa-paper-plane', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #06b6d4 100%)' },
          { href: '/settings?tab=integrations&sys=onec', label: '1С:Предприятие', faIcon: 'fa-server', iconAccent: 'linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)' },
          { href: '/settings?tab=integrations&sys=esign', label: 'Электронная подпись', faIcon: 'fa-pen', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          { href: '/settings?tab=integrations&sys=mehnat', label: 'Mehnat.gov.uz', faIcon: 'fa-landmark', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #6366f1 100%)' },
        ],
      },
      {
        title: 'Администрирование',
        items: [
          { href: '/settings/organizations', label: 'Организации', faIcon: 'fa-building', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
          { href: '/settings/users', label: 'Пользователи', faIcon: 'fa-users-cog', iconAccent: 'linear-gradient(135deg, #7c3aed 0%, #0a85e2 100%)' },
          { href: '/settings/countries', label: 'Регионы', faIcon: 'fa-map-marked-alt', iconAccent: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)' },
          { href: '/settings/banks', label: 'Банки', faIcon: 'fa-university', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)' },
          { href: '/settings/quickstart', label: 'Инструкции для быстрого запуска', faIcon: 'fa-rocket', iconAccent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
          { href: '/settings/photos', label: 'Загрузка фотографий сотрудников', faIcon: 'fa-camera', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)' },
          { href: '/settings/person-docs', label: 'Импорт персональных документов', faIcon: 'fa-upload', iconAccent: 'linear-gradient(135deg, #06b6d4 0%, #7c3aed 100%)' },
          { href: '/settings/audit', label: 'Аудит', faIcon: 'fa-history', iconAccent: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)' },
          { href: '/tenants', label: 'Tenants', badge: 'platform', faIcon: 'fa-cloud', iconAccent: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)' },
        ],
      },
    ],
  },
];

export function findSectionByPath(pathname: string, search = ''): string | null {
  const full = search
    ? `${pathname}${search.startsWith('?') ? search : `?${search}`}`
    : pathname;
  for (const sec of MEGA_NAV) {
    for (const col of sec.columns) {
      for (const item of col.items) {
        const base = item.href.split('?')[0];
        if (pathname === base || pathname.startsWith(base + '/')) return sec.id;
        if (item.href.includes('?') && full.includes(item.href.split('?')[1].split('&')[0])) {
          return sec.id;
        }
      }
    }
  }
  if (pathname === '/dashboard') return 'home';
  if (pathname === '/news' || pathname.startsWith('/news/')) return 'settings';
  if (
    pathname.startsWith('/catalog/work-schedules') ||
    pathname.startsWith('/catalog/production-calendars') ||
    pathname.startsWith('/catalog/absence-requests') ||
    pathname.startsWith('/catalog/absence-types') ||
    pathname.startsWith('/catalog/time-types') ||
    pathname.startsWith('/catalog/schedule-change-requests') ||
    pathname.startsWith('/catalog/roster-change-requests') ||
    pathname.startsWith('/catalog/schedule-overrides') ||
    pathname.startsWith('/catalog/position-schedules') ||
    pathname.startsWith('/catalog/rosters') ||
    pathname.startsWith('/catalog/schedule-shifts') ||
    pathname.startsWith('/catalog/internal-trips') ||
    pathname.startsWith('/catalog/location-requests') ||
    pathname.startsWith('/catalog/overtime-requests') ||
    pathname.startsWith('/catalog/location-types') ||
    pathname.startsWith('/catalog/locations') ||
    pathname.startsWith('/catalog/devices') ||
    pathname.startsWith('/catalog/gps-tracks') ||
    pathname.startsWith('/catalog/time-types')
  ) {
    return 'attendance';
  }
  if (pathname.startsWith('/catalog/reports')) {
    if (pathname.includes('account-balance') || pathname.includes('trial-balance')) return 'settings';
    if (
      pathname.includes('/reports/payroll-book') ||
      pathname.includes('/reports/payroll-grouped') ||
      pathname.includes('/reports/payments') ||
      pathname.includes('/reports/division-expenses') ||
      pathname.includes('/reports/fot') ||
      pathname.includes('/reports/one-time') ||
      pathname.includes('/reports/preliminary-salary') ||
      pathname.includes('/reports/penalties')
    ) {
      return 'payroll';
    }
    if (
      pathname.includes('attendance-overview') ||
      pathname.includes('attendance-t13') ||
      pathname.includes('/reports/marks-detail') ||
      pathname.includes('/reports/distance') ||
      pathname.includes('/reports/hourly') ||
      pathname.includes('/reports/shifts') ||
      pathname.includes('/reports/multi-shift') ||
      pathname.includes('/reports/time-types') ||
      pathname.includes('/reports/lateness') ||
      pathname.includes('/reports/schedules') ||
      pathname.includes('/reports/discipline') ||
      pathname.includes('/reports/division-mode')
    ) {
      return 'attendance';
    }
    return 'reports';
  }
  if (pathname.startsWith('/catalog')) return 'hr';
  if (pathname.startsWith('/employees') || pathname.startsWith('/divisions')) return 'hr';
  if (pathname.startsWith('/attendance')) return 'attendance';
  if (pathname.startsWith('/payroll')) return 'payroll';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/settings') || pathname.startsWith('/tenants')) return 'settings';
  return null;
}
