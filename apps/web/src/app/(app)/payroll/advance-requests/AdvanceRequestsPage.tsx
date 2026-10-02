'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import shared from '../../../page-shared.module.css';
import styles from './page.module.css';
import { AdvanceLimitsTab } from './AdvanceLimitsTab';
import { money } from './format';

const PATH = '/payroll/advance-requests';

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled';

type RequestRow = {
  id: string;
  amount: number;
  comment: string | null;
  limitAmount: number | null;
  overLimit: boolean;
  status: Status;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  advanceId: string | null;
  createdAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    tabNumber: string;
    division: { name: string } | null;
    position: { name: string } | null;
  };
};

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  pending: { label: 'На рассмотрении', cls: shared.badgeWarn },
  approved: { label: 'Принята', cls: shared.badgeOk },
  rejected: { label: 'Отклонена', cls: shared.badgeDanger },
  cancelled: { label: 'Отозвана', cls: shared.badgeDraft },
};

const STATUS_TABS: Array<{ id: Status | ''; label: string }> = [
  { id: 'pending', label: 'На рассмотрении' },
  { id: 'approved', label: 'Принятые' },
  { id: 'rejected', label: 'Отклонённые' },
  { id: '', label: 'Все' },
];

const fio = (e: RequestRow['employee']) =>
  [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');

const fmtDate = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export function AdvanceRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'limits' ? 'limits' : 'requests';
  const statusParam = searchParams.get('status');
  const status: Status | '' =
    statusParam === null ? 'pending' : (statusParam as Status | '');

  const role = getSession()?.user?.role;
  const canReview = role === 'platform_admin' || role === 'tenant_admin' || role === 'hr';

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [reviewing, setReviewing] = useState<{ row: RequestRow; verdict: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      const data = await apiFetch<RequestRow[]>(`/api/advance-requests?${qs}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (tab === 'requests') void load();
  }, [tab, load]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [fio(r.employee), r.employee.tabNumber, r.employee.division?.name, r.comment]
        .join(' ')
        .toLowerCase()
        .includes(qq),
    );
  }, [rows, q]);

  const pendingTotal = useMemo(
    () => rows.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0),
    [rows],
  );

  function openReview(row: RequestRow, verdict: 'approved' | 'rejected') {
    setNote('');
    setReviewing({ row, verdict });
  }

  async function submitReview() {
    if (!reviewing) return;
    if (reviewing.verdict === 'rejected' && !note.trim()) {
      setError('Укажите причину отказа — сотрудник увидит её в приложении');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/advance-requests/${reviewing.row.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status: reviewing.verdict, reviewNote: note.trim() || undefined }),
      });
      setFlash(
        reviewing.verdict === 'approved'
          ? `Заявка ${fio(reviewing.row.employee)} принята: ${money(reviewing.row.amount)}. Аванс создан в «Периоды и авансы», сотрудник получил уведомление.`
          : `Заявка ${fio(reviewing.row.employee)} отклонена, сотрудник получил уведомление.`,
      );
      setReviewing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-hand-holding-usd" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Заявки на аванс</h1>
          <p className={shared.pageSubtitle}>
            Сотрудники запрашивают аванс из мобильного приложения. Сумма больше лимита
            приходит только с объяснением.
          </p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'requests'}
          className={tab === 'requests' ? styles.tabOn : styles.tab}
          onClick={() => patchUrl({ tab: null })}
        >
          <i className="fas fa-inbox" aria-hidden /> Заявки
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'limits'}
          className={tab === 'limits' ? styles.tabOn : styles.tab}
          onClick={() => patchUrl({ tab: 'limits', status: null })}
        >
          <i className="fas fa-sliders-h" aria-hidden /> Ограничения
        </button>
      </div>

      {tab === 'limits' ? (
        <AdvanceLimitsTab canEdit={canReview} />
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.chips}>
              {STATUS_TABS.map((t) => (
                <button
                  key={t.id || 'all'}
                  type="button"
                  className={status === t.id ? styles.chipOn : styles.chip}
                  onClick={() => patchUrl({ status: t.id === 'pending' ? null : t.id })}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className={styles.toolRight}>
              {status === 'pending' && rows.length > 0 ? (
                <span className={styles.total}>
                  Всего на рассмотрении: <strong>{money(pendingTotal)}</strong>
                </span>
              ) : null}
              <input
                className={styles.search}
                placeholder="Поиск по ФИО, табельному…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Поиск"
              />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => void load()}
                title="Обновить"
                aria-label="Обновить"
              >
                <i className="fas fa-sync-alt" aria-hidden />
              </button>
            </div>
          </div>

          {flash ? (
            <div className={styles.flash} role="status">
              <i className="fas fa-check-circle" aria-hidden /> {flash}
              <button type="button" className={styles.flashClose} onClick={() => setFlash('')} aria-label="Скрыть">
                ×
              </button>
            </div>
          ) : null}
          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th className={styles.num}>Сумма</th>
                  <th>Лимит</th>
                  <th>Комментарий сотрудника</th>
                  <th>Подана</th>
                  <th>Статус</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className={styles.empty}>
                      Загрузка…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.empty}>
                      {status === 'pending' ? 'Новых заявок нет' : 'Заявок не найдено'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const meta = STATUS_META[r.status];
                    return (
                      <tr key={r.id} className={r.overLimit ? styles.rowOver : undefined}>
                        <td>
                          <div className={styles.fio}>{fio(r.employee)}</div>
                          <div className={styles.sub}>
                            № {r.employee.tabNumber}
                            {r.employee.position?.name ? ` · ${r.employee.position.name}` : ''}
                            {r.employee.division?.name ? ` · ${r.employee.division.name}` : ''}
                          </div>
                        </td>
                        <td className={`${styles.num} ${styles.amount}`}>{money(r.amount)}</td>
                        <td>
                          {r.limitAmount == null ? (
                            <span className={styles.sub}>не задан</span>
                          ) : r.overLimit ? (
                            <span className={styles.overTag} title="Сумма больше лимита">
                              <i className="fas fa-exclamation-triangle" aria-hidden /> выше{' '}
                              {money(r.limitAmount)}
                            </span>
                          ) : (
                            <span className={styles.sub}>до {money(r.limitAmount)}</span>
                          )}
                        </td>
                        <td className={styles.comment}>{r.comment || <span className={styles.sub}>—</span>}</td>
                        <td className={styles.sub}>{fmtDate(r.createdAt)}</td>
                        <td>
                          <span className={`${shared.badge} ${meta.cls}`}>{meta.label}</span>
                          {r.status !== 'pending' && r.status !== 'cancelled' ? (
                            <div className={styles.sub}>
                              {r.reviewedByName ? `${r.reviewedByName}, ` : ''}
                              {fmtDate(r.reviewedAt)}
                              {r.reviewNote ? ` · ${r.reviewNote}` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td className={styles.actions}>
                          {r.status === 'pending' && canReview ? (
                            <>
                              <button
                                type="button"
                                className={styles.approve}
                                onClick={() => openReview(r, 'approved')}
                              >
                                <i className="fas fa-check" aria-hidden /> Принять
                              </button>
                              <button
                                type="button"
                                className={styles.reject}
                                onClick={() => openReview(r, 'rejected')}
                              >
                                <i className="fas fa-times" aria-hidden /> Отклонить
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <FormModal
        open={!!reviewing}
        width="sm"
        title={reviewing?.verdict === 'approved' ? 'Принять заявку на аванс' : 'Отклонить заявку'}
        onClose={() => setReviewing(null)}
        footer={
          <>
            <button type="button" className={modal.btnGhost} onClick={() => setReviewing(null)}>
              Отмена
            </button>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={busy}
              onClick={() => void submitReview()}
            >
              {reviewing?.verdict === 'approved' ? 'Принять' : 'Отклонить'}
            </button>
          </>
        }
      >
        {reviewing ? (
          <div className={modal.fields}>
            <p className={styles.reviewSummary}>
              <strong>{fio(reviewing.row.employee)}</strong> — {money(reviewing.row.amount)}
              {reviewing.row.overLimit ? (
                <span className={styles.overTag}> выше лимита {money(reviewing.row.limitAmount)}</span>
              ) : null}
            </p>
            {reviewing.row.comment ? (
              <p className={styles.reviewComment}>«{reviewing.row.comment}»</p>
            ) : null}
            {reviewing.verdict === 'approved' ? (
              <p className={styles.sub}>
                Будет создан аванс в статусе «Черновик» в разделе «Периоды и авансы» — там его
                отмечают выплаченным.
              </p>
            ) : null}
            <label className={modal.field}>
              <span>
                {reviewing.verdict === 'approved' ? 'Комментарий (необязательно)' : 'Причина отказа'}
                {reviewing.verdict === 'rejected' ? <span className={modal.req}>*</span> : null}
              </span>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </label>
          </div>
        ) : null}
      </FormModal>
    </div>
  );
}
