'use client';
import { confirm } from '@/lib/dialogs';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const FILTER_KEYS = ['status', 'from', 'to', 'q'] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
};

type Row = {
  id: string;
  workDate: string;
  number?: number | null;
  shiftLabel: string;
  status: string;
  replaced: boolean;
  source: string;
  note?: string | null;
  employee: Emp;
  replacedBy?: Emp | null;
  schedule?: { id: string; name: string; code: string } | null;
  shift?: {
    id: string;
    code: string;
    name: string;
    startTime?: string;
    endTime?: string;
  } | null;
};

function empName(e?: Emp | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function statusLabel(status: string, replaced: boolean) {
  if (replaced || status === 'replaced') {
    return { text: 'Заменено', cls: styles.badgeMuted };
  }
  if (status === 'planned') return { text: 'Запланировано', cls: styles.badgePending };
  if (status === 'completed') return { text: 'Выполнено', cls: styles.badgeOk };
  if (status === 'cancelled') return { text: 'Отменено', cls: styles.badgeBad };
  return { text: status, cls: styles.badgeMuted };
}

function sourceLabel(source: string) {
  if (source === 'roster') return 'Расписание';
  if (source === 'roster_change') return 'Изменение расписания';
  if (source === 'individual') return 'Индивидуальный график';
  if (source === 'position') return 'График позиции';
  if (source === 'schedule') return 'График работы';
  if (source === 'manual') return 'Вручную';
  return source || '—';
}

function monthBounds(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

function ScheduleShiftsInner() {
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const defaults = monthBounds();
  const from = filters.from || searchParams.get('from') || defaults.from;
  const to = filters.to || searchParams.get('to') || defaults.to;

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filters.q || '');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (filters.status) qs.set('status', filters.status);
      if (filters.q) qs.set('q', filters.q);
      const data = await apiFetch<Row[]>(`/api/catalog/shift-assignments?${qs}`);
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, filters.status, filters.q]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        empName(r.employee),
        r.shiftLabel,
        r.schedule?.name,
        sourceLabel(r.source),
        r.status,
        empName(r.replacedBy),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const selectedIds = useMemo(() => [...checked], [checked]);
  const allFilteredChecked =
    filtered.length > 0 && filtered.every((r) => checked.has(r.id));
  const someFilteredChecked = filtered.some((r) => checked.has(r.id));

  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    el.indeterminate = someFilteredChecked && !allFilteredChecked;
  }, [someFilteredChecked, allFilteredChecked]);

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
    e?.stopPropagation?.();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function rebuild() {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ created: number; rosters: number }>(
        '/api/catalog/shift-assignments/rebuild',
        {
          method: 'POST',
          body: JSON.stringify({ from, to }),
        },
      );
      setInfo(
        `Обновлено: ${res.created} смен из ${res.rosters} проведённых расписаний`,
      );
      setChecked(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка обновления');
    } finally {
      setBusy(false);
    }
  }

  async function bulkAction(action: string, label: string) {
    if (!selectedIds.length) return;
    if (!(await confirm(`${label} выбранные смены (${selectedIds.length})?`))) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ ok: number; skipped: number }>(
        '/api/catalog/shift-assignments/bulk-action',
        {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds, action }),
        },
      );
      setChecked(new Set());
      await load();
      setInfo(
        `Обработано: ${res.ok}${res.skipped ? `, пропущено: ${res.skipped}` : ''}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка групповой обработки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="schedule-shifts" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            disabled={busy}
            onClick={() => void rebuild()}
          >
            {busy ? '…' : 'Обновить из расписаний'}
          </button>
          {selectedIds.length > 0 ? (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedIds.length}</span>
              <button
                type="button"
                className={styles.bulkOk}
                disabled={busy}
                onClick={() => void bulkAction('complete', 'Отметить выполненными')}
              >
                Выполнено
              </button>
              <button
                type="button"
                className={styles.bulkDanger}
                disabled={busy}
                onClick={() => void bulkAction('cancel', 'Отменить')}
              >
                Отменить
              </button>
              <button
                type="button"
                className={styles.bulkClear}
                disabled={busy}
                onClick={() => void bulkAction('plan', 'Вернуть в план')}
              >
                В план
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
                onClick={() => setChecked(new Set())}
              >
                Сбросить
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
                type: 'dateRange',
                fromKey: 'from',
                toKey: 'to',
                label: 'Период',
              },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'planned', label: 'Запланировано' },
                  { value: 'replaced', label: 'Заменено' },
                  { value: 'completed', label: 'Выполнено' },
                  { value: 'cancelled', label: 'Отменено' },
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
                  ref={headerCheckRef}
                  type="checkbox"
                  checked={allFilteredChecked}
                  onChange={toggleAll}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Сотрудник</th>
              <th>Дата</th>
              <th>№</th>
              <th>Смена</th>
              <th>Статус</th>
              <th>Заменено</th>
              <th>Источник</th>
              <th>График работы</th>
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
                const st = statusLabel(row.status, row.replaced);
                const shiftText = row.shift
                  ? `${row.shift.code ? `${row.shift.code} — ` : ''}${row.shift.name}`
                  : row.shiftLabel;
                return (
                  <tr
                    key={row.id}
                    className={checked.has(row.id) ? styles.rowSelected : undefined}
                    onClick={() => toggleOne(row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked.has(row.id)}
                        onChange={(e) => toggleOne(row.id, e)}
                      />
                    </td>
                    <td>{empName(row.employee)}</td>
                    <td>{fmtDate(row.workDate)}</td>
                    <td>{row.number ?? '—'}</td>
                    <td>{shiftText}</td>
                    <td>
                      <span className={st.cls}>{st.text}</span>
                    </td>
                    <td>
                      {row.replaced || row.replacedBy
                        ? empName(row.replacedBy) || 'Да'
                        : '—'}
                    </td>
                    <td>{sourceLabel(row.source)}</td>
                    <td>{row.schedule?.name || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ScheduleShiftsPage() {
  return (
    <Suspense fallback={null}>
      <ScheduleShiftsInner />
    </Suspense>
  );
}
