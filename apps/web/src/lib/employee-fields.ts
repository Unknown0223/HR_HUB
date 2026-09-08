/**
 * Verifix-aligned employee / attendance table fields.
 * Single source for labels used in table settings, sorting, filters, and catalogs.
 */

export type EmployeeFieldKey =
  | 'fullName'
  | 'email'
  | 'addressResidence'
  | 'schedule'
  | 'hiredAt'
  | 'birthDate'
  | 'position'
  | 'id'
  | 'inn'
  | 'inps'
  | 'firstName'
  | 'code'
  | 'login'
  | 'arrivalLocation'
  | 'phone'
  | 'distanceKm'
  | 'fingerprints'
  | 'middleName'
  | 'pinfl'
  | 'division'
  | 'gender'
  | 'addressPostal'
  | 'arrival'
  | 'grade'
  | 'bankAccount'
  | 'region'
  | 'manager'
  | 'site'
  | 'dayState'
  | 'workStatus'
  | 'tabNumber'
  | 'telegram'
  | 'employmentType'
  | 'accessLevel'
  | 'departure'
  | 'fax'
  | 'lastName';

export type EmployeeFieldDef = {
  key: EmployeeFieldKey;
  label: string;
  /** Can appear as a data column on attendance / employee grids */
  column: boolean;
  /** Can be used as a sort key (client or API) */
  sortable: boolean;
  /** Can be toggled in Verifix-style search settings */
  searchable: boolean;
  /** Attendance-day field (not pure person identity) */
  attendance?: boolean;
};

/** Exact Verifix Russian labels from «Настройка таблицы / Сортировка». */
export const EMPLOYEE_FIELDS: EmployeeFieldDef[] = [
  { key: 'fullName', label: 'ФИО', column: true, sortable: true, searchable: true },
  { key: 'email', label: 'E-mail', column: true, sortable: true, searchable: true },
  { key: 'addressResidence', label: 'Адрес места проживания', column: true, sortable: true, searchable: false },
  { key: 'schedule', label: 'График работы', column: true, sortable: true, searchable: false },
  { key: 'hiredAt', label: 'Дата приема на работу', column: true, sortable: true, searchable: false },
  { key: 'birthDate', label: 'Дата рождения', column: true, sortable: true, searchable: false },
  { key: 'position', label: 'Должность', column: true, sortable: true, searchable: false },
  { key: 'id', label: 'ИД', column: true, sortable: true, searchable: false },
  { key: 'inn', label: 'ИНН', column: true, sortable: true, searchable: true },
  { key: 'inps', label: 'ИНПС', column: true, sortable: true, searchable: true },
  { key: 'firstName', label: 'Имя', column: true, sortable: true, searchable: false },
  { key: 'code', label: 'Код', column: true, sortable: true, searchable: false },
  { key: 'login', label: 'Логин', column: true, sortable: true, searchable: false },
  { key: 'arrivalLocation', label: 'Локация прихода', column: true, sortable: true, searchable: false, attendance: true },
  { key: 'phone', label: 'Номер телефона', column: true, sortable: true, searchable: true },
  { key: 'distanceKm', label: 'Общее расстояние (км)', column: true, sortable: true, searchable: false, attendance: true },
  { key: 'fingerprints', label: 'Отпечатки', column: true, sortable: true, searchable: false },
  { key: 'middleName', label: 'Отчество', column: true, sortable: true, searchable: false },
  { key: 'pinfl', label: 'ПИНФЛ', column: true, sortable: true, searchable: false },
  { key: 'division', label: 'Подразделение', column: true, sortable: true, searchable: false },
  { key: 'gender', label: 'Пол', column: true, sortable: true, searchable: false },
  { key: 'addressPostal', label: 'Почтовый адрес', column: true, sortable: true, searchable: false },
  { key: 'arrival', label: 'Приход', column: true, sortable: true, searchable: false, attendance: true },
  { key: 'grade', label: 'Разряд', column: true, sortable: true, searchable: false },
  { key: 'bankAccount', label: 'Расчетный счет', column: true, sortable: true, searchable: false },
  { key: 'region', label: 'Регион', column: true, sortable: true, searchable: false },
  { key: 'manager', label: 'Руководитель', column: true, sortable: true, searchable: false },
  { key: 'site', label: 'Сайт', column: true, sortable: true, searchable: false },
  { key: 'dayState', label: 'Состояние', column: true, sortable: true, searchable: false, attendance: true },
  { key: 'workStatus', label: 'Статус на работе', column: true, sortable: true, searchable: false },
  { key: 'tabNumber', label: 'Табельный номер', column: true, sortable: true, searchable: true },
  { key: 'telegram', label: 'Телеграм', column: true, sortable: true, searchable: false },
  { key: 'employmentType', label: 'Тип занятости', column: true, sortable: true, searchable: false },
  { key: 'accessLevel', label: 'Уровень доступа', column: true, sortable: true, searchable: false },
  { key: 'departure', label: 'Уход', column: true, sortable: true, searchable: false, attendance: true },
  { key: 'fax', label: 'Факс', column: true, sortable: true, searchable: false },
  { key: 'lastName', label: 'Фамилия', column: true, sortable: true, searchable: false },
];

export const EMPLOYEE_FIELD_LABELS: Record<EmployeeFieldKey, string> = Object.fromEntries(
  EMPLOYEE_FIELDS.map((f) => [f.key, f.label]),
) as Record<EmployeeFieldKey, string>;

/** Default visible columns for «Статистика посещений сотрудников». */
export const ATTENDANCE_DEFAULT_COLUMNS: EmployeeFieldKey[] = [
  'fullName',
  'arrival',
  'departure',
  'dayState',
];

/** Default search toggles matching Verifix «Настройка поиска». */
export const ATTENDANCE_DEFAULT_SEARCH: EmployeeFieldKey[] = ['fullName'];

export const ATTENDANCE_SEARCH_FIELDS: EmployeeFieldKey[] = [
  'phone',
  'inn',
  'inps',
  'tabNumber',
  'fullName',
];

export function employeeFieldLabel(key: string): string {
  return EMPLOYEE_FIELD_LABELS[key as EmployeeFieldKey] ?? key;
}

export function columnFields(): EmployeeFieldDef[] {
  return EMPLOYEE_FIELDS.filter((f) => f.column);
}

export function sortableFields(): EmployeeFieldDef[] {
  return EMPLOYEE_FIELDS.filter((f) => f.sortable);
}

export type SortDir = 'asc' | 'desc' | 'none';

export type SortRule = { key: EmployeeFieldKey; dir: SortDir };

/** Merge COLUMN_LABELS-style keys with Verifix labels (aliases included). */
export const COLUMN_LABEL_OVERRIDES: Record<string, string> = {
  ...EMPLOYEE_FIELD_LABELS,
  name: 'ФИО',
  'division.name': 'Подразделение',
  division_name: 'Подразделение',
  'position.name': 'Должность',
  job_name: 'Должность',
  'grade.name': 'Разряд',
  rank_name: 'Разряд',
  'schedule.name': 'График работы',
  region_name: 'Регион',
  hireDate: 'Дата приема на работу',
  hiredAt: 'Дата приема на работу',
  address: 'Адрес места проживания',
  addressRegistration: 'Почтовый адрес',
  phone: 'Номер телефона',
  email: 'E-mail',
  status: 'Статус на работе',
  employee_number: 'Табельный номер',
  'employee.tabNumber': 'Табельный номер',
  'employee.lastName': 'Фамилия',
  'employee.firstName': 'Имя',
};
