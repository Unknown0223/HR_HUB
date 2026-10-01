/**
 * Single source of truth for every report screen: the /reports hub, the sidebar
 * «Отчёты» section, page titles and roleAccess grant keys (`href` is the key).
 * Descriptions mirror each page's own subtitle.
 */

export type ReportCategoryId = 'hr' | 'attendance' | 'payroll' | 'finance' | 'analytics' | 'quick';

export type ReportCategory = { id: ReportCategoryId; label: string; faIcon: string };

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  category: ReportCategoryId;
  href: string;
  faIcon: string;
  /** Extra search terms (abbreviations, synonyms). */
  keywords?: string[];
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  { id: 'hr', label: 'Кадры', faIcon: 'fa-users' },
  { id: 'attendance', label: 'Посещаемость', faIcon: 'fa-user-clock' },
  { id: 'payroll', label: 'Зарплата', faIcon: 'fa-wallet' },
  { id: 'finance', label: 'Финансы', faIcon: 'fa-balance-scale' },
  { id: 'analytics', label: 'Аналитика', faIcon: 'fa-chart-line' },
  { id: 'quick', label: 'Быстрые отчёты', faIcon: 'fa-bolt' },
];

/** localStorage key: ids of recently opened reports, newest first. */
export const RECENT_REPORTS_KEY = 'hrhub.reports.recent';

