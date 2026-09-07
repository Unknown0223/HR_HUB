'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { useUrlParam } from '@/lib/use-url-state';
import { PositionForm } from './PositionForm';
import list from './list.module.css';
import shared from '../../page-shared.module.css';

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

const CREATE_FORM_ID = 'position-create-form';

function PositionsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab] = useUrlParam('tab', 'positions', TABS);
  const filters = useFilterFromUrl(POS_FILTER_KEYS);
  const [positions, setPositions] = useState<Position[]>([]);
  const [groups, setGroups] = useState<PositionGroupRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [checkedPos, setCheckedPos] = useState<Record<string, boolean>>({});
  const [checkedGroup, setCheckedGroup] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupActive, setGroupActive] = useState(true);

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

  function clearCreateParam() {
    if (searchParams?.get('create') !== '1') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openCreate() {
    setCreateSaving(false);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateSaving(false);
    clearCreateParam();
  }

  function openGroupForm(row?: PositionGroupRow) {
    setGroupEditId(row?.id ?? null);
    setGroupCode(row?.code ?? '');
    setGroupName(row?.name ?? '');
    setGroupActive(row ? row.isActive !== false : true);
    setGroupError('');
    setGroupSaving(false);
    setGroupOpen(true);
  }

  function closeGroupForm() {
    setGroupOpen(false);
    setGroupSaving(false);
    clearCreateParam();
  }

  const createParamHandled = useRef(false);

  useEffect(() => {
    if (searchParams?.get('create') !== '1') {
      createParamHandled.current = false;
      return;
    }
    if (createParamHandled.current) return;
    createParamHandled.current = true;
    if (tab === 'groups') openGroupForm();
    else openCreate();
  }, [searchParams, tab]);

  async function saveGroup() {
    if (!groupName.trim()) {
      setGroupError('Название обязательно');
      return;
    }
    setGroupSaving(true);
    setGroupError('');
    try {
      const body = {
        code: groupCode.trim() || `PG-${Date.now().toString(36).toUpperCase()}`,
        name: groupName.trim(),
        isActive: groupActive,
      };
      if (groupEditId) {
        await apiFetch(`/api/catalog/position-groups/${groupEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/position-groups', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      closeGroupForm();
      await load();
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setGroupSaving(false);
    }
  }

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

  const checkedPosIds = useMemo(
    () => Object.keys(checkedPos).filter((id) => checkedPos[id]),
    [checkedPos],
  );
  const checkedGroupIds = useMemo(
    () => Object.keys(checkedGroup).filter((id) => checkedGroup[id]),
    [checkedGroup],
  );

  const allPosChecked =
    filteredPositions.length > 0 && filteredPositions.every((d) => checkedPos[d.id]);
  const somePosChecked =
    filteredPositions.some((d) => checkedPos[d.id]) && !allPosChecked;

  const allGroupChecked =
    filteredGroups.length > 0 && filteredGroups.every((g) => checkedGroup[g.id]);
  const someGroupChecked =
    filteredGroups.some((g) => checkedGroup[g.id]) && !allGroupChecked;

  useEffect(() => {
    setCheckedPos({});
    setCheckedGroup({});
  }, [
    tab,
    search,
    filters.code,
    filters.name,
    filters.groupId,
    filters.createdBy,
    filters.from,
    filters.to,
    filters.status,
  ]);

  function togglePosCheck(id: string) {
    setCheckedPos((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPos(on: boolean) {
    setCheckedPos((prev) => {
      const next = { ...prev };
      for (const d of filteredPositions) {
        if (on) next[d.id] = true;
        else delete next[d.id];
      }
      return next;
    });
  }

  function toggleGroupCheck(id: string) {
    setCheckedGroup((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllGroup(on: boolean) {
    setCheckedGroup((prev) => {
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
      setCheckedPos((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkPositions(action: 'activate' | 'deactivate' | 'delete') {
    const targets = filteredPositions.filter((d) => checkedPos[d.id]);
    if (!targets.length) return;

    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные должности (${targets.length} шт.)?`))) {
        return;
      }
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const d of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/organization/positions/${d.id}`, {
              method: 'DELETE',
            });
          } else {
            const isActive = action === 'activate';
            if (d.isActive === isActive) continue;
            await apiFetch(`/api/organization/positions/${d.id}/active`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive }),
            });
          }
        } catch {
          failed += 1;
        }
      }
      setCheckedPos({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  async function runBulkGroups(action: 'activate' | 'deactivate' | 'delete') {
    const targets = filteredGroups.filter((g) => checkedGroup[g.id]);
    if (!targets.length) return;

    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные группы (${targets.length} шт.)?`))) {
        return;
      }
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const g of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/position-groups/${g.id}`, {
              method: 'DELETE',
            });
          } else {
            const isActive = action === 'activate';
            if (g.isActive === isActive) continue;
            await apiFetch(`/api/catalog/position-groups/${g.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive }),
            });
          }
        } catch {
          failed += 1;
        }
      }
      setCheckedGroup({});
      setSelectedGroupId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  const pageTitle = tab === 'groups' ? 'Группы должностей' : 'Должности';
  const pageSubtitle =
    tab === 'groups'
      ? 'Группы должностей организации'
      : 'Штатные должности организации';

  return (
    <div className={list.wrap}>
      <PageSubnav groupKey="positions" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`}>
          <i className="fas fa-id-badge" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>{pageTitle}</h1>
          <p className={shared.pageSubtitle}>{pageSubtitle}</p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={list.searchWrap}>
            <i className={`fas fa-search ${list.searchIcon}`} aria-hidden />
            <input
              className={list.search}
              placeholder="Поиск…"
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
            <button
              type="button"
              className={list.createBtn}
              onClick={() => openGroupForm()}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать
            </button>
          ) : (
            <>
              <button type="button" className={list.createBtn} onClick={openCreate}>
                <i className="fas fa-plus" aria-hidden />
                Создать
              </button>
              <Link href="/positions/import" className={list.importBtn}>
                <i className="fas fa-file-import" aria-hidden />
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
              filtersOpen ? `${list.iconBtn} ${list.iconBtnActive}` : list.iconBtn
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

      {tab === 'positions' && checkedPosIds.length > 0 ? (
        <div className={list.bulkBar}>
          <span className={list.bulkMeta}>
            Выбрано: <strong>{checkedPosIds.length}</strong>
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
            <i className="fas fa-pause" aria-hidden />
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
            onClick={() => setCheckedPos({})}
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
            <i className="fas fa-pause" aria-hidden />
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
            onClick={() => setCheckedGroup({})}
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
                      onChange={(e) => toggleAllPos(e.target.checked)}
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
                  const isChecked = Boolean(checkedPos[d.id]);
                  return (
                    <Fragment key={d.id}>
                      <tr
                        className={open || isChecked ? list.rowSelected : undefined}
                        onClick={() => setSelectedId(open ? null : d.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className={list.checkCol}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePosCheck(d.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Выбрать ${d.code || d.name}`}
                          />
                        </td>
                        <td>{d.code || '—'}</td>
                        <td className={list.nameCell}>{d.name}</td>
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
                              <Link href={`/positions/${d.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                              <Link href={`/employees?positionId=${d.id}`}>
                                <i className="fas fa-users" aria-hidden />
                                Сотрудники
                              </Link>
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
                                      err instanceof Error ? err.message : 'Ошибка',
                                    );
                                  }
                                }}
                              >
                                <i
                                  className={`fas ${d.isActive ? 'fa-pause' : 'fa-check'}`}
                                  aria-hidden
                                />
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
            <p>
              Показано{' '}
              <strong>
                {filteredPositions.length === 0 ? 0 : 1}–{filteredPositions.length}
              </strong>{' '}
              из <strong>{filteredPositions.length}</strong>
            </p>
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
                      onChange={(e) => toggleAllGroup(e.target.checked)}
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
                  const isChecked = Boolean(checkedGroup[g.id]);
                  return (
                    <Fragment key={g.id}>
                      <tr
                        className={open || isChecked ? list.rowSelected : undefined}
                        onClick={() => setSelectedGroupId(open ? null : g.id)}
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
                        <td>{g.code || '—'}</td>
                        <td className={list.nameCell}>{g.name}</td>
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
                              <button type="button" onClick={() => openGroupForm(g)}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </button>
                              <Link href={`/positions?tab=positions&groupId=${g.id}`}>
                                <i className="fas fa-id-badge" aria-hidden />
                                Должности
                              </Link>
                              <button
                                type="button"
                                disabled={busy}
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
                                      err instanceof Error ? err.message : 'Ошибка',
                                    );
                                  }
                                }}
                              >
                                <i
                                  className={`fas ${g.isActive ? 'fa-pause' : 'fa-check'}`}
                                  aria-hidden
                                />
                                {g.isActive ? 'Неактивный' : 'Активный'}
                              </button>
                              <button
                                type="button"
                                className={list.danger}
                                disabled={busy}
                                onClick={async () => {
                                  if (!(await confirm('Удалить группу?'))) return;
                                  try {
                                    await apiFetch(
                                      `/api/catalog/position-groups/${g.id}`,
                                      { method: 'DELETE' },
                                    );
                                    setSelectedGroupId(null);
                                    await load();
                                  } catch (err) {
                                    setError(
                                      err instanceof Error ? err.message : 'Ошибка',
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
            <p>
              Показано{' '}
              <strong>
                {filteredGroups.length === 0 ? 0 : 1}–{filteredGroups.length}
              </strong>{' '}
              из <strong>{filteredGroups.length}</strong>
            </p>
          </div>
        </div>
      ) : null}

      <FormModal
        open={createOpen}
        title="Должность (создание)"
        onClose={closeCreate}
        width="lg"
        footer={
          <>
            <button
              type="submit"
              form={CREATE_FORM_ID}
              className={modal.btnPrimary}
              disabled={createSaving}
            >
              {createSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button type="button" className={modal.btnGhost} onClick={closeCreate}>
              Закрыть
            </button>
          </>
        }
      >
        <PositionForm
          mode="create"
          variant="modal"
          formId={CREATE_FORM_ID}
          onSavingChange={setCreateSaving}
          onSaved={() => {
            closeCreate();
            void load();
          }}
        />
      </FormModal>

      <FormModal
        open={groupOpen}
        title={
          groupEditId ? 'Группа должностей (изменение)' : 'Группа должностей (создание)'
        }
        onClose={closeGroupForm}
        width="sm"
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={groupSaving}
              onClick={() => void saveGroup()}
            >
              {groupSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button type="button" className={modal.btnGhost} onClick={closeGroupForm}>
              Закрыть
            </button>
          </>
        }
      >
        {groupError ? <p className={modal.error}>{groupError}</p> : null}
        <div className={modal.fields}>
          <label className={modal.field}>
            <span>
              Название <em className={modal.req}>*</em>
            </span>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </label>
          <label className={modal.field}>
            <span>Код</span>
            <input
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
              placeholder="авто"
            />
          </label>
          <label className={modal.radio}>
            <input
              type="checkbox"
              checked={groupActive}
              onChange={(e) => setGroupActive(e.target.checked)}
            />
            Активный
          </label>
        </div>
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
