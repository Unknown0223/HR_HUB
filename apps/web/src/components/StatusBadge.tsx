import styles from './status-badge.module.css';

const MUTED = new Set(['draft', 'pending', 'open']);
const SUCCESS = new Set([
  'posted',
  'approved',
  'paid',
  'completed',
  'sent',
  'active',
]);
const WARN = new Set(['cancelled', 'rejected', 'closed', 'dismissed']);

const LABELS: Record<string, string> = {
  draft: 'Черновик',
  pending: 'Ожидание',
  open: 'Открыт',
  posted: 'Проведён',
  approved: 'Утверждён',
  paid: 'Оплачен',
  completed: 'Завершён',
  sent: 'Отправлен',
  active: 'Активный',
  cancelled: 'Отменён',
  rejected: 'Отклонён',
  closed: 'Закрыт',
  dismissed: 'Уволен',
};

export function statusLabel(status: string): string {
  const key = status.trim().toLowerCase();
  if (LABELS[key]) return LABELS[key];
  if (!key) return '—';
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function variantFor(status: string): 'muted' | 'success' | 'warn' | 'default' {
  const key = status.trim().toLowerCase();
  if (MUTED.has(key)) return 'muted';
  if (SUCCESS.has(key)) return 'success';
  if (WARN.has(key)) return 'warn';
  return 'default';
}

export type StatusBadgeProps = {
  status: string;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = variantFor(status);
  const variantClass =
    variant === 'muted'
      ? styles.muted
      : variant === 'success'
        ? styles.success
        : variant === 'warn'
          ? styles.warn
          : styles.muted;

  return (
    <span className={[styles.badge, variantClass, className].filter(Boolean).join(' ')}>
      {statusLabel(status)}
    </span>
  );
}
