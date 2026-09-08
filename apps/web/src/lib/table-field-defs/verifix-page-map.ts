/**
 * Verifix form → HR Hub page mapping.
 * TablePrefs (Сортировка / Настройка таблицы / Excel) adoption status.
 */
export const VERIFIX_PAGE_MAP = [
  { verifix: '/vhr/htt/request_list', hub: '/catalog/absence-requests', title: 'Запросы на отсутствие', wired: true },
  { verifix: '/vhr/intro/dashboard', hub: '/dashboard', title: 'Статистика посещений', wired: true },
  { verifix: '/vhr/href/employee/employee_list', hub: '/employees', title: 'Сотрудники', wired: true },
  { verifix: '/vhr/href/person/person_list', hub: '/catalog/persons', title: 'Физические лица', wired: true },
  { verifix: '/vhr/htt/location_list', hub: '/catalog/locations', title: 'Локации', wired: true },
  { verifix: '/vhr/htt/device_list', hub: '/catalog/devices', title: 'Устройства', wired: true },
  { verifix: '/vhr/htt/track_list', hub: '/attendance/marks', title: 'Отметки', wired: true },
  { verifix: '/vhr/htt/schedule_list', hub: '/catalog/work-schedules', title: 'Графики работы', wired: true },
  { verifix: '/vhr/hrm/division_list', hub: '/divisions', title: 'Подразделения', wired: true },
  { verifix: '/vhr/hrm/job_list', hub: '/positions', title: 'Должности', wired: true },
  { verifix: '/vhr/htt/request_kind_list', hub: '/catalog/absence-types', title: 'Виды отсутствий', wired: true },
  { verifix: 'generic', hub: '/catalog/[resource]', title: 'Универсальный каталог', wired: true },
] as const;
