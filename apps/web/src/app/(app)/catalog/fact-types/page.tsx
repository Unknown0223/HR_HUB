'use client';

import { confirm } from '@/lib/dialogs';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { FactTypeFormModal } from './FactTypeFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type FactTypeRow = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
  parentId?: string | null;
  accrualName?: string | null;
  registry?: RegistryLine[] | null;
  isActive?: boolean;
  parent?: { id: string; name: string } | null;
};

type RegistryLine = {
  id?: string;
  startDate?: string;
  endDate?: string;
  cycleTime?: string;
  price?: string;
};

const FILTER_KEYS = ['q', 'status'] as const;
const COL_COUNT = 5;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

function FactTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const statusFilter = filters.status;

  const [rows, setRows] = useState<FactTypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(q || statusFilter));
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [registryFor, setRegistryFor] = useState<FactTypeRow | null>(null);
  const [registryLines, setRegistryLines] = useState<RegistryLine[]>([]);
  const [regSaving, setRegSaving] = useState(false);
  const [regError, setRegError] = useState('');

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [r.name, r.code, r.unit, r.parent?.name, r.accrualName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (statusFilter === 'active') list = list.filter((r) => r.isActive !== false);
    else if (statusFilter === 'inactive') list = list.filter((r) => r.isActive === false);
    return list;
  }, [rows, q, statusFilter]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allPageChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const somePageChecked = filtered.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
        if (on) next[r.id] = true;
        else delete next[r.id];
      }
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<FactTypeRow[] | { items: FactTypeRow[] }>(
        '/api/catalog/fact-types',
      );
      setRows(Array.isArray(data) ? data : data.items || []);
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
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    const create = searchParams.get('create') === '1';
    const edit = searchParams.get('edit');
    if (create || edit) {
      setEditId(edit || null);
      setModalOpen(true);
    }
  }, [searchParams]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/fact-types?${qs}` : '/catalog/fact-types', {
      scroll: false,
    });
  }

  function openCreate() {
    setEditId(null);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    if (searchParams.get('create') === '1' || searchParams.get('edit')) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      params.delete('edit');
      const qs = params.toString();
      router.replace(qs ? `/catalog/fact-types?${qs}` : '/catalog/fact-types', {
        scroll: false,
      });
    }
  }

  async function runDelete(row: FactTypeRow) {
    if (!(await confirm(`Удалить тип «${row.name}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/fact-types/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'delete' | 'activate' | 'deactivate') {
    const targets = filtered.filter((r) => checked[r.id]);
    if (targets.length === 0) return;

    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные типы фактов (${targets.length} шт.)?`))) {
        return;
      }
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/fact-types/${row.id}`, { method: 'DELETE' });
          } else {
            const isActive = action === 'activate';
            if ((row.isActive !== false) === isActive) continue;
            await apiFetch(`/api/catalog/fact-types/${row.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive }),
            });
          }
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function openRegistry(row: FactTypeRow) {
    const lines = Array.isArray(row.registry) ? row.registry : [];
    setRegError('');
    setRegistryFor(row);
    setRegistryLines(
      lines.length
        ? lines.map((l) => ({ ...l, id: l.id || uid() }))
        : [{ id: uid(), startDate: '', endDate: '', cycleTime: '', price: '' }],
    );
  }

  async function saveRegistry() {
    if (!registryFor) return;
    setRegSaving(true);
    setRegError('');
    try {
      const registry = registryLines
        .filter((l) => l.startDate || l.endDate || l.cycleTime || l.price)
        .map(({ startDate, endDate, cycleTime, price }) => ({
          startDate: startDate || null,
          endDate: endDate || null,
          cycleTime: cycleTime || null,
          price: price || null,
        }));
      await apiFetch(`/api/catalog/fact-types/${registryFor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ registry }),
      });
      setRegistryFor(null);
      await load();
    } catch (e) {
      setRegError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRegSaving(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `fact-types-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        Код: r.code || '',
        Родитель: r.parent?.name || '',
        'Единица измерения': r.unit || 'Количество',
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="fact-types" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-cubes" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Типы фактов</h1>
          <p className={shared.pageSubtitle}>
            Справочник типов фактов, единиц измерения и реестра цен
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch();
              }}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <FilterPanel
            inline
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
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
              filtersOpen ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn
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
            onClick={exportCsv}
            title="CSV"
            aria-label="Экспорт CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
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
            Активировать
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('deactivate')}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulk('delete')}
          >
            <i className="fas fa-trash" aria-hidden />
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
                    checked={allPageChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageChecked;
                    }}
                    onChange={(e) => toggleAllPage(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Название</th>
                <th>Название типа родителя</th>
                <th>Единица измерения</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
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
                      <td>{row.parent?.name || '—'}</td>
                      <td>{row.unit || 'Количество'}</td>
                      <td>
                        {row.isActive === false ? (
                          <span className={styles.statusMuted}>Неактивный</span>
                        ) : (
                          <span className={styles.statusActive}>Активный</span>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
                          <div className={styles.rowActions}>
                            <button type="button" onClick={() => openRegistry(row)}>
                              <i className="fas fa-list" aria-hidden />
                              Реестр
                            </button>
                            <button type="button" onClick={() => openEdit(row.id)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void runDelete(row)}
                            >
                              <i className="fas fa-trash" aria-hidden />
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
          <p>
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <FactTypeFormModal
        open={modalOpen}
        editId={editId}
        parents={rows}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void load();
        }}
      />

      <FormModal
        open={Boolean(registryFor)}
        title={registryFor ? `Реестр — ${registryFor.name}` : 'Реестр'}
        onClose={() => setRegistryFor(null)}
        width="lg"
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={regSaving}
              onClick={() => void saveRegistry()}
            >
              {regSaving ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => setRegistryFor(null)}
            >
              Закрыть
            </button>
          </>
        }
      >
        {regError ? <p className={modal.error}>{regError}</p> : null}
        <div className={styles.tableScroll}>
          <table className={styles.table} style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Дата начала</th>
                <th>Дата окончания</th>
                <th>Время цикла</th>
                <th>Цена</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {registryLines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <input
                      type="date"
                      value={line.startDate || ''}
                      onChange={(e) =>
                        setRegistryLines((prev) =>
                          prev.map((x) =>
                            x.id === line.id ? { ...x, startDate: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={line.endDate || ''}
                      onChange={(e) =>
                        setRegistryLines((prev) =>
                          prev.map((x) =>
                            x.id === line.id ? { ...x, endDate: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={line.cycleTime || ''}
                      onChange={(e) =>
                        setRegistryLines((prev) =>
                          prev.map((x) =>
                            x.id === line.id ? { ...x, cycleTime: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={line.price || ''}
                      onChange={(e) =>
                        setRegistryLines((prev) =>
                          prev.map((x) =>
                            x.id === line.id ? { ...x, price: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() =>
                        setRegistryLines((prev) => prev.filter((x) => x.id !== line.id))
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className={styles.bulkGhost}
          style={{ marginLeft: 0, marginTop: 8 }}
          onClick={() =>
            setRegistryLines((prev) => [
              ...prev,
              { id: uid(), startDate: '', endDate: '', cycleTime: '', price: '' },
            ])
          }
        >
          + Добавить строку
        </button>
      </FormModal>
    </div>
  );
}

export default function FactTypesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <FactTypesPageInner />
    </Suspense>
  );
}
