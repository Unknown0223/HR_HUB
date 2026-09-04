'use client';
import { confirm } from '@/lib/dialogs';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import shared from '../../../page-shared.module.css';
import { TariffGroupForm } from './TariffGroupForm';
import styles from './page.module.css';

const FILTER_KEYS = ['name', 'fullName', 'status'] as const;

type TariffGroup = {
  id: string;
  code: string;
  name: string;
  fullName?: string | null;
  isActive: boolean;
  updatedAt?: string;
  baseRate?: string | number;
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function TariffGroupsInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<TariffGroup[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; id?: string }>(
    null,
  );

  const closeModal = useCallback(() => setModal(null), []);


  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TariffGroup[]>('/api/catalog/tariff-groups');
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const fullF = (filters.fullName || '').trim().toLowerCase();
    const statusF = (filters.status || '').trim();
    return rows.filter((r) => {
      if (nameF && !(r.name || '').toLowerCase().includes(nameF)) return false;
      if (fullF && !(r.fullName || r.name || '').toLowerCase().includes(fullF))
        return false;
      if (statusF === 'active' && !r.isActive) return false;
      if (statusF === 'inactive' && r.isActive) return false;
      if (!q) return true;
      return [r.name, r.fullName, r.code].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, filters]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allChecked =
    filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const someChecked = filtered.some((r) => checked[r.id]) && !allChecked;

  useEffect(() => {
    setChecked({});
    setSelectedId(null);
  }, [search]);

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
        if (on) next[r.id] = true;
        else delete next[r.id];
      }
      return next;
    });
  }

  async function remove(row: TariffGroup) {
    if (!(await confirm('Удалить тарифную группу?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/tariff-groups/${row.id}`, {
        method: 'DELETE',
      });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: TariffGroup) {
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/tariff-groups/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'delete' | 'activate' | 'deactivate') {
    if (!checkedIds.length) return;
    if (action === 'delete') {
      if (
        !(await confirm(
          `Удалить выбранные тарифные группы (${checkedIds.length})?`,
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
          await apiFetch(`/api/catalog/tariff-groups/${id}`, {
            method: 'DELETE',
          });
        } else {
          await apiFetch(`/api/catalog/tariff-groups/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: action === 'activate' }),
          });
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка обработки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="tariff-groups" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-percentage" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Тарифные группы</h1>
          <p className={shared.pageSubtitle}>
            Группы тарифных ставок для расчёта окладов
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setModal({ mode: 'create' })}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              {
                type: 'text',
                key: 'name',
                label: 'Название',
                placeholder: 'Поиск...',
              },
              {
                type: 'text',
                key: 'fullName',
                label: 'Полное название',
                placeholder: 'Поиск...',
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
            ]}
          />
        </div>
        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={
              filtersOpen
                ? `${styles.iconBtn} ${styles.iconBtnActive}`
                : styles.iconBtn
            }
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
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

      {error ? <p className={styles.error}>{error}</p> : null}

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('activate')}
          >
            <i className="fas fa-check" aria-hidden />
            Активный
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('deactivate')}
          >
            <i className="fas fa-ban" aria-hidden />
            Неактивный
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulk('delete')}
          >
            <i className="fas fa-trash-alt" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setChecked({})}
          >
            Снять выделение
          </button>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
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
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Название</th>
                <th>Полное название</th>
                <th>Дата последнего изменения</th>
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
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={
                        open || isChecked ? styles.rowSelected : undefined
                      }
                      onClick={() => setSelectedId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.name}`}
                        />
                      </td>
                      <td className={styles.nameCell}>{row.name}</td>
                      <td>{row.fullName || row.name || '—'}</td>
                      <td>{fmtDate(row.updatedAt)}</td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={4}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() =>
                                setModal({ mode: 'edit', id: row.id })
                              }
                            >
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleActive(row)}
                            >
                              {row.isActive ? 'Неактивный' : 'Активный'}
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void remove(row)}
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
            </tbody>
          </table>
        </div>
        <div className={styles.footer}>
          <span>
            Показано{' '}
            <strong>
              {filtered.length === 0 ? 0 : `1–${filtered.length}`}
            </strong>{' '}
            из <strong>{filtered.length}</strong>
          </span>
        </div>
      </div>

      <FormModal
        open={modal !== null}
        title={
          modal?.mode === 'edit'
            ? 'Тарифная группа (изменение)'
            : 'Тарифная группа (создание)'
        }
        width="md"
        onClose={closeModal}
      >
        {modal ? (
          <TariffGroupForm
            key={modal.mode === 'edit' ? modal.id : 'create'}
            mode={modal.mode}
            groupId={modal.id}
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

export default function TariffGroupsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <TariffGroupsInner />
    </Suspense>
  );
}
