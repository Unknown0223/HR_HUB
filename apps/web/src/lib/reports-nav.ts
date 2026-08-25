/** Отчетность mega-menu — exact Verifix list (Кадры / Посещения / Зарплата). */

export type ReportNavLink = { href: string; label: string };
export type ReportNavColumn = { title: string; items: ReportNavLink[] };

export const REPORTS_NAV: ReportNavColumn[] = [
  {
    title: 'Кадры',
    items: [
      { href: '/catalog/reports/staffing', label: 'Отчет по штатному расписанию' },
      { href: '/catalog/reports/gender', label: 'Отчет по гендерному разделению сотрудников' },
      {
        href: '/catalog/reports/movement-divisions',
        label: 'Отчет по движению сотрудников (подразделения)',
      },
      { href: '/catalog/reports/dismissals-by-division', label: 'Отчет увольнений по подразделениям' },
      { href: '/catalog/reports/dismissals-by-reason', label: 'Отчет по причинам увольнения' },
      { href: '/catalog/reports/positions', label: 'Отчет по позициям' },
      { href: '/catalog/reports/grade-changes', label: 'Отчет по изменению разрядов' },
      { href: '/catalog/reports/timesheet-adjustments', label: 'Отчет по корректировке табеля' },
      { href: '/catalog/reports/movement-staff', label: 'Отчет по движению сотрудников (штаты)' },
      { href: '/catalog/reports/candidates', label: 'Отчет по кандидатам' },
      { href: '/catalog/reports/vacancies', label: 'Отчет по вакантным позициям' },
      { href: '/catalog/reports/schedule-plan', label: 'Отчет по плану графиков' },
      { href: '/catalog/reports/occupancy', label: 'Отчет по занятости' },
      { href: '/catalog/reports/employees', label: 'Отчет по сотрудникам' },
      { href: '/catalog/reports/tenure', label: 'Отчет по стажам' },
      { href: '/catalog/reports/grades', label: 'Отчет по разрядам' },
      { href: '/catalog/reports/relatives', label: 'Сотрудники и их родственники' },
      { href: '/catalog/reports/access', label: 'Отчет по доступам сотрудников' },
    ],
  },
  {
    title: 'Посещения',
    items: [
      { href: '/catalog/reports/attendance-overview', label: 'Отчет по посещениям сотрудников' },
      { href: '/catalog/reports/discipline', label: 'Отчет по дисциплине посещений' },
      {
        href: '/catalog/reports/division-mode?period=1',
        label: 'Отчет по режиму работы подразделений (период)',
      },
      { href: '/catalog/reports/division-mode', label: 'Отчет по режиму работы подразделений' },
      { href: '/catalog/reports/attendance-t13', label: 'Отчет по посещениям сотрудников (Т-13)' },
      { href: '/catalog/reports/marks-detail', label: 'Детальный отчет по отметкам' },
      { href: '/catalog/reports/distance', label: 'Отчет по пройденному расстоянию' },
      { href: '/catalog/reports/hourly', label: 'Почасовой отчет по посещениям' },
      { href: '/catalog/reports/shifts', label: 'Отчет посещений сотрудников по сменам' },
      { href: '/catalog/reports/shifts?variant=2', label: 'Отчет по сменам (второй вариант)' },
      {
        href: '/catalog/reports/multi-shift',
        label: 'Отчет посещений по многосменным графикам',
      },
      { href: '/catalog/reports/time-types', label: 'Отчет по видам времени' },
      { href: '/catalog/reports/lateness', label: 'Отчет по опозданиям' },
      { href: '/catalog/reports/schedules', label: 'Отчет по расписанию' },
    ],
  },
  {
    title: 'Зарплата',
    items: [
      { href: '/catalog/reports/payroll-book', label: 'Книга начисления заработной платы' },
      {
        href: '/catalog/reports/payroll-grouped',
        label: 'Итоговый отчет по начислениям с группировками',
      },
      { href: '/catalog/reports/payments', label: 'Отчет по оплатам' },
      { href: '/catalog/reports/division-expenses', label: 'Расходы по подразделениям' },
      { href: '/catalog/reports/fot', label: 'ФОТ отчет' },
      { href: '/catalog/reports/one-time', label: 'Отчет по разовым начислениям' },
      { href: '/catalog/reports/preliminary-salary', label: 'Отчет по предварительному окладу' },
      { href: '/catalog/reports/penalties', label: 'Отчет по штрафам' },
    ],
  },
];

export const REPORTS_NAV_FLAT: ReportNavLink[] = REPORTS_NAV.flatMap((c) => c.items);
