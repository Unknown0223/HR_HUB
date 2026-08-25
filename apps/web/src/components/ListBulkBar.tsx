'use client';

import { confirm } from '@/lib/dialogs';
import { apiFetch } from '@/lib/api';
import styles from '../app/(app)/catalog/absence-types/page.module.css';

export async function runListBulk(opts: {
  path: string;
  ids: string[];
  message: string;
  variant?: 'danger';
}) {
  if (!opts.ids.length) return false;
  const ok = await confirm({
    message: opts.message,
    confirmText: 'Да',
    cancelText: 'Нет',
    variant: opts.variant,
  });
  if (!ok) return false;
  await apiFetch(opts.path, { method: 'POST', body: JSON.stringify({ ids: opts.ids }) });
  return true;
}

export type BulkBarAction = {
  key: string;
  label: string;
  count: number;
  variant?: 'primary' | 'danger' | 'ghost';
  onClick: () => void;
};

export function ListBulkBar({
  count,
  busy,
  actions,
  onClear,
}: {
  count: number;
  busy?: boolean;
  actions: BulkBarAction[];
  onClear?: () => void;
}) {
  const visible = actions.filter((a) => a.count > 0);
  if (count <= 0 || visible.length === 0) return null;
  return (
    <div className={styles.bulkBar} role="toolbar" aria-label="Групповая обработка">
      <span className={styles.bulkCount}>{count} выбрано</span>
      {visible.map((a) => (
        <button
          key={a.key}
          type="button"
          disabled={busy}
          className={
            a.variant === 'danger' ? styles.bulkDanger : a.variant === 'ghost' ? styles.bulkGhost : styles.bulkPrimary
          }
          onClick={a.onClick}
        >
          {a.label} {a.count}
        </button>
      ))}
      {onClear ? (
        <button type="button" className={styles.bulkGhost} disabled={busy} onClick={onClear}>
          Снять
        </button>
      ) : null}
    </div>
  );
}

export function toggleSelect(selected: Set<string>, id: string, on: boolean) {
  const next = new Set(selected);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function togglePage(selected: Set<string>, ids: string[], on: boolean) {
  const next = new Set(selected);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}
