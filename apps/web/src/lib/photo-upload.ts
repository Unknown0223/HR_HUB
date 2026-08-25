export type PhotoTemplateId =
  | 'first_last'
  | 'last_first'
  | 'first_last_id'
  | 'last_first_id'
  | 'first_last_tab'
  | 'last_first_tab'
  | 'first_last_middle'
  | 'last_first_middle'
  | 'last_first_middle_tab'
  | 'last_first_middle_id'
  | 'tab'
  | 'id';

export const PHOTO_TEMPLATES: { id: PhotoTemplateId; label: string }[] = [
  { id: 'first_last', label: 'Имя Фамилия' },
  { id: 'last_first', label: 'Фамилия Имя' },
  { id: 'first_last_id', label: 'Имя Фамилия #ИД' },
  { id: 'last_first_id', label: 'Фамилия Имя #ИД' },
  { id: 'first_last_tab', label: 'Имя Фамилия #Таб. номер' },
  { id: 'last_first_tab', label: 'Фамилия Имя #Таб. номер' },
  { id: 'first_last_middle', label: 'Имя Фамилия Отчество' },
  { id: 'last_first_middle', label: 'Фамилия Имя Отчество' },
  { id: 'last_first_middle_tab', label: 'Фамилия Имя Отчество #Таб. номер' },
  { id: 'last_first_middle_id', label: 'Фамилия Имя Отчество #ИД' },
  { id: 'tab', label: 'Таб. номер' },
  { id: 'id', label: 'ИД' },
];

export type PhotoImportStatus = 'success' | 'warning' | 'not_found';

export type PhotoImportRow = {
  file: string;
  status: PhotoImportStatus;
  employees: { id: string; tabNumber: string; fullName: string }[];
};

export type PhotoImportResult = {
  counts: { success: number; warning: number; not_found: number };
  items: PhotoImportRow[];
};
