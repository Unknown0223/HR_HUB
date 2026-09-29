import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './report-links.module.css';

export function employeeHref(employeeId: string) {
  return `/employees/${encodeURIComponent(employeeId)}`;
}

export function employeeMarksHref(employeeId: string, from: string, to = from) {
  const qs = new URLSearchParams({ employeeId, dateFrom: from, dateTo: to });
  return `/attendance/marks?${qs.toString()}`;
}

export function EmployeeLink({
  employeeId,
  children,
}: {
  employeeId?: string | null;
  children: ReactNode;
}) {
  if (!employeeId) return <>{children}</>;
  return (
    <Link className={styles.link} href={employeeHref(employeeId)} title="Открыть карточку сотрудника">
      {children}
    </Link>
  );
}

/** Fills the whole table cell so the cell background stays clickable. */
export function DayMarksLink({
  employeeId,
  date,
  children,
}: {
  employeeId?: string | null;
  date: string;
  children: ReactNode;
}) {
  if (!employeeId || !date) return <>{children}</>;
  return (
    <Link className={styles.cellLink} href={employeeMarksHref(employeeId, date)} title="Отметки за день">
      {children}
    </Link>
  );
}
