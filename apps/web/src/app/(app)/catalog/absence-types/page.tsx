'use client';
import { confirm } from '@/lib/dialogs';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type TimeTypeRef = { id: string; code: string; name: string };

type AbsenceTypeRow = {
  id: string;
  code: string;
  name: string;
  calcKind: string;
  description?: string | null;
  accrualName?: string | null;
  timeTypeId?: string | null;
  paid: boolean;
  isActive: boolean;
  isAnnual?: boolean;
  requestTimeLimit?: boolean;
  allowEmployeeRequest?: boolean;
  trackUnusedTime?: boolean;
  carryoverPolicy?: string | null;
  timeType?: TimeTypeRef | null;
};

const FILTER_KEYS = ['q', 'status'] as const;

function yesNo(v?: boolean | null) {
  if (v == null) return '—';
  return v ? 'Да' : 'Нет';
}

function FlagSwitch({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <label
      className={styles.flagSwitch}
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.flagTrack} />
      <span className={styles.flagHint}>{checked ? 'Да' : 'Нет'}</span>
    </label>
  );
}

function calcLabel(kind?: string | null) {
  return kind === 'one_time' ? 'Разовый' : 'Годовой';
}

function AbsenceTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const statusFilter = filters.status;

  const [rows, setRows] = useState<AbsenceTypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(q || statusFilter));
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      router.replace('/catalog/absence-types/new');
    }
  }, [searchParams, router]);

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          r.name,
          r.code,
          r.description,
          r.accrualName,
          r.timeType?.name,
          calcLabel(r.calcKind),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (statusFilter === 'active') list = list.filter((r) => r.isActive);
    else if (statusFilter === 'inactive') list = list.filter((r) => !r.isActive);
    return list;
  }, [rows, q, statusFilter]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AbsenceTypeRow[]>('/api/hr/absence-types?all=1');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/absence-types?${qs}` : '/catalog/absence-types',
      { scroll: false },
    );
  }

  function openCreate() {
    router.push('/catalog/absence-types/new');
  }

  async function runDelete(row: AbsenceTypeRow) {
    if (!(await confirm(`Удалить / деактивировать «${row.name}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/absence-types/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function toggleFlag(
    row: AbsenceTypeRow,
    field: 'isAnnual' | 'requestTimeLimit' | 'allowEmployeeRequest' | 'trackUnusedTime',
    value: boolean,
  ) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/absence-types/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `absence-types-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        'Вид времени': r.timeType?.name || '',
        'Является ежегодным': yesNo(r.isAnnual ?? r.calcKind === 'annual'),
        'Ограничение времени запроса': r.requestTimeLimit ? 'Да' : '',
        'Разрешить сотрудникам создавать запрос': yesNo(r.allowEmployeeRequest ?? true),
        'Учитывать неиспользованное время': yesNo(r.trackUnusedTime),
        'Политика переноса': r.carryoverPolicy || '',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="absence-types" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={openCreate}
          >
            Создать
          </button>
          <Link href="/catalog/absence-requests" className={styles.exportBtn}>
            Закрыть
          </Link>
          <FilterPanel
            inline
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'active', label: 'Активный' },
                  { value: 'inactive', label: 'Неактивный' },
                ],
              },
            ]}
          />
        </div>

        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <button type="button" className={styles.toolBtn} onClick={applySearch}>
            Найти
          </button>
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => load()}>
            Обновить
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Вид времени</th>
              <th className={styles.flagCell}>Ежегодный</th>
              <th className={styles.flagCell}>Огр. запроса</th>
              <th className={styles.flagCell}>Разрешить запрос</th>
              <th className={styles.flagCell}>Неисп. время</th>
              <th>Политика переноса</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              return (
                <tr
                  key={row.id}
                  className={open ? styles.rowSelected : undefined}
                  onClick={() => setSelectedId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className={styles.nameCell}>
                    <label className={styles.nameWithCheck}>
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => setSelectedId(open ? null : row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className={styles.nameText}>
                        {row.name}
                        {!row.isActive ? ' (неакт.)' : ''}
                      </span>
                    </label>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/catalog/absence-types/${row.id}`}>Просмотр</Link>
                        <Link href={`/catalog/absence-types/${row.id}/edit`}>Изменить</Link>
                        <Link href={`/catalog/absence-types/${row.id}/employees`}>
                          Сотрудники
                        </Link>
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => void runDelete(row)}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td>{row.timeType?.name || '—'}</td>
                  <td className={styles.flagCell}>
                    <FlagSwitch
                      title="Является ежегодным"
                      checked={!!(row.isAnnual ?? row.calcKind === 'annual')}
                      onChange={(v) => void toggleFlag(row, 'isAnnual', v)}
                    />
                  </td>
                  <td className={styles.flagCell}>
                    <FlagSwitch
                      title="Ограничение времени запроса"
                      checked={!!row.requestTimeLimit}
                      onChange={(v) => void toggleFlag(row, 'requestTimeLimit', v)}
                    />
                  </td>
                  <td className={styles.flagCell}>
                    <FlagSwitch
                      title="Разрешить сотрудникам создавать запрос"
                      checked={row.allowEmployeeRequest !== false}
                      onChange={(v) => void toggleFlag(row, 'allowEmployeeRequest', v)}
                    />
                  </td>
                  <td className={styles.flagCell}>
                    <FlagSwitch
                      title="Учитывать неиспользованное время"
                      checked={!!row.trackUnusedTime}
                      onChange={(v) => void toggleFlag(row, 'trackUnusedTime', v)}
                    />
                  </td>
                  <td>{row.carryoverPolicy || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AbsenceTypesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <AbsenceTypesPageInner />
    </Suspense>
  );
}
