'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api';
import {
  GRANT_STATUS_LABELS,
  HISTORY_ACTION_LABELS,
  revokeAccess,
  type AccessEmployeeDetail,
  type AccessGrant,
  type AccessOptions,
} from '@/lib/access';
import styles from '../access.module.css';

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString('ru-RU') : '';
}

function GrantChip({ grant }: { grant: AccessGrant }) {
  const cls = grant.readOnly
    ? styles.chip_readonly
    : grant.status === 'active'
      ? styles.chip
      : styles[`chip_${grant.status}`];
  return <span className={cls}>{GRANT_STATUS_LABELS[grant.status]}</span>;
}

export function EmployeeAccessDrawer({
  employeeId,
  options,
  reloadKey,
  onClose,
  onChanged,
  onGrant,
}: {
  employeeId: string;
  options: AccessOptions;
  reloadKey: number;
  onClose: () => void;
  onChanged: () => void;
  onGrant: (employee: { id: string; fullName: string }) => void;
}) {
  const [detail, setDetail] = useState<AccessEmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    setError(null);
    apiFetch<AccessEmployeeDetail>(`/api/access/employees/${employeeId}`)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !document.documentElement.classList.contains('form-modal-open')) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  async function confirmRevoke(grantId: string) {
    if (reason.trim().length < 3) {
      setError('Укажите причину отзыва (не менее 3 символов)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await revokeAccess(grantId, reason.trim());
      setRevoking(null);
      setReason('');
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const managed = detail?.grants.filter((g) => !g.readOnly) ?? [];
  const readOnly = detail?.grants.filter((g) => g.readOnly) ?? [];
  const typeCanRevoke = new Set(options.types.filter((t) => t.canGrant).map((t) => t.id));

  return createPortal(
    <>
      <div className={styles.drawerBackdrop} onClick={onClose} aria-hidden />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="access-drawer-title">
        <header className={styles.drawerHead}>
          <div className={styles.headText}>
            <h2 id="access-drawer-title" className={styles.drawerTitle}>
              {detail?.employee.fullName ?? 'Загрузка…'}
            </h2>
            {detail ? (
              <span className={styles.muted}>
                Таб. № {detail.employee.tabNumber}
                {detail.employee.division ? ` · ${detail.employee.division.name}` : ''}
                {detail.employee.position ? ` · ${detail.employee.position.name}` : ''}
              </span>
            ) : null}
          </div>
          <button ref={closeRef} type="button" className={styles.drawerClose} aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <div className={styles.drawerBody}>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {detail ? (
            <>
              <div className={styles.pagerBtns}>
                {options.canGrant && detail.employee.status !== 'dismissed' ? (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => onGrant({ id: detail.employee.id, fullName: detail.employee.fullName })}
                  >
                    <i className="fas fa-plus" aria-hidden /> Выдать доступ
                  </button>
                ) : null}
                <Link href={`/employees/${detail.employee.id}`} className={styles.btn}>
                  Карточка сотрудника
                </Link>
              </div>

              <section className={styles.modalBody} aria-labelledby="access-grants-title">
                <h3 id="access-grants-title" className={styles.sectionTitle}>
                  Доступы{' '}
                  <span className={styles.muted}>
                    {managed.filter((g) => g.status === 'active' || g.status === 'expiring').length} действующих
                  </span>
                </h3>
                {managed.length === 0 ? (
                  <p className={styles.muted}>Дополнительных доступов нет.</p>
                ) : (
                  <ul className={styles.grantList}>
                    {managed.map((g) => (
                      <li key={g.id} className={styles.grantItem}>
                        <div className={styles.grantText}>
                          <strong>{g.typeLabel}</strong>
                          <span>{g.resourceLabel}</span>
                          <span className={styles.muted}>
                            Выдан {fmtDate(g.grantedAt)}
                            {g.expiresAt ? ` · до ${fmtDate(g.expiresAt)}` : ''}
                          </span>
                          {revoking === g.id ? (
                            <div className={styles.modalBody}>
                              <label className={styles.field}>
                                Причина отзыва
                                <input
                                  className={styles.input}
                                  value={reason}
                                  maxLength={500}
                                  autoFocus
                                  onChange={(e) => setReason(e.target.value)}
                                />
                              </label>
                              <div className={styles.pagerBtns}>
                                <button
                                  type="button"
                                  className={styles.btnDanger}
                                  disabled={busy}
                                  onClick={() => confirmRevoke(g.id)}
                                >
                                  {busy ? 'Сохранение…' : 'Подтвердить отзыв'}
                                </button>
                                <button
                                  type="button"
                                  className={styles.btn}
                                  disabled={busy}
                                  onClick={() => {
                                    setRevoking(null);
                                    setReason('');
                                  }}
                                >
                                  Отмена
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className={styles.chips}>
                          <GrantChip grant={g} />
                          {g.status !== 'revoked' && typeCanRevoke.has(g.accessType) && revoking !== g.id ? (
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={() => {
                                setRevoking(g.id);
                                setReason('');
                                setError(null);
                              }}
                            >
                              Отозвать
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {readOnly.length ? (
                <section className={styles.modalBody} aria-labelledby="access-readonly-title">
                  <h3 id="access-readonly-title" className={styles.sectionTitle}>
                    Локации и руководитель
                  </h3>
                  <p className={styles.muted}>Управляются в карточке сотрудника.</p>
                  <ul className={styles.grantList}>
                    {readOnly.map((g) => (
                      <li key={g.id} className={styles.grantItem}>
                        <div className={styles.grantText}>
                          <strong>{g.typeLabel}</strong>
                          <span>{g.resourceLabel}</span>
                        </div>
                        <GrantChip grant={g} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className={styles.modalBody} aria-labelledby="access-history-title">
                <h3 id="access-history-title" className={styles.sectionTitle}>
                  История изменений
                </h3>
                {detail.history.length === 0 ? (
                  <p className={styles.muted}>Изменений через модуль «Доступы» ещё не было.</p>
                ) : (
                  <ul className={styles.historyList}>
                    {detail.history.map((h) => (
                      <li key={h.id} className={styles.historyItem}>
                        <div>
                          <strong>{HISTORY_ACTION_LABELS[h.action] ?? h.action}</strong>
                          {h.meta?.after ? (
                            <>
                              {' · '}
                              {options.types.find((t) => t.id === h.meta?.after?.accessType)?.label ??
                                h.meta.after.accessType}
                            </>
                          ) : null}
                        </div>
                        <div className={styles.muted}>
                          {new Date(h.createdAt).toLocaleString('ru-RU')}
                          {h.actor ? ` · ${h.actor}` : ''}
                          {h.meta?.source === 'access.bulk' ? ' · групповая операция' : ''}
                        </div>
                        {h.meta?.reason ? <div>Причина: {h.meta.reason}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </>,
    document.body,
  );
}
