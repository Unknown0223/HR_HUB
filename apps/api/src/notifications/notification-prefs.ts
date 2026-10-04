/** Notification groups a user can switch off; anything outside them is always delivered. */
export const NOTIFICATION_CATEGORIES = [
  {
    id: 'requests',
    label: 'Заявки и согласования',
    hint: 'Отсутствия, кадровые заявки, авансы, анкеты из Telegram',
    entities: ['absence', 'hr-request', 'advance_request', 'employee_join_request'],
  },
  {
    id: 'security',
    label: 'Нарушения и безопасность',
    hint: 'Подмена GPS, чужое лицо, подозрительные скачки, устройства',
    entities: ['employee', 'device'],
  },
  {
    id: 'attendance',
    label: 'Отметки прихода',
    hint: 'Уведомление при каждой своей отметке прихода',
    entities: ['attendance_arrival'],
  },
  {
    id: 'documents',
    label: 'Кадровые документы',
    hint: 'Проведённые документы, смена ФИО и оклада, истекающие документы',
    entities: ['hr-document', 'name-change', 'wage-change', 'PersonDocument'],
  },
  {
    id: 'news',
    label: 'Новости компании',
    hint: 'Публикации в разделе новостей',
    entities: ['news'],
  },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]['id'];

export function categoryOf(entity: string | null | undefined): NotificationCategory | null {
  if (!entity) return null;
  return NOTIFICATION_CATEGORIES.find((c) => (c.entities as readonly string[]).includes(entity))?.id ?? null;
}

/** Stored in users.meta.notificationPrefs as `{ [category]: false }` for switched-off groups. */
export function readPrefs(meta: unknown): Record<NotificationCategory, boolean> {
  const raw =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>).notificationPrefs
      : null;
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c) => [c.id, stored[c.id] !== false]),
  ) as Record<NotificationCategory, boolean>;
}

export function wantsNotification(meta: unknown, entity: string | null | undefined): boolean {
  const category = categoryOf(entity);
  return category ? readPrefs(meta)[category] : true;
}
