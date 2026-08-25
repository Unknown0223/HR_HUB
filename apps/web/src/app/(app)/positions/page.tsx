'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { useUrlParam } from '@/lib/use-url-state';
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
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
      return [g.code, g.name].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [groups, search, filters]);

  const groupFilterOptions = useMemo(
    () => groups.map((g) => ({ value: g.id, label: g.name })),
    [groups],
  );

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

  return (
    <div className={list.wrap}>
      <PageSubnav groupKey="positions" />

      <div className={list.toolbar}>
        <div className={list.leftActions}>
          {tab === 'groups' ? (
            <Link href="/catalog/position-groups" className={list.createBtn}>
              Создать
            </Link>
          ) : (
            <>
              <Link href="/positions/new" className={list.createBtn}>
                Создать
              </Link>
              <Link href="/positions/import" className={list.importBtn}>
                Импорт
              </Link>
            </>
          )}
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={
              tab === 'positions'
                ? [
                    { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
                    { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
                    {
                      type: 'select',
                      key: 'groupId',
                      label: 'Группа должностей',
                      options: groupFilterOptions,
                    },
                    {
                      type: 'text',
                      key: 'createdBy',
                      label: 'Создал',
                      placeholder: 'Поиск...',
                    },
                    {
                      type: 'dateRange',
                      fromKey: 'from',
                      toKey: 'to',
                      label: 'Дата создания',
                    },
                    {
                      type: 'select',
                      key: 'status',
                      label: 'Статус',
                      options: [
                        { value: 'active', label: 'Активный' },
                        { value: 'inactive', label: 'Неактивный' },
                      ],
                    },
                  ]
                : [
                    { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
                    { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
                    {
                      type: 'select',
                      key: 'status',
                      label: 'Статус',
                      options: [
                        { value: 'active', label: 'Активный' },
                        { value: 'inactive', label: 'Неактивный' },
                      ],
                    },
                  ]
            }
          />
        </div>

        <div className={list.rightTools}>
          <input
            className={list.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className={list.pagerMeta}>
            {tab === 'positions'
              ? `${filteredPositions.length} / ${positions.length}`
              : `${filteredGroups.length} / ${groups.length}`}
          </span>
        </div>
      </div>

      {error ? <p className={list.error}>{error}</p> : null}

      {tab === 'positions' ? (
        <div className={list.tableWrap}>
          <table className={list.table}>
            <thead>
              <tr>
                <th className={list.checkCol} />
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
                return (
                  <Fragment key={d.id}>
                    <tr
                      className={open ? list.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : d.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={open}
                          onChange={() => setSelectedId(open ? null : d.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>{d.code || '—'}</td>
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
                            <Link href={`/positions/${d.id}/edit`}>Изменить</Link>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                try {
                                  await apiFetch(
                                    `/api/organization/positions/${d.id}/active`,
                                    {
                                      method: 'PATCH',
                                      body: JSON.stringify({ isActive: !d.isActive }),
                                    },
                                  );
                                  await load();
                                } catch (err) {
                                  setError(
                                    err instanceof Error ? err.message : 'Ошибка',
                                  );
                                }
                              }}
                            >
                              {d.isActive ? 'Неактивный' : 'Активный'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deletePosition(d.id)}
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
      ) : null}

      {tab === 'groups' ? (
        <div className={list.tableWrap}>
          <table className={list.table}>
            <thead>
              <tr>
                <th className={list.checkCol} />
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
                return (
                  <Fragment key={g.id}>
                    <tr
                      className={open ? list.rowSelected : undefined}
                      onClick={() => setSelectedGroupId(open ? null : g.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={open}
                          onChange={() => setSelectedGroupId(open ? null : g.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>{g.code || '—'}</td>
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
                            <Link href="/catalog/position-groups">Просмотреть</Link>
                            <Link href="/catalog/position-groups">Изменить</Link>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiFetch(`/api/catalog/position-groups/${g.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ isActive: !g.isActive }),
                                  });
                                  await load();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Ошибка');
                                }
                              }}
                            >
                              {g.isActive ? 'Неактивный' : 'Активный'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!(await confirm('Удалить группу?'))) return;
                                try {
                                  await apiFetch(`/api/catalog/position-groups/${g.id}`, {
                                    method: 'DELETE',
                                  });
                                  setSelectedGroupId(null);
                                  await load();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Ошибка');
                                }
                              }}
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
      ) : null}
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
