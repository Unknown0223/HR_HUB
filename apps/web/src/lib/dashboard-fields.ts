import type { AttRowLike } from './dashboard-row';
import {
  EMPLOYEE_FIELD_LABELS,
  type EmployeeFieldKey,
  type SortDir,
  type SortRule,
} from './employee-fields';

export { EMPLOYEE_FIELD_LABELS };
export type { EmployeeFieldKey, SortDir, SortRule };

/** 0 → "0 мин", 65 → "1 ч 05 мин", 120 → "2 ч". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${h} ч`;
}

/** Numeric value used for sorting duration/count columns; null sorts last. */
export function numericField(r: AttRowLike, key: EmployeeFieldKey): number | null | undefined {
  switch (key) {
    case 'lateMinutes':
      return r.lateMin;
    case 'earlyLeaveMinutes':
      return r.earlyLeaveMin;
    case 'workedTime':
      return r.workedMin;
    case 'overtime':
      return r.overtimeMin;
    case 'marksCount':
      return r.marksCount;
    case 'distanceKm':
      return r.distanceKm;
    default:
      return undefined;
  }
}

function minutesCell(v: number | null | undefined): string {
  return v == null ? '' : formatMinutes(v);
}

/** Resolve a HR HUB table field value from an attendance/employee row. */
export function cellValue(
  r: AttRowLike,
  key: EmployeeFieldKey,
  statusLabel?: (status: string) => string,
): string {
  switch (key) {
    case 'fullName':
      return r.fullName || '';
    case 'email':
      return r.email || '';
    case 'addressResidence':
      return r.addressResidence || '';
    case 'schedule':
      return r.schedule || '';
    case 'hiredAt':
      return r.hiredAt || '';
    case 'birthDate':
      return r.birthDate || '';
    case 'position':
      return r.position || '';
    case 'id':
      return r.id || r.employeeId || '';
    case 'inn':
      return r.inn || '';
    case 'inps':
      return r.inps || '';
    case 'firstName':
      return r.firstName || '';
    case 'code':
      return r.code || '';
    case 'login':
      return r.login || '';
    case 'arrivalLocation':
      return r.arrivalLocation || '';
    case 'phone':
      return r.phone || '';
    case 'distanceKm':
      return r.distanceKm != null ? String(r.distanceKm) : '';
    case 'fingerprints':
      return r.fingerprints || '';
    case 'middleName':
      return r.middleName || '';
    case 'pinfl':
      return r.pinfl || '';
    case 'division':
      return r.division || '';
    case 'gender':
      return r.gender || '';
    case 'addressPostal':
      return r.addressPostal || '';
    case 'arrival':
      return r.firstIn || '';
    case 'grade':
      return r.grade || '';
    case 'bankAccount':
      return r.bankAccount || '';
    case 'region':
      return r.region || '';
    case 'manager':
      return r.manager || '';
    case 'site':
      return r.site || '';
    case 'dayState':
      return statusLabel ? statusLabel(r.status) : r.status || '';
    case 'workStatus':
      return r.workStatus || '';
    case 'tabNumber':
      return r.tabNumber || '';
    case 'telegram':
      return r.telegram || '';
    case 'employmentType':
      return r.employmentType || '';
    case 'accessLevel':
      return r.accessLevel || '';
    case 'departure':
      return r.lastOut || '';
    case 'fax':
      return r.fax || '';
    case 'lastName':
      return r.lastName || '';
    case 'shift':
      return r.shiftStart && r.shiftEnd ? `${r.shiftStart}–${r.shiftEnd}` : '';
    case 'lateMinutes':
      return minutesCell(r.lateMin);
    case 'earlyLeaveMinutes':
      return minutesCell(r.earlyLeaveMin);
    case 'workedTime':
      return minutesCell(r.workedMin);
    case 'overtime':
      return minutesCell(r.overtimeMin);
    case 'marksCount':
      return r.marksCount != null ? String(r.marksCount) : '';
    case 'departureLocation':
      return r.departureLocation || '';
    default:
      return '';
  }
}

export function compareField(
  a: AttRowLike,
  b: AttRowLike,
  key: EmployeeFieldKey,
  dir: Exclude<SortDir, 'none'>,
  statusLabel?: (status: string) => string,
): number {
  const an = numericField(a, key);
  if (an !== undefined) {
    const bn = numericField(b, key);
    if (an == null || bn == null) return an == null ? (bn == null ? 0 : 1) : -1;
    return dir === 'desc' ? bn - an : an - bn;
  }
  const av = cellValue(a, key, statusLabel);
  const bv = cellValue(b, key, statusLabel);
  const cmp = av.localeCompare(bv, 'ru', { numeric: true, sensitivity: 'base' });
  return dir === 'desc' ? -cmp : cmp;
}

export function applySortRules(
  rows: AttRowLike[],
  rules: SortRule[],
  statusLabel?: (status: string) => string,
): AttRowLike[] {
  const active = rules.filter((r) => r.dir !== 'none');
  if (!active.length) return rows;
  return [...rows].sort((a, b) => {
    for (const rule of active) {
      const c = compareField(a, b, rule.key, rule.dir as 'asc' | 'desc', statusLabel);
      if (c !== 0) return c;
    }
    return 0;
  });
}
