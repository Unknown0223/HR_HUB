export type HrChangeKind =
  | 'open_position'
  | 'hire'
  | 'transfer'
  | 'transfer_batch'
  | 'dismiss';

export const KIND_LABELS: Record<HrChangeKind, string> = {
  open_position: 'Открытие позиции',
  hire: 'Прием на работу',
  transfer: 'Кадровый перевод',
  transfer_batch: 'Кадровый перевод списком',
  dismiss: 'Увольнение',
};

/** Verifix page titles: «Заявка на … (создание|изменение|просмотр)» */
export function formPageTitle(
  kind: HrChangeKind,
  mode: 'create' | 'edit',
  status?: string,
): string {
  const titles: Record<HrChangeKind, string> = {
    open_position: 'Заявка на открытие позиции',
    hire: 'Заявка на прием на работу',
    transfer: 'Заявка на кадровый перевод',
    transfer_batch: 'Заявка на кадровый перевод списком',
    dismiss: 'Заявка на увольнение',
  };
  const base = titles[kind];
  if (mode === 'create') return `${base} (создание)`;
  if (status === 'approved' || status === 'rejected' || status === 'cancelled') {
    return `${base} (просмотр)`;
  }
  return `${base} (изменение)`;
}

export const CREATE_PRESETS: { label: string; kind: HrChangeKind }[] = [
  { label: 'Открытие позиции', kind: 'open_position' },
  { label: 'Прием на работу', kind: 'hire' },
  { label: 'Кадровый перевод', kind: 'transfer' },
  { label: 'Кадровый перевод списком', kind: 'transfer_batch' },
  { label: 'Увольнение', kind: 'dismiss' },
];

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  pending: 'На рассмотрении',
  approved: 'Утверждена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
};
