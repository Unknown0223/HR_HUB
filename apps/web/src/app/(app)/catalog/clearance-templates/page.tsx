'use client';
import { confirm } from '@/lib/dialogs';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import shared from '../../../page-shared.module.css';
import { ClearanceTemplateForm } from './ClearanceTemplateForm';
import styles from './page.module.css';

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  divisionId?: string | null;
  positionId?: string | null;
  requireManagerSign: boolean;
  requireHigherManagerSign: boolean;
  isActive: boolean;
  division?: { id: string; name: string; code: string } | null;
  position?: { id: string; name: string; code: string } | null;
  employees?: { id: string; employeeId: string }[];
};

function yesNo(v: boolean) {
  return v ? 'Да' : 'Нет';
}

function ClearanceTemplatesInner() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; id?: string }>(
    null,
  );

  const closeModal = useCallback(() => setModal(null), []);

  const filtered = useMemo(() => {
    const qq = search.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code, r.division?.name, r.position?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, search]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const someChecked = filtered.some((r) => checked[r.id]) && !allChecked;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TemplateRow[]>('/api/catalog/clearance-templates');
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

  async function remove(row: TemplateRow) {
    if (!(await confirm('Удалить шаблон?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/clearance-templates/${row.id}`, { method: 'DELETE' });
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

  async function bulkDelete() {
    if (!checkedIds.length) return;
    if (!(await confirm(`Удалить выбранные шаблоны (${checkedIds.length})?`))) return;
    setBusy(true);
    setError('');
    try {
      for (const id of checkedIds) {
        await apiFetch(`/api/catalog/clearance-templates/${id}`, { method: 'DELETE' });
      }
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка группового удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `clearance-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Подразделения: r.division?.name || '',
        Должность: r.position?.name || '',
        'Подпись руководителя': yesNo(r.requireManagerSign),
        'Подпись вышестоящего руководителя': yesNo(r.requireHigherManagerSign),
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    try {
      await downloadXlsxViaApi(
        '/api/catalog/clearance-templates/export.xlsx',
        `clearance-templates-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  const modalTitle =
    modal?.mode === 'edit'
      ? 'Шаблон обходного листа (изменение)'
      : 'Шаблон обходного листа (создание)';

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="clearance-templates" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeClearance}`}>
          <i className="fas fa-clipboard-list" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Шаблоны обходных листов</h1>
          <p className={shared.pageSubtitle}>
            Шаблоны пунктов и подписантов для обходных листов
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
        </div>
        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={exportCsv}
            title="CSV"
            aria-label="CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={exportBusy}
            onClick={() => void exportExcel()}
            title="Excel"
            aria-label="Excel"
          >
            <i className="fas fa-file-excel" aria-hidden />
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
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void bulkDelete()}
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
                <th>Подразделения</th>
                <th>Должность</th>
                <th>Подпись руководителя</th>
                <th>Подпись вышестоящего руководителя</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
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
                          aria-label={`Выбрать ${row.name || row.id}`}
                        />
                      </td>
                      <td className={styles.nameCell}>{row.division?.name || '—'}</td>
                      <td>{row.position?.name || '—'}</td>
                      <td>
                        <span
                          className={
                            row.requireManagerSign ? styles.badgeOk : styles.badgeWarn
                          }
                        >
                          {yesNo(row.requireManagerSign)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            row.requireHigherManagerSign
                              ? styles.badgeOk
                              : styles.badgeWarn
                          }
                        >
                          {yesNo(row.requireHigherManagerSign)}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={5}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() => setModal({ mode: 'edit', id: row.id })}
                            >
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
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
            <strong>{filtered.length === 0 ? 0 : `1–${filtered.length}`}</strong> из{' '}
            <strong>{filtered.length}</strong>
          </span>
        </div>
      </div>

      <FormModal
        open={modal !== null}
        title={modalTitle}
        width="lg"
        onClose={closeModal}
      >
        {modal ? (
          <ClearanceTemplateForm
            key={modal.mode === 'edit' ? modal.id : 'create'}
            mode={modal.mode}
            templateId={modal.id}
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

export default function ClearanceTemplatesPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <ClearanceTemplatesInner />
    </Suspense>
  );
}
