'use client';
import { confirm } from '@/lib/dialogs';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import shared from '../../../page-shared.module.css';
import { IncidentTypeForm } from './IncidentTypeForm';
import styles from './page.module.css';

type TypeRow = {
  id: string;
  code: string;
  name: string;
  accrualName?: string | null;
  isActive: boolean;
};

function IncidentTypesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [rows, setRows] = useState<TypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; id?: string }>(
    null,
  );

  const closeModal = useCallback(() => setModal(null), []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code, r.accrualName].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allChecked =
    filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const someChecked = filtered.some((r) => checked[r.id]) && !allChecked;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TypeRow[]>('/api/catalog/incident-types');
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
    setChecked({});
    setSelectedId(null);
  }, [q]);

  function applySearch() {
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(qs ? `/catalog/incident-types?${qs}` : '/catalog/incident-types', {
      scroll: false,
    });
  }

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

  async function remove(row: TypeRow) {
    if (!(await confirm('Удалить тип инцидента?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/incident-types/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkDelete() {
    if (!checkedIds.length) return;
    if (!(await confirm(`Удалить выбранные типы (${checkedIds.length})?`))) return;
    setBusy(true);
    setError('');
    try {
      for (const id of checkedIds) {
        await apiFetch(`/api/catalog/incident-types/${id}`, { method: 'DELETE' });
      }
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `incident-types-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        Начисление: r.accrualName || '',
        Статус: r.isActive ? 'Активный' : 'Неактивный',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="incident-types" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeIncident}`}>
          <i className="fas fa-tags" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Типы инцидентов</h1>
          <p className={shared.pageSubtitle}>Справочник видов дисциплинарных инцидентов</p>
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

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulkDelete()}
          >
            Удалить
          </button>
        </div>
      ) : null}

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
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Название</th>
              <th>Начисление</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
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
                    className={open ? styles.rowSelected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{row.name}</td>
                    <td>{row.accrualName || '—'}</td>
                    <td>
                      <span className={row.isActive ? styles.postedYes : styles.postedNo}>
                        {row.isActive ? 'Активный' : 'Неактивный'}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={4}>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            onClick={() => setModal({ mode: 'edit', id: row.id })}
                          >
                            Изменить
                          </button>
                          <button type="button" disabled={busy} onClick={() => remove(row)}>
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

      <FormModal
        open={modal !== null}
        title={
          modal?.mode === 'edit'
            ? 'Тип инцидента (изменение)'
            : 'Тип инцидента (создание)'
        }
        width="md"
        onClose={closeModal}
      >
        {modal ? (
          <IncidentTypeForm
            key={modal.mode === 'edit' ? modal.id : 'create'}
            mode={modal.mode}
            typeId={modal.id}
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

export default function IncidentTypesPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <IncidentTypesInner />
    </Suspense>
  );
}
