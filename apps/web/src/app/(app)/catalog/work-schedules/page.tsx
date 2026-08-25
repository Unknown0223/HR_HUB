'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const FILTER_KEYS = ['name', 'code', 'kind'] as const;

export type ScheduleKind =
  | 'ordinary'
  | 'hourly'
  | 'advanced'
  | 'multi_shift'
  | 'advanced_multi_shift';

const KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'ordinary', label: 'Обычный' },
  { kind: 'hourly', label: 'По-часовой' },
  { kind: 'advanced', label: 'Продвинутый' },
  { kind: 'multi_shift', label: 'Многосменный' },
  { kind: 'advanced_multi_shift', label: 'Продвинутый многосменный' },
];

const KIND_LABEL: Record<ScheduleKind, string> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k.label]),
) as Record<ScheduleKind, string>;

type Row = {
  id: string;
  name: string;
  code: string;
  kind?: ScheduleKind;
  isActive: boolean;
  updatedAt?: string;
};

function WorkSchedulesInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Row[]>('/api/attendance/schedules');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [createOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const kindF = (filters.kind || '').trim();
    return rows.filter((r) => {
      if (nameF && !(r.name || '').toLowerCase().includes(nameF)) return false;
      if (codeF && !(r.code || '').toLowerCase().includes(codeF)) return false;
      if (kindF && (r.kind || 'ordinary') !== kindF) return false;
      if (!q) return true;
      return [r.name, r.code, r.kind].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, filters]);

  async function remove(row: Row) {
    if (!(await confirm(`Удалить график «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/schedules/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="work-schedules" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <div className={styles.createWrap} ref={createRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateOpen((v) => !v)}
            >
              Создать ▾
            </button>
            {createOpen ? (
              <div className={styles.createMenu}>
                {KINDS.map((k) => (
                  <Link
                    key={k.kind}
                    href={`/catalog/work-schedules/new?kind=${k.kind}`}
                    onClick={() => setCreateOpen(false)}
                  >
                    {k.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'kind',
                label: 'Тип',
                options: KINDS.map((k) => ({ value: k.kind, label: k.label })),
              },
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

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Название</th>
              <th>Код</th>
              <th>Тип</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const kind = (row.kind || 'ordinary') as ScheduleKind;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open ? styles.rowSelected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => setSelectedId(open ? null : row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{row.name}</td>
                    <td>{row.code || '—'}</td>
                    <td>{KIND_LABEL[kind] || kind}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={4}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/work-schedules/${row.id}`}>Изменить</Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(row)}
                          >
                            Удалить
                          </button>
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
    </div>
  );
}

export default function WorkSchedulesPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <WorkSchedulesInner />
    </Suspense>
  );
}
