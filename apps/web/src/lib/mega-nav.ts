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
        title: '',
        items: [
          {
            href: '/dashboard',
            label: 'Статистика посещений сотрудников',
          },
          {
            href: '/news',
            label: 'Новостная лента',
          },
          {
            href: '/catalog/device-control',
            label: 'Удалённое управление устройствами',
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
          { href: '/employees', label: 'Сотрудники' },
          { href: '/catalog/hr-documents', label: 'Все кадровые документы' },
          { href: '/catalog/transfers', label: 'Кадровые переводы' },
          { href: '/catalog/absences', label: 'Все отсутствия сотрудников' },
          { href: '/catalog/timesheet-adjustments', label: 'Корректировки табеля' },
          {
            href: '/catalog/hr-requests',
            label: 'Заявки на кадровые изменения',
          },
          { href: '/catalog/clearance-sheets', label: 'Обходные листы' },
          { href: '/catalog/wage-changes', label: 'Все изменения в оплате труда' },
          { href: '/catalog/incidents', label: 'Инциденты' },
        ],
      },
      {
        title: 'Организация',
        items: [
          { href: '/divisions?tab=divisions', label: 'Подразделения' },
          { href: '/positions?tab=positions', label: 'Должности' },
          { href: '/catalog/grades', label: 'Разряды' },
          { href: '/catalog/staff-positions', label: 'Позиции' },
          { href: '/catalog/staff-positions/structure', label: 'Оргструктура по позициям' },
          { href: '/catalog/tariff-groups', label: 'Тарифные группы' },
          { href: '/catalog/tariff-approvals', label: 'Утверждения тарифных групп' },
          { href: '/catalog/grade-history', label: 'Повышение разрядов' },
          { href: '/catalog/career-paths', label: 'Карьерный путь' },
        ],
      },
      {
        title: 'Дашборд',
        items: [
          { href: '/catalog/dismissal-analytics', label: 'Причины увольнений' },
          { href: '/catalog/personnel-changes', label: 'Кадровые изменения' },
          { href: '/catalog/personnel-changes?groupBy=position', label: 'Кадровые перемещения' },
          { href: '/catalog/division-stats', label: 'Статистика работы подразделений' },
          { href: '/catalog/year-summary', label: 'Итоги года' },
        ],
      },
    ],
  },
  {
    id: 'attendance',
    label: 'Посещения',
    columns: [
      {
        // Verifix: flat top-level only. Nested pages (Производственные календари,
        // Виды отсутствий, Типы локаций, …) open from PageSubnav tabs on list pages.
        title: '',
        items: [
          { href: '/catalog/reports/attendance-overview', label: 'Отчет по посещениям сотрудников' },
          { href: '/catalog/reports/attendance-t13', label: 'Отчет по посещениям сотрудников (Т-13)' },
          { href: '/catalog/reports/marks-detail', label: 'Детальный отчет по отметкам' },
          { href: '/catalog/reports/discipline', label: 'Отчет по дисциплине посещений' },
          {
            href: '/catalog/reports/division-mode?period=1',
            label: 'Отчет по режиму работы подразделения (период)',
          },
          { href: '/catalog/work-schedules', label: 'Графики работы' },
          { href: '/catalog/absence-requests', label: 'Запросы на отсутствие' },
          { href: '/catalog/schedule-change-requests', label: 'Запросы на изменение графика' },
          { href: '/catalog/internal-trips', label: 'Внутренние командировки' },
          { href: '/catalog/location-requests', label: 'Запросы на локацию' },
          { href: '/catalog/overtime-requests', label: 'Запросы на сверхурочные' },
          { href: '/catalog/locations', label: 'Локации' },
          { href: '/catalog/devices', label: 'Устройства' },
          { href: '/attendance/marks', label: 'Отметки' },
          { href: '/catalog/schedule-overrides', label: 'Индивидуальные графики' },
          {
            href: '/catalog/position-schedules',
            label: 'Индивидуальные графики для позиций',
          },
          { href: '/catalog/rosters', label: 'Расписания' },
          {
            href: '/catalog/roster-change-requests',
            label: 'Запросы на изменение расписания',
          },
          { href: '/catalog/schedule-shifts', label: 'Список смен расписания' },
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
          { href: '/payroll/fine-policies', label: 'Политики штрафов' },
          { href: '/payroll/allowance-policies', label: 'Политики выплат' },
          { href: '/payroll/timesheets', label: 'Табель' },
          { href: '/payroll/accruals', label: 'Все начисления' },
          { href: '/catalog/settlements', label: 'Взаиморасчеты' },
          { href: '/payroll/vedomost', label: 'Ведомость' },
          { href: '/payroll/manual', label: 'Ручные операции' },
          { href: '/catalog/gph-services', label: 'Список услуг договора ГПХ' },
          { href: '/catalog/sales-accruals', label: 'Начисления процентов от продаж' },
          { href: '/catalog/one-time-accruals', label: 'Разовые начисления' },
          { href: '/catalog/loans', label: 'Займы' },
          { href: '/catalog/payment-orders', label: 'Поручения' },
          { href: '/catalog/travel-expenses', label: 'Авансовый отчет по командировке' },
          { href: '/catalog/bonus-accruals', label: 'Бонусные начисления' },
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
          { href: '/settings?tab=main', label: 'Настройки системы' },
          { href: '/catalog/absence-types', label: 'Виды отсутствий' },
      { href: '/catalog/time-types', label: 'Виды рабочего времени' },
          { href: '/settings?tab=org', label: 'Кадровый учет' },
          { href: '/settings/payroll-calc', label: 'Расчет зарплаты' },
          { href: '/catalog/report-templates', label: 'Шаблоны отчетов' },
          { href: '/catalog/position-templates', label: 'Шаблоны должностей' },
          { href: '/catalog/facts', label: 'Факты' },
          { href: '/catalog/fact-types', label: 'Типы фактов' },
          { href: '/catalog/dynamic-fields', label: 'Динамические поля' },
          { href: '/catalog/dynamic-objects', label: 'Объекты' },
          { href: '/catalog/dynamic-facts', label: 'Факты (метаданные)' },
          { href: '/news', label: 'Новостная лента' },
        ],
      },
      {
        title: 'Организация',
        items: [
          { href: '/catalog/accrual-types', label: 'Начисления' },
          { href: '/catalog/deduction-types', label: 'Удержания' },
          { href: '/settings/account-settings', label: 'Настройки счетов' },
          { href: '/catalog/account-pairs', label: 'Парные счета' },
          {
            href: '/catalog/reports/account-balance',
            label: 'Оборотно-сальдовая ведомость по счету',
          },
          { href: '/catalog/reports/trial-balance', label: 'Оборотно-сальдовая ведомость' },
        ],
      },
      {
        title: 'Справочники',
        items: [
          { href: '/catalog/education-types', label: 'Виды образования' },
          { href: '/catalog/institutions', label: 'Учебные заведения' },
          { href: '/catalog/specialties', label: 'Специальности' },
          { href: '/catalog/persons', label: 'Физические лица' },
          { href: '/catalog/document-types', label: 'Типы документов' },
          {
            href: '/catalog/hire-document-exceptions',
            label: 'Исключения по документам при приеме',
          },
          {
            href: '/settings?tab=dictionaries&dict=labor_functions',
            label: 'Трудовые функции',
          },
          { href: '/settings?tab=dictionaries&dict=science', label: 'Отрасли наук' },
          { href: '/settings?tab=dictionaries&dict=languages', label: 'Языки' },
          {
            href: '/settings?tab=dictionaries&dict=lang_levels',
            label: 'Степени знания языка',
          },
          { href: '/settings?tab=dictionaries&dict=certificates', label: 'Виды справок' },
          { href: '/settings?tab=dictionaries&dict=kinship', label: 'Степени родства' },
          { href: '/settings?tab=dictionaries&dict=marital', label: 'Состояния в браке' },
          { href: '/settings?tab=dictionaries&dict=tenure', label: 'Виды стажа' },
          { href: '/settings?tab=dictionaries&dict=awards', label: 'Награды' },
          { href: '/settings?tab=dictionaries&dict=inventory_types', label: 'Типы инвентаря' },
          { href: '/settings?tab=dictionaries&dict=inventory', label: 'Инвентари' },
          { href: '/settings?tab=dictionaries&dict=cars', label: 'Список автомобилей' },
        ],
      },
      {
        title: 'Дополнительные справочники',
        items: [
          {
            href: '/settings?tab=extra&dict=trip_reasons',
            label: 'Причины ухода в командировку',
          },
          {
            href: '/settings?tab=extra&dict=sick_reasons',
            label: 'Причины ухода на больничный',
          },
          { href: '/catalog/dismissal-reasons', label: 'Причины увольнения' },
          {
            href: '/catalog/employment-sources',
            label: 'Источники занятости',
          },
          { href: '/catalog/indicators', label: 'Показатели' },
          { href: '/catalog/avg-salaries', label: 'Средние зарплаты' },
          { href: '/catalog/coa', label: 'План счетов' },
          { href: '/catalog/cashboxes', label: 'Кассы' },
          { href: '/catalog/currencies', label: 'Валюты' },
          { href: '/catalog/nationality', label: 'Национальность' },
        ],
      },
      {
        title: 'Внешние системы',
        items: [
          { href: '/settings/artix', label: 'Настройки ARTIX' },
          { href: '/settings/iiko', label: 'Настройки IIKO' },
          { href: '/settings/iiko-sales', label: 'Продажи IIKO' },
          { href: '/settings/billz', label: 'Настройки Billz 2.0' },
          { href: '/settings/billz-sales', label: 'Продажи Billz 1.0' },
          { href: '/settings?tab=integrations&sys=onec', label: '1С:Предприятие' },
          { href: '/settings?tab=integrations&sys=esign', label: 'Электронная подпись' },
          { href: '/settings?tab=integrations&sys=mehnat', label: 'Mehnat.gov.uz' },
        ],
      },
      {
        title: 'Администрирование',
        items: [
          { href: '/settings/organizations', label: 'Организации' },
          { href: '/settings/users', label: 'Пользователи' },
          { href: '/settings/countries', label: 'Регионы' },
          { href: '/settings/banks', label: 'Банки' },
          { href: '/settings/quickstart', label: 'Инструкции для быстрого запуска' },
          { href: '/settings/photos', label: 'Загрузка фотографий сотрудников' },
          { href: '/settings/person-docs', label: 'Импорт персональных документов' },
          { href: '/settings?tab=audit', label: 'Аудит' },
          { href: '/tenants', label: 'Tenants', badge: 'platform' },
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
