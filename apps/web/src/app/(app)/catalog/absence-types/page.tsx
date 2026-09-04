'use client';
import { confirm } from '@/lib/dialogs';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { ListBulkBar, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';
import { AbsenceTypeForm } from './AbsenceTypeForm';

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
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; id?: string }>(
    null,
  );

  const closeModal = useCallback(() => {
    setModal(null);
    if (searchParams.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const qs = params.toString();
      router.replace(
        qs ? `/catalog/absence-types?${qs}` : '/catalog/absence-types',
        { scroll: false },
      );
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setModal({ mode: 'create' });
    }
  }, [searchParams]);

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

  const checkedIds = useMemo(() => [...checked], [checked]);
  const allChecked =
    filtered.length > 0 && filtered.every((r) => checked.has(r.id));
  const someChecked = filtered.some((r) => checked.has(r.id)) && !allChecked;

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
    void load();
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

  async function runDelete(row: AbsenceTypeRow) {
    if (!(await confirm(`Удалить / деактивировать «${row.name}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/absence-types/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setChecked((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkDelete() {
    if (!checkedIds.length) return;
    if (
      !(await confirm(
        `Удалить / деактивировать выбранные виды (${checkedIds.length})?`,
      ))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const id of checkedIds) {
        await apiFetch(`/api/hr/absence-types/${id}`, { method: 'DELETE' });
      }
      setChecked(new Set());
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

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeAbsence}`}>
          <i className="fas fa-tags" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Виды отсутствий</h1>
          <p className={shared.pageSubtitle}>
            Типы отпусков, больничных и прочих отсутствий
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            aria-label="Поиск"
          />
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setModal({ mode: 'create' })}
          >
            Создать
          </button>
          <ListBulkBar
            count={checkedIds.length}
            busy={busy}
            onClear={() => setChecked(new Set())}
            actions={[
              {
                key: 'delete',
                label: 'Удалить',
                count: checkedIds.length,
                variant: 'danger',
                onClick: () => void runBulkDelete(),
              },
            ]}
          />
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
          <button type="button" className={styles.toolBtn} onClick={applySearch}>
            Найти
          </button>
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
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
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) =>
                    setChecked(togglePage(checked, filtered.map((r) => r.id), e.target.checked))
                  }
                  disabled={!filtered.length}
                  aria-label="Выбрать все"
                />
              </th>
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
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const isChecked = checked.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={open || isChecked ? styles.rowSelected : undefined}
                  onClick={() => setSelectedId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setChecked(toggleSelect(checked, row.id, e.target.checked))
                      }
                      aria-label={`Выбрать ${row.name}`}
                    />
                  </td>
                  <td className={styles.nameCell}>
                    <span className={styles.nameText}>
                      {row.name}
                      {!row.isActive ? ' (неакт.)' : ''}
                    </span>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/catalog/absence-types/${row.id}`}>Просмотр</Link>
                        <button
                          type="button"
                          onClick={() => setModal({ mode: 'edit', id: row.id })}
                        >
                          Изменить
                        </button>
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

      <FormModal
        open={modal !== null}
        title={
          modal?.mode === 'edit'
            ? 'Вид отсутствия (изменение)'
            : 'Вид отсутствия (создание)'
        }
        width="lg"
        onClose={closeModal}
      >
        {modal ? (
          <AbsenceTypeForm
            key={modal.mode === 'edit' ? modal.id : 'create'}
            typeId={modal.mode === 'edit' ? modal.id : undefined}
            mode="edit"
            embedded
            onSuccess={() => {
              closeModal();
              void load();
            }}
            onCancel={closeModal}
          />
        ) : null}
      </FormModal>
    </div>
  );
}

export default function AbsenceTypesPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <AbsenceTypesPageInner />
    </Suspense>
  );
}
