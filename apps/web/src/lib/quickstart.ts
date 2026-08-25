export type QuickstartKey =
  | 'organization'
  | 'setting'
  | 'division'
  | 'job'
  | 'rank'
  | 'position'
  | 'schedule'
  | 'location'
  | 'employee'
  | 'hiring';

export type QuickstartStepDef = {
  key: QuickstartKey;
  tag: string;
  label: string;
  href: string;
};

export const QUICKSTART_STEPS: QuickstartStepDef[] = [
  {
    key: 'organization',
    tag: '#qs:st:organization',
    label: 'Организация (создание)',
    href: '/settings/organizations',
  },
  {
    key: 'setting',
    tag: '#qs:st:setting',
    label: 'Ключевой узел',
    href: '/settings?tab=org',
  },
  {
    key: 'division',
    tag: '#qs:st:division',
    label: 'Подразделение (создание)',
    href: '/divisions?tab=divisions',
  },
  {
    key: 'job',
    tag: '#qs:st:job',
    label: 'Должность (создание)',
    href: '/positions?tab=positions',
  },
  {
    key: 'rank',
    tag: '#qs:st:rank',
    label: 'Разряд (создание)',
    href: '/catalog/grades',
  },
  {
    key: 'position',
    tag: '#qs:st:position',
    label: 'Позиция (создание)',
    href: '/catalog/staff-positions',
  },
  {
    key: 'schedule',
    tag: '#qs:st:schedule',
    label: 'График работы (создание)',
    href: '/catalog/work-schedules',
  },
  {
    key: 'location',
    tag: '#qs:st:location',
    label: 'Локация (создание)',
    href: '/catalog/locations',
  },
  {
    key: 'employee',
    tag: '#qs:st:employee',
    label: 'Сотрудник (создание)',
    href: '/employees',
  },
  {
    key: 'hiring',
    tag: '#qs:st:hiring',
    label: 'Прием на работу (создание)',
    href: '/catalog/hr-documents',
  },
];

export type QuickstartState = {
  heading: string;
  doneCount: number;
  total: number;
  steps: { key: QuickstartKey; auto: boolean; done: boolean }[];
};
