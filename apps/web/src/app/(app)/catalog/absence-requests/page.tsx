'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { AbsenceRequestCreateModal } from './AbsenceRequestCreateModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = ['status', 'q'] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
};

type Row = {
  id: string;
  status: string;
  note?: string | null;
  managerNote?: string | null;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  createdAt: string;
  employee: Emp;
  absenceType: { id: string; name: string };
  meta?: Record<string, unknown> | null;
};

function empName(e: Emp) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeLabel(row: Row) {
  const meta = row.meta || {};
  const kind = String(meta.requestKind || '');
  const start = row.startDate;
  const end = row.endDate;
  const st = row.startTime || (typeof meta.startTime === 'string' ? meta.startTime : '');
  const et = row.endTime || (typeof meta.endTime === 'string' ? meta.endTime : '');
  const daySpan =
    Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;

  if (kind === 'part_day' || (st && et && daySpan <= 1)) {
    return `${fmtDate(start)} ${st || ''}${st && et ? `-${et}` : et || ''}`.trim();
  }
  if (kind === 'full_day' || daySpan === 1) {
    return `${fmtDate(start)} (Полный день)`;
  }
  return `${fmtDate(start)} - ${fmtDate(end)} (${daySpan} дн.)`;
}

function statusLabel(row: Row) {
  const meta = row.meta || {};
  if (meta.completed) return { text: 'Завершён', cls: styles.badgeDone };
  if (row.status === 'approved') return { text: 'Подтвержден', cls: styles.badgeOk };
  if (row.status === 'pending') return { text: 'В ожидании', cls: styles.badgePending };
  if (row.status === 'rejected') return { text: 'Отклонен', cls: styles.badgeBad };
  if (row.status === 'cancelled') return { text: 'Отменен', cls: styles.badgeMuted };
  if (row.status === 'draft') return { text: 'Черновик', cls: styles.badgeMuted };
  return { text: row.status, cls: styles.badgeMuted };
}

function AbsenceRequestsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') === 'mine' ? 'mine' : 'available';
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filters.q || '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(
    () => searchParams.get('create') === '1',
  );

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('scope', scope === 'mine' ? 'mine' : 'available');
      if (filters.status) qs.set('status', filters.status);
      if (filters.q) qs.set('q', filters.q);
      const data = await apiFetch<Row[]>(`/api/hr/absences?${qs}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setChecked(new Set());
    setExpandedId(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, filters.status, filters.q]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [empName(r.employee), r.absenceType?.name, r.note, r.managerNote, r.status]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((r) => checked.has(r.id));
  const someFilteredChecked = filtered.some((r) => checked.has(r.id));
  const selectedIds = useMemo(() => [...checked], [checked]);

  function toggleAll() {
    if (allFilteredChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function toggleOne(id: string, e?: React.MouseEvent | React.ChangeEvent) {
    e?.stopPropagation();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function action(id: string, act: string) {
    setBusy(true);
    setError('');
    try {
      if (act === 'approve' || act === 'reject') {
        await apiFetch(`/api/hr/absences/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ action: act }),
        });
      } else {
        await apiFetch(`/api/hr/absences/${id}/${act}`, { method: 'POST' });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulkAction(act: string, label: string) {
    if (!selectedIds.length) return;
    if (!(await confirm(`${label} выбранные запросы (${selectedIds.length})?`))) {
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const result = await apiFetch<{
        ok: number;
        skipped: number;
        errors?: { id: string; message: string }[];
      }>('/api/hr/absences/bulk-action', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, action: act }),
      });
      setChecked(new Set());
      setExpandedId(null);
      await load();
      if (result.skipped > 0) {
        const detail = (result.errors || [])
          .map((e) => e.message)
          .filter(Boolean)
          .slice(0, 3)
          .join('; ');
        setError(
          `Обработано: ${result.ok}, пропущено: ${result.skipped}${
            detail ? ` (${detail})` : ''
          }`,
        );
      } else {
        setInfo(`Обработано: ${result.ok}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка групповой обработки');
    } finally {
      setBusy(false);
    }
  }

  function setScope(next: 'mine' | 'available') {
    const p = new URLSearchParams(searchParams.toString());
    if (next === 'mine') p.set('scope', 'mine');
    else p.delete('scope');
    router.push(`/catalog/absence-requests?${p}`);
  }

  const colCount = scope === 'available' ? 7 : 7;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="absence-requests" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeRequest}`}>
          <i className="fas fa-calendar-check" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Запросы на отсутствие</h1>
          <p className={shared.pageSubtitle}>
            Согласование отпусков, отгулов и прочих отсутствий
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.scopeTabs}>
            <button
              type="button"
              className={scope === 'mine' ? styles.scopeActive : styles.scopeTab}
              onClick={() => setScope('mine')}
            >
              Мои
            </button>
            <button
              type="button"
              className={scope === 'available' ? styles.scopeActive : styles.scopeTab}
              onClick={() => setScope('available')}
            >
              Доступные
            </button>
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setCreateOpen(true)}
          >
            Создать
          </button>
          {selectedIds.length > 0 ? (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>Выбрано: {selectedIds.length}</span>
              {scope === 'available' ? (
                <>
                  <button
                    type="button"
                    className={styles.bulkOk}
                    disabled={busy}
                    onClick={() => void bulkAction('approve', 'Подтвердить')}
                  >
                    Подтвердить
                  </button>
                  <button
                    type="button"
                    className={styles.bulkWarn}
                    disabled={busy}
                    onClick={() => void bulkAction('complete', 'Завершить')}
                  >
                    Завершить
                  </button>
                  <button
                    type="button"
                    className={styles.bulkMuted}
                    disabled={busy}
                    onClick={() => void bulkAction('restore', 'Восстановить')}
                  >
                    Восстановить
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={styles.bulkMuted}
                disabled={busy}
                onClick={() => void bulkAction('cancel', 'Отменить')}
              >
                Отменить
              </button>
              <button
                type="button"
                className={styles.bulkDanger}
                disabled={busy}
                onClick={() => void bulkAction('delete', 'Удалить')}
              >
                Удалить
              </button>
              <button
                type="button"
                className={styles.bulkClear}
                disabled={busy}
                onClick={() => setChecked(new Set())}
              >
                Снять выделение
              </button>
            </div>
          ) : null}
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              {
                type: 'select',
                key: 'status',
                label: 'Состояние',
                options: [
                  { value: 'pending', label: 'В ожидании' },
                  { value: 'approved', label: 'Подтвержден' },
                  { value: 'rejected', label: 'Отклонен' },
                  { value: 'cancelled', label: 'Отменен' },
                  { value: 'draft', label: 'Черновик' },
                ],
              },
              { type: 'text', key: 'q', label: 'Поиск', placeholder: 'Поиск...' },
            ]}
          />
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            ↻
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length}/{rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.info}>{info}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allFilteredChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someFilteredChecked && !allFilteredChecked;
                  }}
                  onChange={toggleAll}
                  disabled={!filtered.length}
                  title="Выбрать все"
                  aria-label="Выбрать все"
                />
              </th>
              {scope === 'available' ? <th>Сотрудник</th> : null}
              <th>Дата запроса</th>
              <th>Вид отсутствия</th>
              <th>Время</th>
              <th>Примечание</th>
              {scope === 'mine' ? <th>Примечание руководителя</th> : null}
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const expanded = expandedId === row.id;
              const isChecked = checked.has(row.id);
              const st = statusLabel(row);
              return (
                <Fragment key={row.id}>
                  <tr
                    className={
                      expanded || isChecked ? styles.rowSelected : undefined
                    }
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => toggleOne(row.id, e)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    {scope === 'available' ? <td>{empName(row.employee)}</td> : null}
                    <td>{fmtDt(row.createdAt)}</td>
                    <td>{row.absenceType?.name || '—'}</td>
                    <td>{timeLabel(row)}</td>
                    <td>{row.note || '—'}</td>
                    {scope === 'mine' ? <td>{row.managerNote || '—'}</td> : null}
                    <td>
                      <span className={st.cls}>{st.text}</span>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={colCount}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/absence-requests/${row.id}`}>
                            Просмотреть
                          </Link>
                          {scope === 'available' ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void action(row.id, 'approve')}
                              >
                                Подтвердить
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void action(row.id, 'complete')}
                              >
                                Завершить
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void action(row.id, 'cancel')}
                              >
                                Отменить
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void action(row.id, 'restore')}
                              >
                                Восстановить
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void action(row.id, 'cancel')}
                            >
                              Отменить
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <AbsenceRequestCreateModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (searchParams.get('create') === '1') {
            const p = new URLSearchParams(searchParams.toString());
            p.delete('create');
            const qs = p.toString();
            router.replace(
              qs
                ? `/catalog/absence-requests?${qs}`
                : '/catalog/absence-requests',
            );
          }
        }}
        onCreated={() => {
          void load();
        }}
      />
    </div>
  );
}

export default function AbsenceRequestsPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <AbsenceRequestsInner />
    </Suspense>
  );
}
