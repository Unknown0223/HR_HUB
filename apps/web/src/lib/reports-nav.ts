/** Отчетность mega-menu — exact Verifix list (Кадры / Посещения / Зарплата). */

export type ReportNavLink = {
  href: string;
  label: string;
  faIcon?: string;
  iconAccent?: string;
};
export type ReportNavColumn = { title: string; items: ReportNavLink[] };

const A = {
  blue: 'linear-gradient(135deg, #0a85e2 0%, #6366f1 100%)',
  teal: 'linear-gradient(135deg, #06b6d4 0%, #0a85e2 100%)',
  green: 'linear-gradient(135deg, #0e9f6e 0%, #0a85e2 100%)',
  orange: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  violet: 'linear-gradient(135deg, #7c3aed 0%, #d946ef 100%)',
  cyan: 'linear-gradient(135deg, #0a85e2 0%, #0e9f6e 100%)',
  rose: 'linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)',
  slate: 'linear-gradient(135deg, #64748b 0%, #0a85e2 100%)',
} as const;

export const REPORTS_NAV: ReportNavColumn[] = [
  {
    title: 'Кадры',
    items: [
      { href: '/catalog/reports/staffing', label: 'Отчет по штатному расписанию', faIcon: 'fa-sitemap', iconAccent: A.blue },
      { href: '/catalog/reports/gender', label: 'Отчет по гендерному разделению сотрудников', faIcon: 'fa-venus-mars', iconAccent: A.violet },
      {
        href: '/catalog/reports/movement-divisions',
        label: 'Отчет по движению сотрудников (подразделения)',
        faIcon: 'fa-exchange-alt',
        iconAccent: A.teal,
      },
      { href: '/catalog/reports/dismissals-by-division', label: 'Отчет увольнений по подразделениям', faIcon: 'fa-building', iconAccent: A.orange },
      { href: '/catalog/reports/dismissals-by-reason', label: 'Отчет по причинам увольнения', faIcon: 'fa-user-times', iconAccent: A.rose },
      { href: '/catalog/reports/positions', label: 'Отчет по позициям', faIcon: 'fa-briefcase', iconAccent: A.cyan },
      { href: '/catalog/reports/grade-changes', label: 'Отчет по изменению разрядов', faIcon: 'fa-layer-group', iconAccent: A.violet },
      { href: '/catalog/reports/timesheet-adjustments', label: 'Отчет по корректировке табеля', faIcon: 'fa-th', iconAccent: A.green },
      { href: '/catalog/reports/movement-staff', label: 'Отчет по движению сотрудников (штаты)', faIcon: 'fa-users', iconAccent: A.blue },
      { href: '/catalog/reports/candidates', label: 'Отчет по кандидатам', faIcon: 'fa-user-plus', iconAccent: A.teal },
      { href: '/catalog/reports/vacancies', label: 'Отчет по вакантным позициям', faIcon: 'fa-door-open', iconAccent: A.orange },
      { href: '/catalog/reports/schedule-plan', label: 'Отчет по плану графиков', faIcon: 'fa-calendar-check', iconAccent: A.cyan },
      { href: '/catalog/reports/occupancy', label: 'Отчет по занятости', faIcon: 'fa-chart-pie', iconAccent: A.violet },
      { href: '/catalog/reports/employees', label: 'Отчет по сотрудникам', faIcon: 'fa-id-card', iconAccent: A.blue },
      { href: '/catalog/reports/tenure', label: 'Отчет по стажам', faIcon: 'fa-hourglass-half', iconAccent: A.green },
      { href: '/catalog/reports/grades', label: 'Отчет по разрядам', faIcon: 'fa-chart-bar', iconAccent: A.teal },
      { href: '/catalog/reports/relatives', label: 'Сотрудники и их родственники', faIcon: 'fa-users', iconAccent: A.rose },
      { href: '/catalog/reports/access', label: 'Отчет по доступам сотрудников', faIcon: 'fa-key', iconAccent: A.slate },
    ],
  },
  {
    title: 'Посещения',
    items: [
      { href: '/catalog/reports/attendance-overview', label: 'Отчет по посещениям сотрудников', faIcon: 'fa-clock', iconAccent: A.blue },
      { href: '/catalog/reports/discipline', label: 'Отчет по дисциплине посещений', faIcon: 'fa-balance-scale', iconAccent: A.orange },
      {
        href: '/catalog/reports/division-mode?period=1',
        label: 'Отчет по режиму работы подразделений (период)',
        faIcon: 'fa-building',
        iconAccent: A.violet,
      },
      { href: '/catalog/reports/division-mode', label: 'Отчет по режиму работы подразделений', faIcon: 'fa-city', iconAccent: A.teal },
      { href: '/catalog/reports/attendance-t13', label: 'Отчет по посещениям сотрудников (Т-13)', faIcon: 'fa-table', iconAccent: A.cyan },
      { href: '/catalog/reports/marks-detail', label: 'Детальный отчет по отметкам', faIcon: 'fa-list-alt', iconAccent: A.green },
      { href: '/catalog/reports/distance', label: 'Отчет по пройденному расстоянию', faIcon: 'fa-road', iconAccent: A.rose },
      { href: '/catalog/reports/hourly', label: 'Почасовой отчет по посещениям', faIcon: 'fa-clock', iconAccent: A.blue },
      { href: '/catalog/reports/shifts', label: 'Отчет посещений сотрудников по сменам', faIcon: 'fa-history', iconAccent: A.violet },
      { href: '/catalog/reports/shifts?variant=2', label: 'Отчет по сменам (второй вариант)', faIcon: 'fa-clone', iconAccent: A.slate },
      {
        href: '/catalog/reports/multi-shift',
        label: 'Отчет посещений по многосменным графикам',
        faIcon: 'fa-layer-group',
        iconAccent: A.teal,
      },
      { href: '/catalog/reports/time-types', label: 'Отчет по видам времени', faIcon: 'fa-tags', iconAccent: A.orange },
      { href: '/catalog/reports/lateness', label: 'Отчет по опозданиям', faIcon: 'fa-exclamation-circle', iconAccent: A.rose },
      { href: '/catalog/reports/schedules', label: 'Отчет по расписанию', faIcon: 'fa-calendar', iconAccent: A.cyan },
    ],
  },
  {
    title: 'Зарплата',
    items: [
      { href: '/catalog/reports/payroll-book', label: 'Книга начисления заработной платы', faIcon: 'fa-book', iconAccent: A.blue },
      {
        href: '/catalog/reports/payroll-grouped',
        label: 'Итоговый отчет по начислениям с группировками',
        faIcon: 'fa-object-group',
        iconAccent: A.violet,
      },
      { href: '/catalog/reports/payments', label: 'Отчет по оплатам', faIcon: 'fa-money-check-alt', iconAccent: A.green },
      { href: '/catalog/reports/division-expenses', label: 'Расходы по подразделениям', faIcon: 'fa-chart-line', iconAccent: A.orange },
      { href: '/catalog/reports/fot', label: 'ФОТ отчет', faIcon: 'fa-wallet', iconAccent: A.teal },
      { href: '/catalog/reports/one-time', label: 'Отчет по разовым начислениям', faIcon: 'fa-bolt', iconAccent: A.rose },
      { href: '/catalog/reports/preliminary-salary', label: 'Отчет по предварительному окладу', faIcon: 'fa-file-invoice-dollar', iconAccent: A.cyan },
      { href: '/catalog/reports/penalties', label: 'Отчет по штрафам', faIcon: 'fa-gavel', iconAccent: A.orange },
    ],
  },
];

export const REPORTS_NAV_FLAT: ReportNavLink[] = REPORTS_NAV.flatMap((c) => c.items);