export const REPORTS: ReportDefinition[] = [
  // Кадры
  { id: 'staffing', category: 'hr', href: '/catalog/reports/staffing', faIcon: 'fa-sitemap', title: 'Отчет по штатному расписанию', description: 'Штатные единицы, ставки, вакансии и фонд оплаты по подразделениям и должностям', keywords: ['штат'] },
  { id: 'gender', category: 'hr', href: '/catalog/reports/gender', faIcon: 'fa-venus-mars', title: 'Отчет по гендерному разделению сотрудников', description: 'Распределение сотрудников по полу в разрезе возраста, опыта, разряда или образования', keywords: ['пол'] },
  { id: 'movement-divisions', category: 'hr', href: '/catalog/reports/movement-divisions', faIcon: 'fa-exchange-alt', title: 'Отчет по движению сотрудников (подразделения)', description: 'Приём, увольнения и перемещения по подразделениям за выбранный период' },
  { id: 'dismissals-by-division', category: 'hr', href: '/catalog/reports/dismissals-by-division', faIcon: 'fa-building', title: 'Отчет увольнений по подразделениям', description: 'Матрица увольнений: должности × подразделения за выбранный период' },
  { id: 'dismissals-by-reason', category: 'hr', href: '/catalog/reports/dismissals-by-reason', faIcon: 'fa-user-times', title: 'Отчет по причинам увольнения', description: 'Статистика увольнений по причинам и группам причин за период' },
  { id: 'positions', category: 'hr', href: '/catalog/reports/positions', faIcon: 'fa-briefcase', title: 'Отчет по позициям', description: 'Запланированные, занятые и доступные позиции по подразделениям и должностям' },
  { id: 'grade-changes', category: 'hr', href: '/catalog/reports/grade-changes', faIcon: 'fa-layer-group', title: 'Отчет по изменению разрядов', description: 'История изменений разрядов сотрудников по подразделениям и позициям' },
  { id: 'timesheet-adjustments', category: 'hr', href: '/catalog/reports/timesheet-adjustments', faIcon: 'fa-th', title: 'Отчет по корректировке табеля', description: 'Количество сотрудников с корректировкой фактов табеля по подразделениям и дням' },
  { id: 'movement-staff', category: 'hr', href: '/catalog/reports/movement-staff', faIcon: 'fa-users', title: 'Отчет по движению сотрудников (штаты)', description: 'Приёмы, увольнения, перемещения и повторные приёмы за период' },
  { id: 'candidates', category: 'hr', href: '/catalog/reports/candidates', faIcon: 'fa-user-plus', title: 'Отчет по кандидатам', description: 'Кандидаты за период с фильтрами по должности, типу, источнику и полу', keywords: ['подбор'] },
  { id: 'vacancies', category: 'hr', href: '/catalog/reports/vacancies', faIcon: 'fa-door-open', title: 'Отчет по вакантным позициям', description: 'Вакантные штатные позиции на выбранную дату', keywords: ['вакансии'] },
  { id: 'schedule-plan', category: 'hr', href: '/catalog/reports/schedule-plan', faIcon: 'fa-calendar-check', title: 'Отчет по плану графиков', description: 'План рабочих дней и выходных сотрудников за период' },
  { id: 'occupancy', category: 'hr', href: '/catalog/reports/occupancy', faIcon: 'fa-chart-pie', title: 'Отчет по занятости', description: 'Занятость позиций с группировкой на выбранную дату' },
  { id: 'employees', category: 'hr', href: '/catalog/reports/employees', faIcon: 'fa-id-card', title: 'Отчет по сотрудникам', description: 'Список сотрудников с кадровыми, контактными и образовательными данными' },
  { id: 'tenure', category: 'hr', href: '/catalog/reports/tenure', faIcon: 'fa-hourglass-half', title: 'Отчет по стажам', description: 'Стаж сотрудников и соответствие начислений заданным правилам' },
  { id: 'grades', category: 'hr', href: '/catalog/reports/grades', faIcon: 'fa-chart-bar', title: 'Отчет по разрядам', description: 'Текущие и предыдущие разряды сотрудников на выбранную дату' },
  { id: 'relatives', category: 'hr', href: '/catalog/reports/relatives', faIcon: 'fa-users', title: 'Сотрудники и их родственники', description: 'Состав семьи сотрудников: степень родства, возраст и зависимость' },
  { id: 'access', category: 'hr', href: '/catalog/reports/access', faIcon: 'fa-key', title: 'Отчет по доступам сотрудников', description: 'Полный и пользовательский доступ, подчинённые подразделения и КПЭ', keywords: ['доступ', 'права'] },

  // Посещаемость
  { id: 'attendance-overview', category: 'attendance', href: '/catalog/reports/attendance-overview', faIcon: 'fa-clock', title: 'Отчет по посещениям сотрудников', description: 'Сводка явок, опозданий и отсутствий сотрудников по дням выбранного периода' },
  { id: 'discipline', category: 'attendance', href: '/catalog/reports/discipline', faIcon: 'fa-balance-scale', title: 'Отчет по дисциплине посещений', description: 'Опоздания, ранние уходы и нарушения графика с детализацией по сотрудникам' },
  { id: 'division-mode-period', category: 'attendance', href: '/catalog/reports/division-mode?period=1', faIcon: 'fa-building', title: 'Отчет по режиму работы подразделений (период)', description: 'Режим работы подразделений за период: плановые и фактические часы, отсутствия' },
  { id: 'division-mode', category: 'attendance', href: '/catalog/reports/division-mode', faIcon: 'fa-city', title: 'Отчет по режиму работы подразделений', description: 'Режим работы подразделений: плановые и фактические часы, отсутствия по дням' },
  { id: 'attendance-t13', category: 'attendance', href: '/catalog/reports/attendance-t13', faIcon: 'fa-table', title: 'Отчет по посещениям сотрудников (Т-13)', description: 'Табель учета рабочего времени по форме Т-13: явки, отсутствия и итоги за период', keywords: ['т13', 't-13', 'табель'] },
  { id: 'marks-detail', category: 'attendance', href: '/catalog/reports/marks-detail', faIcon: 'fa-list-alt', title: 'Детальный отчет по отметкам', description: 'Детализация отметок посещений за выбранную дату: сотрудники, время и место отметки' },
  { id: 'distance', category: 'attendance', href: '/catalog/reports/distance', faIcon: 'fa-road', title: 'Отчет по пройденному расстоянию', description: 'Пройденное расстояние сотрудников за период', keywords: ['gps'] },
  { id: 'hourly', category: 'attendance', href: '/catalog/reports/hourly', faIcon: 'fa-clock', title: 'Почасовой отчет по посещениям', description: 'Фактические часы посещений по сотрудникам за период' },
  { id: 'shifts', category: 'attendance', href: '/catalog/reports/shifts', faIcon: 'fa-history', title: 'Отчет посещений сотрудников по сменам', description: 'План, факт и отметки посещений сотрудников по сменам' },
  { id: 'shifts-v2', category: 'attendance', href: '/catalog/reports/shifts?variant=2', faIcon: 'fa-clone', title: 'Отчет по сменам (второй вариант)', description: 'Альтернативный вариант отчёта посещений по сменам' },
  { id: 'multi-shift', category: 'attendance', href: '/catalog/reports/multi-shift', faIcon: 'fa-layer-group', title: 'Отчет посещений по многосменным графикам', description: 'Посещения сотрудников на многосменных графиках' },
  { id: 'time-types', category: 'attendance', href: '/catalog/reports/time-types', faIcon: 'fa-tags', title: 'Отчет по видам времени', description: 'Часы по видам времени с детализацией по сотрудникам и дням' },
  { id: 'lateness', category: 'attendance', href: '/catalog/reports/lateness', faIcon: 'fa-exclamation-circle', title: 'Отчет по опозданиям', description: 'Опоздания сотрудников с суммами по правилам времени или минут' },
  { id: 'schedules', category: 'attendance', href: '/catalog/reports/schedules', faIcon: 'fa-calendar', title: 'Отчет по расписанию', description: 'Графики работы сотрудников по дням периода' },

  // Зарплата
  { id: 'payroll-book', category: 'payroll', href: '/catalog/reports/payroll-book', faIcon: 'fa-book', title: 'Книга начисления заработной платы', description: 'Книга начисления заработной платы за месяц' },
  { id: 'payroll-grouped', category: 'payroll', href: '/catalog/reports/payroll-grouped', faIcon: 'fa-object-group', title: 'Итоговый отчет по начислениям с группировками', description: 'Сгруппированная ведомость начислений и удержаний' },
  { id: 'payments', category: 'payroll', href: '/catalog/reports/payments', faIcon: 'fa-money-check-alt', title: 'Отчет по оплатам', description: 'Оплаты сотрудникам наличными и безналичными за период' },
  { id: 'division-expenses', category: 'payroll', href: '/catalog/reports/division-expenses', faIcon: 'fa-chart-line', title: 'Расходы по подразделениям', description: 'Затраты подразделений по дням и видам' },
  { id: 'fot', category: 'payroll', href: '/catalog/reports/fot', faIcon: 'fa-wallet', title: 'ФОТ отчет', description: 'Фонд оплаты труда по сотрудникам и локациям', keywords: ['фот', 'фонд оплаты'] },
  { id: 'one-time', category: 'payroll', href: '/catalog/reports/one-time', faIcon: 'fa-bolt', title: 'Отчет по разовым начислениям', description: 'Разовые начисления и удержания' },
  { id: 'preliminary-salary', category: 'payroll', href: '/catalog/reports/preliminary-salary', faIcon: 'fa-file-invoice-dollar', title: 'Отчет по предварительному окладу', description: 'Предварительный расчёт зарплаты за месяц' },
  { id: 'penalties', category: 'payroll', href: '/catalog/reports/penalties', faIcon: 'fa-gavel', title: 'Отчет по штрафам', description: 'Штрафы по дням за выбранный период' },

  // Финансы
  { id: 'account-balance', category: 'finance', href: '/catalog/reports/account-balance', faIcon: 'fa-file-invoice', title: 'Оборотно-сальдовая ведомость по счету', description: 'Обороты и сальдо по выбранному счёту за период', keywords: ['осв'] },
  { id: 'trial-balance', category: 'finance', href: '/catalog/reports/trial-balance', faIcon: 'fa-balance-scale', title: 'Оборотно-сальдовая ведомость', description: 'Обороты и сальдо по счетам плана счетов за период', keywords: ['осв'] },

  // Аналитика (dashboards)
  { id: 'division-stats', category: 'analytics', href: '/catalog/division-stats', faIcon: 'fa-chart-area', title: 'Статистика работы подразделений', description: 'Открытие и закрытие подразделений, соответствие режиму работы' },
  { id: 'year-summary', category: 'analytics', href: '/catalog/year-summary', faIcon: 'fa-calendar-alt', title: 'Итоги года', description: 'Численность, текучесть, посещаемость и ФОТ в одном дашборде' },
  { id: 'dismissal-analytics', category: 'analytics', href: '/catalog/dismissal-analytics', faIcon: 'fa-chart-pie', title: 'Причины увольнений', description: 'Аналитика выбытия персонала: подразделения, должности, стаж и направления ухода' },
  { id: 'personnel-changes', category: 'analytics', href: '/catalog/personnel-changes', faIcon: 'fa-user-edit', title: 'Кадровые изменения', description: 'Приём, выбытие, текучесть и ССЧ по периодам и подразделениям', keywords: ['текучесть'] },
  { id: 'personnel-changes-position', category: 'analytics', href: '/catalog/personnel-changes?groupBy=position', faIcon: 'fa-people-arrows', title: 'Кадровые перемещения', description: 'Кадровые изменения в разрезе должностей' },

  // Быстрые отчёты (/reports tabs)
  { id: 'quick-overview', category: 'quick', href: '/reports?tab=overview', faIcon: 'fa-tachometer-alt', title: 'Сводная панель', description: 'Активные сотрудники, отметки за сегодня, ожидающие заявки и проблемные отметки' },
  { id: 'quick-t13', category: 'quick', href: '/reports?tab=t13', faIcon: 'fa-table', title: 'Т-13 за месяц', description: 'Табель Т-13 за месяц с печатью и экспортом в Excel', keywords: ['т13', 'табель'] },
  { id: 'quick-lateness', category: 'quick', href: '/reports?tab=lateness', faIcon: 'fa-exclamation-circle', title: 'Опоздания (кратко)', description: 'Количество дней и минут опозданий по сотрудникам за период' },
  { id: 'quick-marks', category: 'quick', href: '/reports?tab=marks', faIcon: 'fa-fingerprint', title: 'Отметки (кратко)', description: 'Отметки за период с итогами по источникам' },
  { id: 'quick-hr', category: 'quick', href: '/reports?tab=hr', faIcon: 'fa-user-friends', title: 'Кадровое движение за год', description: 'Приёмы и увольнения за год по подразделениям или штатам' },
  { id: 'quick-fot', category: 'quick', href: '/reports?tab=fot', faIcon: 'fa-wallet', title: 'ФОТ за период', description: 'Итог ФОТ, штрафы и разбивка по подразделениям за расчётный период' },
];

/** Report pages under /catalog/reports (roleAccess keys that used to live in REPORTS_NAV). */
export const CATALOG_REPORTS = REPORTS.filter((r) => r.href.startsWith('/catalog/reports/'));

export function reportsByCategory(id: ReportCategoryId) {
  return REPORTS.filter((r) => r.category === id);
}

export function rememberRecentReport(id: string) {
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_REPORTS_KEY) || '[]');
    const list = Array.isArray(prev) ? prev.filter((x) => typeof x === 'string' && x !== id) : [];
    localStorage.setItem(RECENT_REPORTS_KEY, JSON.stringify([id, ...list].slice(0, 12)));
  } catch {
    /* storage unavailable */
  }
}

/** Report whose href matches the URL exactly (path + every query key of the href). */
export function findReport(pathname: string, search = '') {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  let best: ReportDefinition | null = null;
  let bestKeys = -1;
  for (const r of REPORTS) {
    const [path, qs] = r.href.split('?');
    if (path !== pathname) continue;
    const want = [...new URLSearchParams(qs ?? '').entries()];
    if (want.some(([k, v]) => params.get(k) !== v)) continue;
    if (want.length > bestKeys) {
      best = r;
      bestKeys = want.length;
    }
  }
  return best;
}
