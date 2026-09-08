import type { TableFieldDef, TablePrefsConfig } from '@/components/table-prefs';
import { EMPLOYEE_FIELDS } from '@/lib/employee-fields';

/** Verifix employee_list + dashboard identity columns */
export const EMPLOYEE_LIST_FIELDS: TableFieldDef[] = [
  ...EMPLOYEE_FIELDS.filter((f) => !f.attendance).map((f) => ({
    key: f.key,
    label: f.label,
    column: true,
    sortable: true,
    searchable: ['fullName', 'tabNumber', 'email', 'phone', 'pinfl', 'inn', 'code'].includes(
      f.key,
    ),
  })),
];

export const employeeListPrefs: TablePrefsConfig = {
  storageKey: 'hrhub.table.employees.v1',
  title: 'Настройка таблицы: Сотрудники',
  fields: EMPLOYEE_LIST_FIELDS,
  defaultColumns: ['tabNumber', 'fullName', 'region', 'division', 'position', 'gender'],
  defaultSearchKeys: ['fullName', 'tabNumber', 'phone', 'email'],
  defaultSort: [{ key: 'fullName', dir: 'asc' }],
};

export const PERSON_LIST_FIELDS: TableFieldDef[] = [
  { key: 'fullName', label: 'ФИО', searchable: true },
  { key: 'lastName', label: 'Фамилия', searchable: true },
  { key: 'firstName', label: 'Имя', searchable: true },
  { key: 'middleName', label: 'Отчество' },
  { key: 'gender', label: 'Пол' },
  { key: 'birthDate', label: 'Дата рождения' },
  { key: 'pinfl', label: 'ПИНФЛ', searchable: true },
  { key: 'inn', label: 'ИНН', searchable: true },
  { key: 'inps', label: 'ИНПС', searchable: true },
  { key: 'code', label: 'Код', searchable: true },
  { key: 'phone', label: 'Номер телефона', searchable: true },
  { key: 'email', label: 'E-mail', searchable: true },
  { key: 'region', label: 'Регион' },
  { key: 'addressResidence', label: 'Адрес места проживания' },
  { key: 'addressPostal', label: 'Почтовый адрес' },
  { key: 'isActive', label: 'Статус на работе' },
  { key: 'isBlacklisted', label: 'В черном списке' },
];

export const personListPrefs: TablePrefsConfig = {
  storageKey: 'hrhub.table.persons.v1',
  title: 'Настройка таблицы: Физические лица',
  fields: PERSON_LIST_FIELDS,
  defaultColumns: ['fullName', 'inn', 'code', 'isBlacklisted'],
  defaultSearchKeys: ['fullName', 'inn', 'pinfl', 'phone'],
  defaultSort: [{ key: 'fullName', dir: 'asc' }],
};

/** Verifix location_list */
export const LOCATION_LIST_FIELDS: TableFieldDef[] = [
  { key: 'name', label: 'Локация', searchable: true },
  { key: 'code', label: 'Код', searchable: true },
  { key: 'address', label: 'Адрес', searchable: true },
  { key: 'locationType', label: 'Тип' },
  { key: 'region', label: 'Регион' },
  { key: 'timezone', label: 'Часовой пояс' },
  { key: 'deviceCount', label: 'Устройства' },
  { key: 'devicesOffline', label: 'Офлайн' },
  { key: 'employeeCount', label: 'Сотрудники' },
  { key: 'latlng', label: 'Координаты' },
  { key: 'isActive', label: 'Статус' },
];

export const locationListPrefs: TablePrefsConfig = {
  storageKey: 'hrhub.table.locations.v1',
  title: 'Настройка таблицы: Локации',
  fields: LOCATION_LIST_FIELDS,
  defaultColumns: [
    'name',
    'address',
    'locationType',
    'deviceCount',
    'devicesOffline',
    'employeeCount',
    'isActive',
  ],
  defaultSearchKeys: ['name', 'code', 'address'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
};
