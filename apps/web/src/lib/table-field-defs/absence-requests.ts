import type { TableFieldDef, TablePrefsConfig } from '@/components/table-prefs';

/** Verifix /vhr/htt/request_list — Запросы на отсутствие */
export const ABSENCE_REQUEST_FIELDS: TableFieldDef[] = [
  { key: 'staff_name', label: 'Сотрудник', searchable: true },
  { key: 'request_date', label: 'Дата запроса', searchable: true },
  { key: 'request_kind_name', label: 'Вид отсутствия', searchable: true },
  { key: 'request_time', label: 'Время' },
  { key: 'note', label: 'Примечание', searchable: true },
  { key: 'manager_note', label: 'Примечание руководителя', searchable: true },
  { key: 'status_name', label: 'Состояние', searchable: true },
  { key: 'division_name', label: 'Подразделение' },
  { key: 'job_name', label: 'Должность' },
  { key: 'request_type_name', label: 'Тип запроса' },
  { key: 'begin_time', label: 'Начало' },
  { key: 'end_time', label: 'Окончание' },
  { key: 'approved_by_name', label: 'Подтвердил' },
  { key: 'completed_by_name', label: 'Завершил' },
  { key: 'created_by_name', label: 'Создал' },
  { key: 'created_on', label: 'Создан' },
  { key: 'modified_by_name', label: 'Изменил' },
  { key: 'modified_on', label: 'Изменен' },
  { key: 'access_level_name', label: 'Уровень доступа' },
  { key: 'accrual_kind_name', label: 'Вид начисления' },
  { key: 'barcode', label: 'Штрихкод' },
  { key: 'request_id', label: 'ИД', searchable: true },
];

export function absenceRequestsPrefs(scope: 'mine' | 'available'): TablePrefsConfig {
  const mineDefaults = [
    'request_date',
    'request_kind_name',
    'request_time',
    'note',
    'manager_note',
    'status_name',
  ];
  const availableDefaults = [
    'staff_name',
    'request_date',
    'request_kind_name',
    'request_time',
    'note',
    'status_name',
  ];
  return {
    storageKey: `hrhub.table.absence-requests.${scope}.v1`,
    title: 'Настройка таблицы: Запросы на отсутствие',
    fields: ABSENCE_REQUEST_FIELDS,
    defaultColumns: scope === 'mine' ? mineDefaults : availableDefaults,
    defaultSearchKeys: ['request_kind_name', 'note', 'manager_note', 'staff_name'],
    defaultSort: [{ key: 'request_date', dir: 'desc' }],
  };
}
