'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import {
  pickSearchText,
  type EmployeePickItem,
} from '@/components/employee-pick';
import styles from './employee-pick.module.css';

export function EmployeePickModal({
  title = 'Выбрать сотрудников',
  items,
  initialSelectedIds,
  excludeIds,
  confirmText = 'Выбрать',
  onConfirm,
  onClose,
}: {
  title?: string;
  items: EmployeePickItem[];
  initialSelectedIds?: string[];
  excludeIds?: string[];
  confirmText?: string;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const excluded = useMemo(() => new Set(excludeIds || []), [excludeIds]);
  const visible = useMemo(() => items.filter((e) => !excluded.has(e.id)), [items, excluded]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(
    () => new Set((initialSelectedIds || []).filter((id) => !excluded.has(id))),
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return visible;
    return visible.filter((e) => pickSearchText(e).includes(qq));
  }, [visible, q]);

  const allOn = filtered.length > 0 && filtered.every((e) => sel.has(e.id));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ModalPortal>
      <div className={styles.back} onClick={onClose} role="presentation">
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="emp-pick-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="emp-pick-title" className={styles.title}>
            {title}
          </h3>
          <div className={styles.toolbar}>
            <input
              className={styles.search}
              placeholder="Поиск..."
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
            />
            <span className={styles.meta}>
              {sel.size} / {filtered.length}
            </span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCol}>
                    <input
                      type="checkbox"
                      checked={allOn}
                      aria-label="Выбрать все"
                      onChange={(e) => {
                        setSel((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) filtered.forEach((x) => next.add(x.id));
                          else filtered.forEach((x) => next.delete(x.id));
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th>Табельный номер</th>
                  <th>Сотрудник</th>
                  <th>Должность</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => {
                    const on = sel.has(e.id);
                    return (
                      <tr
                        key={e.id}
                        className={`${styles.row} ${on ? styles.rowOn : ''}`}
                        onClick={() => toggle(e.id)}
                      >
                        <td className={styles.checkCol} onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" checked={on} onChange={() => toggle(e.id)} />
                        </td>
                        <td className={styles.tabCol}>{e.tabNumber || '—'}</td>
                        <td>{e.name}</td>
                        <td>{e.positionName || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onConfirm([...sel])}
            >
              {confirmText}
            </button>
            <button type="button" className={styles.btnGhost} onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
