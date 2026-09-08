import type { AttRowLike } from './dashboard-row';
import {
  EMPLOYEE_FIELD_LABELS,
  type EmployeeFieldKey,
  type SortDir,
  type SortRule,
} from './employee-fields';

export { EMPLOYEE_FIELD_LABELS };
export type { EmployeeFieldKey, SortDir, SortRule };

/** Resolve a Verifix table field value from an attendance/employee row. */
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
