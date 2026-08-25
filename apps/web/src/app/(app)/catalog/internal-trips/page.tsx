'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { InternalTripCreateModal } from './InternalTripCreateModal';
import styles from './page.module.css';

const FILTER_KEYS = ['status', 'q'] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
};

type Div = { id: string; name: string; code?: string } | null;
type Loc = { id: string; name: string; code?: string } | null;
type Pos = { id: string; name: string; code?: string } | null;

type Row = {
  id: string;
  title: string;
  requestStatus: string;
  status: string;
  visibility: string;
  note?: string | null;
  reviewNote?: string | null;
  startDate: string;
  endDate: string;
  requestDate?: string | null;
  createdAt: string;
  quantity?: number;
  amount?: string | number | null;
  accrualName?: string | null;
  employee: Emp;
  location?: Loc;
  recipientDivision?: Div;
  senderDivision?: Div;
  position?: Pos;
};

type Scope = 'to_me' | 'mine' | 'shared';

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
  return d.toLocaleDateString('ru-RU');
}

function statusLabel(row: Row) {
  if (row.requestStatus === 'approved') return { text: 'Подтвержден', cls: styles.badgeOk };
  if (row.requestStatus === 'pending') return { text: 'В ожидании', cls: styles.badgePending };
  if (row.requestStatus === 'rejected') return { text: 'Отклонен', cls: styles.badgeBad };
  if (row.requestStatus === 'cancelled') return { text: 'Отменен', cls: styles.badgeMuted };
  if (row.requestStatus === 'draft') return { text: 'Черновик', cls: styles.badgeMuted };
  return { text: row.requestStatus, cls: styles.badgeMuted };
}

function parseScope(raw: string | null): Scope {
  if (raw === 'mine') return 'mine';
  if (raw === 'shared' || raw === 'all') return 'shared';
  return 'to_me';
}

function InternalTripsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get('scope'));
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
      qs.set('scope', scope);
      if (filters.status) qs.set('status', filters.status);
      if (filters.q) qs.set('q', filters.q);
      const data = await apiFetch<Row[]>(`/api/hr/internal-trips?${qs}`);
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
      [
        empName(r.employee),
        r.recipientDivision?.name,
        r.senderDivision?.name,
        r.location?.name,
        r.position?.name,
        r.note,
        r.requestStatus,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((r) => checked.has(r.id));
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

  async function review(id: string, status: 'approved' | 'rejected') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/internal-trips/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/internal-trips/${id}/cancel`, { method: 'POST' });
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
      const result = await apiFetch<{ ok: number; total: number }>(
        '/api/hr/internal-trips/bulk-action',
        {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds, action: act }),
        },
      );
      setChecked(new Set());
      setExpandedId(null);
      await load();
      setInfo(`Обработано: ${result.ok} / ${result.total}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка групповой обработки');
    } finally {
      setBusy(false);
    }
  }

  function setScope(next: Scope) {
    const p = new URLSearchParams(searchParams.toString());
    if (next === 'to_me') p.delete('scope');
    else p.set('scope', next);
    router.push(`/catalog/internal-trips?${p}`);
  }

  const showCreate = scope === 'mine';
  const middleCol = scope === 'mine' ? 'Локация' : 'Позиция';

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="internal-trips" />

      <div className={styles.scopeTabs}>
        <button
          type="button"
          className={scope === 'to_me' ? styles.scopeActive : styles.scopeTab}
          onClick={() => setScope('to_me')}
        >
          Запросы мне
        </button>
        <button
          type="button"
          className={scope === 'mine' ? styles.scopeActive : styles.scopeTab}
          onClick={() => setScope('mine')}
        >
          Мои запросы
        </button>
        <button
          type="button"
          className={scope === 'shared' ? styles.scopeActive : styles.scopeTab}
          onClick={() => setScope('shared')}
        >
          Общие запросы
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          {showCreate ? (
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateOpen(true)}
            >
              Создать
            </button>
          ) : null}
          {selectedIds.length > 0 ? (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedIds.length}</span>
              <button
                type="button"
                className={styles.bulkOk}
                disabled={busy}
                onClick={() => bulkAction('approve', 'Подтвердить')}
              >
                Подтвердить
              </button>
              <button
                type="button"
                className={styles.bulkDanger}
                disabled={busy}
                onClick={() => bulkAction('reject', 'Отклонить')}
              >
                Отклонить
              </button>
              <button
                type="button"
                className={styles.bulkClear}
                onClick={() => setChecked(new Set())}
              >
                Сбросить
              </button>
            </div>
          ) : null}
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            ↻
          </button>
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
                  onChange={toggleAll}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Дата создания</th>
              <th>Подразделение (получатель)</th>
              <th>Подразделение (отправитель)</th>
              <th>Сотрудник</th>
              <th>{middleCol}</th>
              <th>Дата начала</th>
              <th>Дата окончания</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const st = statusLabel(row);
                const mid =
                  scope === 'mine'
                    ? row.location?.name || '—'
                    : row.position?.name || '—';
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={checked.has(row.id) ? styles.rowSelected : undefined}
                      onClick={() =>
                        setExpandedId((id) => (id === row.id ? null : row.id))
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked.has(row.id)}
                          onChange={(e) => toggleOne(row.id, e)}
                        />
                      </td>
                      <td>{fmtDt(row.createdAt)}</td>
                      <td>{row.recipientDivision?.name || '—'}</td>
                      <td>{row.senderDivision?.name || '—'}</td>
                      <td>{empName(row.employee)}</td>
                      <td>{mid}</td>
                      <td>{fmtDate(row.startDate)}</td>
                      <td>{fmtDate(row.endDate)}</td>
                      <td>
                        <span className={st.cls}>{st.text}</span>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={9}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/internal-trips/${row.id}`}>
                              Открыть
                            </Link>
                            {row.requestStatus === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void review(row.id, 'approved')}
                                >
                                  Подтвердить
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void review(row.id, 'rejected')}
                                >
                                  Отклонить
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void cancel(row.id)}
                                >
                                  Отменить
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <InternalTripCreateModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (searchParams.get('create') === '1') {
            const p = new URLSearchParams(searchParams.toString());
            p.delete('create');
            const qs = p.toString();
            router.replace(
              qs ? `/catalog/internal-trips?${qs}` : '/catalog/internal-trips',
            );
          }
        }}
        onCreated={(id) => {
          setCreateOpen(false);
          void load();
          router.push(`/catalog/internal-trips/${id}`);
        }}
      />
    </div>
  );
}

export default function InternalTripsPage() {
  return (
    <Suspense fallback={null}>
      <InternalTripsInner />
    </Suspense>
  );
}
