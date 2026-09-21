/**
 * HR HUB form → HR Hub page mapping.
 * TablePrefs (Сортировка / Настройка таблицы / Excel) adoption status.
 */
export const CATALOG_PAGE_MAP = [
  { hrhub: '/vhr/htt/request_list', hub: '/catalog/absence-requests', title: 'Запросы на отсутствие', wired: true },
  { hrhub: '/vhr/intro/dashboard', hub: '/dashboard', title: 'Статистика посещений', wired: true },
  { hrhub: '/vhr/href/employee/employee_list', hub: '/employees', title: 'Сотрудники', wired: true },
  { hrhub: '/vhr/href/person/person_list', hub: '/catalog/persons', title: 'Физические лица', wired: true },
  { hrhub: '/vhr/htt/location_list', hub: '/catalog/locations', title: 'Локации', wired: true },
  { hrhub: '/vhr/htt/device_list', hub: '/catalog/devices', title: 'Устройства', wired: true },
  { hrhub: '/vhr/htt/track_list', hub: '/attendance/marks', title: 'Отметки', wired: true },
  { hrhub: '/vhr/htt/schedule_list', hub: '/catalog/work-schedules', title: 'Графики работы', wired: true },
  { hrhub: '/vhr/hrm/division_list', hub: '/divisions', title: 'Подразделения', wired: true },
  { hrhub: '/vhr/hrm/job_list', hub: '/positions', title: 'Должности', wired: true },
  { hrhub: '/vhr/htt/request_kind_list', hub: '/catalog/absence-types', title: 'Виды отсутствий', wired: true },
  { hrhub: 'generic', hub: '/catalog/[resource]', title: 'Универсальный каталог', wired: true },
] as const;
