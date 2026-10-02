export const money = (n: number | null | undefined) =>
  n == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(n)} сум`;
