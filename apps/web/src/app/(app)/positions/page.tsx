'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { useUrlParam } from '@/lib/use-url-state';
import shared from '../../page-shared.module.css';
import { PositionForm } from './PositionForm';
import list from './list.module.css';

type Tab = 'positions' | 'groups';
const TABS = ['positions', 'groups'] as const;

const POS_FILTER_KEYS = [
  'code',
  'name',
  'groupId',
  'createdBy',
  'from',
  'to',
  'status',
] as const;

type Position = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  createdByLabel?: string | null;
  positionGroup?: { id: string; name: string; code: string } | null;
};

type PositionGroupRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  _count?: { positions?: number };
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? list.badgeOk : list.badgeWarn}>
      {active ? 'Активный' : 'Неактивный'}
    </span>
  );
}

function fmtCreated(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function PositionsPageInner() {
  const [tab] = useUrlParam('tab', 'positions', TABS);
  const filters = useFilterFromUrl(POS_FILTER_KEYS);
  const [positions, setPositions] = useState<Position[]>([]);
  const [groups, setGroups] = useState<PositionGroupRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [checkedGroups, setCheckedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; id?: string }>(
    null,
  );

  const closeModal = useCallback(() => setModal(null), []);


  async function load() {
    try {
      const [p, g] = await Promise.all([
        apiFetch<Position[]>('/api/organization/positions'),
        apiFetch<PositionGroupRow[]>('/api/catalog/position-groups'),
      ]);
      setPositions(Array.isArray(p) ? p : []);
      setGroups(Array.isArray(g) ? g : []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredPositions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const groupF = (filters.groupId || '').trim();
    const createdByF = (filters.createdBy || '').trim().toLowerCase();
    const statusF = (filters.status || '').trim();
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return positions.filter((d) => {
      if (codeF && !(d.code || '').toLowerCase().includes(codeF)) return false;
      if (nameF && !(d.name || '').toLowerCase().includes(nameF)) return false;
      if (groupF && d.positionGroup?.id !== groupF) return false;
      if (
        createdByF &&
        !(d.createdByLabel || 'Admin').toLowerCase().includes(createdByF)
      ) {
        return false;
      }
      if (statusF === 'active' && !d.isActive) return false;
      if (statusF === 'inactive' && d.isActive) return false;
      if (from || to) {
        if (!d.createdAt) return false;
        const created = new Date(d.createdAt);
        if (Number.isNaN(created.getTime())) return false;
        if (from && created < from) return false;
        if (to && created > to) return false;
      }
      if (!q) return true;
      const blob = [d.code, d.name, d.createdByLabel, d.positionGroup?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [positions, search, filters]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const statusF = (filters.status || '').trim();
    return groups.filter((g) => {
      if (codeF && !(g.code || '').toLowerCase().includes(codeF)) return false;
      if (nameF && !(g.name || '').toLowerCase().includes(nameF)) return false;
      if (statusF === 'active' && !g.isActive) return false;
      if (statusF === 'inactive' && g.isActive) return false;
      if (!q) return true;
      return [g.code, g.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [groups, search, filters]);

  const groupFilterOptions = useMemo(
    () => groups.map((g) => ({ value: g.id, label: g.name })),
    [groups],
  );

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const checkedGroupIds = useMemo(
    () => Object.keys(checkedGroups).filter((id) => checkedGroups[id]),
    [checkedGroups],
  );

  const allPosChecked =
    filteredPositions.length > 0 &&
    filteredPositions.every((d) => checked[d.id]);
  const somePosChecked =
    filteredPositions.some((d) => checked[d.id]) && !allPosChecked;

  const allGroupChecked =
    filteredGroups.length > 0 &&
    filteredGroups.every((g) => checkedGroups[g.id]);
  const someGroupChecked =
    filteredGroups.some((g) => checkedGroups[g.id]) && !allGroupChecked;

  useEffect(() => {
    setChecked({});
    setCheckedGroups({});
    setSelectedId(null);
    setSelectedGroupId(null);
  }, [tab, search]);

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPositions(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const d of filteredPositions) {
        if (on) next[d.id] = true;
        else delete next[d.id];
      }
      return next;
    });
  }

  function toggleGroupCheck(id: string) {
    setCheckedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllGroups(on: boolean) {
    setCheckedGroups((prev) => {
      const next = { ...prev };
      for (const g of filteredGroups) {
        if (on) next[g.id] = true;
        else delete next[g.id];
      }
      return next;
    });
  }

  async function deletePosition(id: string) {
    if (!(await confirm('Удалить должность?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/organization/positions/${id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkPositions(
    action: 'delete' | 'activate' | 'deactivate',
  ) {
    if (!checkedIds.length) return;
    if (action === 'delete') {
      if (
        !(await confirm(
          `Удалить выбранные должности (${checkedIds.length})?`,
        ))
      ) {
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      for (const id of checkedIds) {
        if (action === 'delete') {
          await apiFetch(`/api/organization/positions/${id}`, {
            method: 'DELETE',
          });
        } else {
          await apiFetch(`/api/organization/positions/${id}/active`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: action === 'activate' }),
          });
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обработки');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkGroups(action: 'delete' | 'activate' | 'deactivate') {
    if (!checkedGroupIds.length) return;
    if (action === 'delete') {
      if (
        !(await confirm(
          `Удалить выбранные группы (${checkedGroupIds.length})?`,
        ))
      ) {
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      for (const id of checkedGroupIds) {
        if (action === 'delete') {
          await apiFetch(`/api/catalog/position-groups/${id}`, {
            method: 'DELETE',
          });
        } else {
          await apiFetch(`/api/catalog/position-groups/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: action === 'activate' }),
          });
        }
      }
      setCheckedGroups({});
      setSelectedGroupId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обработки');
    } finally {
      setBusy(false);
    }
  }

  const filterFields =
    tab === 'positions'
      ? [
          {
            type: 'text' as const,
            key: 'code',
            label: 'Код',
            placeholder: 'Поиск...',
          },
          {
            type: 'text' as const,
            key: 'name',
            label: 'Название',
            placeholder: 'Поиск...',
          },
          {
            type: 'select' as const,
            key: 'groupId',
            label: 'Группа должностей',
            options: groupFilterOptions,
          },
          {
            type: 'text' as const,
            key: 'createdBy',
            label: 'Создал',
            placeholder: 'Поиск...',
          },
          {
            type: 'dateRange' as const,
            fromKey: 'from',
            toKey: 'to',
            label: 'Дата создания',
          },
          {
            type: 'select' as const,
            key: 'status',
            label: 'Статус',
            options: [
              { value: 'active', label: 'Активный' },
              { value: 'inactive', label: 'Неактивный' },
            ],
          },
        ]
      : [
          {
            type: 'text' as const,
            key: 'code',
            label: 'Код',
            placeholder: 'Поиск...',
          },
          {
            type: 'text' as const,
            key: 'name',
            label: 'Название',
            placeholder: 'Поиск...',
          },
          {
            type: 'select' as const,
            key: 'status',
            label: 'Статус',
            options: [
              { value: 'active', label: 'Активный' },
              { value: 'inactive', label: 'Неактивный' },
            ],
          },
        ];

  return (
    <div className={list.wrap}>
      <PageSubnav groupKey="positions" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTransfer}`}>
          <i
            className={tab === 'groups' ? 'fas fa-folder' : 'fas fa-briefcase'}
            aria-hidden
          />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>
            {tab === 'groups' ? 'Группа должностей' : 'Должности'}
          </h1>
          <p className={shared.pageSubtitle}>
            {tab === 'groups'
              ? 'Категории должностей для классификации штата'
              : 'Справочник должностей организации'}
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={list.searchWrap}>
            <i className={`fas fa-search ${list.searchIcon}`} aria-hidden />
            <input
              className={list.search}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={list.toolbar}>
        <div className={list.leftActions}>
          {tab === 'groups' ? (
            <Link href="/catalog/position-groups" className={list.createBtn}>
              <i className="fas fa-plus" aria-hidden />
              Создать
            </Link>
          ) : (
            <>
              <button
                type="button"
                className={list.createBtn}
                onClick={() => setModal({ mode: 'create' })}
              >
                <i className="fas fa-plus" aria-hidden />
                Создать
              </button>
              <Link href="/positions/import" className={list.importBtn}>
                <i className="fas fa-upload" aria-hidden />
                Импорт
              </Link>
            </>
          )}
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={filterFields}
          />
        </div>

        <div className={list.rightTools}>
          <span className={list.countBadge}>
            {tab === 'positions'
              ? `${filteredPositions.length} / ${positions.length}`
              : `${filteredGroups.length} / ${groups.length}`}
          </span>
          <button
            type="button"
            className={
              filtersOpen
                ? `${list.iconBtn} ${list.iconBtnActive}`
                : list.iconBtn
            }
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
          <button
            type="button"
            className={list.iconBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
          </button>
        </div>
      </div>

      {error ? <p className={list.error}>{error}</p> : null}

      {tab === 'positions' && checkedIds.length > 0 ? (
        <div className={list.bulkBar}>
          <span className={list.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <button
            type="button"
            className={list.bulkBtn}
            disabled={busy}
            onClick={() => void runBulkPositions('activate')}
          >
            <i className="fas fa-check" aria-hidden />
            Активный
          </button>
          <button
            type="button"
            className={list.bulkBtn}
            disabled={busy}
            onClick={() => void runBulkPositions('deactivate')}
          >
            <i className="fas fa-ban" aria-hidden />
            Неактивный
          </button>
          <button
            type="button"
            className={`${list.bulkBtn} ${list.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulkPositions('delete')}
          >
            <i className="fas fa-trash-alt" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={list.bulkGhost}
            disabled={busy}
            onClick={() => setChecked({})}
          >
            Снять выделение
          </button>
        </div>
      ) : null}

      {tab === 'groups' && checkedGroupIds.length > 0 ? (
        <div className={list.bulkBar}>
          <span className={list.bulkMeta}>
            Выбрано: <strong>{checkedGroupIds.length}</strong>
          </span>
          <button
            type="button"
            className={list.bulkBtn}
            disabled={busy}
            onClick={() => void runBulkGroups('activate')}
          >
            <i className="fas fa-check" aria-hidden />
            Активный
          </button>
          <button
            type="button"
            className={list.bulkBtn}
            disabled={busy}
            onClick={() => void runBulkGroups('deactivate')}
          >
            <i className="fas fa-ban" aria-hidden />
            Неактивный
          </button>
          <button
            type="button"
            className={`${list.bulkBtn} ${list.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulkGroups('delete')}
          >
            <i className="fas fa-trash-alt" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={list.bulkGhost}
            disabled={busy}
            onClick={() => setCheckedGroups({})}
          >
            Снять выделение
          </button>
        </div>
      ) : null}

      {tab === 'positions' ? (
        <div className={list.tableWrap}>
          <div className={list.tableScroll}>
            <table className={list.table}>
              <thead>
                <tr>
                  <th className={list.checkCol}>
                    <input
                      type="checkbox"
                      checked={allPosChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = somePosChecked;
                      }}
                      onChange={(e) => toggleAllPositions(e.target.checked)}
                      aria-label="Выбрать все"
                    />
                  </th>
                  <th>Код</th>
                  <th>Название</th>
                  <th>Группа должностей</th>
                  <th>Создал</th>
                  <th>Дата создания</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((d) => {
                  const open = selectedId === d.id;
                  const isChecked = Boolean(checked[d.id]);
                  return (
                    <Fragment key={d.id}>
                      <tr
                        className={
                          open || isChecked ? list.rowSelected : undefined
                        }
                        onClick={() => setSelectedId(open ? null : d.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className={list.checkCol}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(d.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Выбрать ${d.code || d.name}`}
                          />
                        </td>
                        <td className={list.codeCell}>{d.code || '—'}</td>
                        <td>{d.name}</td>
                        <td>{d.positionGroup?.name || '—'}</td>
                        <td>{d.createdByLabel || 'Admin'}</td>
                        <td>{fmtCreated(d.createdAt)}</td>
                        <td>
                          <StatusBadge active={d.isActive} />
                        </td>
                      </tr>
                      {open ? (
                        <tr className={list.actionsRow}>
                          <td colSpan={7}>
                            <div className={list.rowActions}>
                              <button
                                type="button"
                                onClick={() =>
                                  setModal({ mode: 'edit', id: d.id })
                                }
                              >
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  try {
                                    await apiFetch(
                                      `/api/organization/positions/${d.id}/active`,
                                      {
                                        method: 'PATCH',
                                        body: JSON.stringify({
                                          isActive: !d.isActive,
                                        }),
                                      },
                                    );
                                    await load();
                                  } catch (err) {
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Ошибка',
                                    );
                                  }
                                }}
                              >
                                {d.isActive ? 'Неактивный' : 'Активный'}
                              </button>
                              <button
                                type="button"
                                className={list.danger}
                                disabled={busy}
                                onClick={() => void deletePosition(d.id)}
                              >
                                <i className="fas fa-trash-alt" aria-hidden />
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {filteredPositions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={list.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className={list.footer}>
            <span>
              Показано{' '}
              <strong>
                {filteredPositions.length === 0
                  ? 0
                  : `1–${filteredPositions.length}`}
              </strong>{' '}
              из <strong>{filteredPositions.length}</strong>
            </span>
          </div>
        </div>
      ) : null}

      {tab === 'groups' ? (
        <div className={list.tableWrap}>
          <div className={list.tableScroll}>
            <table className={list.table}>
              <thead>
                <tr>
                  <th className={list.checkCol}>
                    <input
                      type="checkbox"
                      checked={allGroupChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someGroupChecked;
                      }}
                      onChange={(e) => toggleAllGroups(e.target.checked)}
                      aria-label="Выбрать все"
                    />
                  </th>
                  <th>Код</th>
                  <th>Название</th>
                  <th>Кол-во должностей</th>
                  <th>Создал</th>
                  <th>Дата создания</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((g) => {
                  const open = selectedGroupId === g.id;
                  const isChecked = Boolean(checkedGroups[g.id]);
                  return (
                    <Fragment key={g.id}>
                      <tr
                        className={
                          open || isChecked ? list.rowSelected : undefined
                        }
                        onClick={() =>
                          setSelectedGroupId(open ? null : g.id)
                        }
                        style={{ cursor: 'pointer' }}
                      >
                        <td className={list.checkCol}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleGroupCheck(g.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Выбрать ${g.code || g.name}`}
                          />
                        </td>
                        <td className={list.codeCell}>{g.code || '—'}</td>
                        <td>{g.name}</td>
                        <td>{g._count?.positions ?? 0}</td>
                        <td>Admin</td>
                        <td>{fmtCreated(g.createdAt)}</td>
                        <td>
                          <StatusBadge active={g.isActive} />
                        </td>
                      </tr>
                      {open ? (
                        <tr className={list.actionsRow}>
                          <td colSpan={7}>
                            <div className={list.rowActions}>
                              <Link href="/catalog/position-groups">
                                <i className="fas fa-eye" aria-hidden />
                                Просмотреть
                              </Link>
                              <Link href="/catalog/position-groups">
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiFetch(
                                      `/api/catalog/position-groups/${g.id}`,
                                      {
                                        method: 'PATCH',
                                        body: JSON.stringify({
                                          isActive: !g.isActive,
                                        }),
                                      },
                                    );
                                    await load();
                                  } catch (err) {
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Ошибка',
                                    );
                                  }
                                }}
                              >
                                {g.isActive ? 'Неактивный' : 'Активный'}
                              </button>
                              <button
                                type="button"
                                className={list.danger}
                                onClick={async () => {
                                  if (!(await confirm('Удалить группу?')))
                                    return;
                                  try {
                                    await apiFetch(
                                      `/api/catalog/position-groups/${g.id}`,
                                      { method: 'DELETE' },
                                    );
                                    setSelectedGroupId(null);
                                    await load();
                                  } catch (err) {
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Ошибка',
                                    );
                                  }
                                }}
                              >
                                <i className="fas fa-trash-alt" aria-hidden />
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={list.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className={list.footer}>
            <span>
              Показано{' '}
              <strong>
                {filteredGroups.length === 0
                  ? 0
                  : `1–${filteredGroups.length}`}
              </strong>{' '}
              из <strong>{filteredGroups.length}</strong>
            </span>
          </div>
        </div>
      ) : null}

      <FormModal
        open={modal !== null}
        title={
          modal?.mode === 'edit'
            ? 'Должность (изменение)'
            : 'Должность (создание)'
        }
        width="xl"
        onClose={closeModal}
      >
        {modal ? (
          <PositionForm
            key={modal.mode === 'edit' ? modal.id : 'create'}
            mode={modal.mode}
            positionId={modal.id}
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

export default function PositionsPage() {
  return (
    <Suspense fallback={<p className={list.empty}>Загрузка…</p>}>
      <PositionsPageInner />
    </Suspense>
  );
}
