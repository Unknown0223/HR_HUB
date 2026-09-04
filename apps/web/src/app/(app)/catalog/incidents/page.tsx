'use client';
import { confirm } from '@/lib/dialogs';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';
import { IncidentForm } from './IncidentForm';

type EmpRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber: string;
};

type IncidentRow = {
  id: string;
  number?: string | null;
  title: string;
  occurredAt: string;
  action: string;
  damageAmount?: string | number | null;
  employee?: EmpRef | null;
  incidentType?: { id: string; name: string } | null;
};

const ACTION_LABEL: Record<string, string> = {
  verbal_warning: 'Устное предупреждение',
  written_warning: 'Письменное предупреждение',
  fine: 'Штраф',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function empName(e?: EmpRef | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function money(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function IncidentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; id?: string }>(
    null,
  );

  const closeModal = useCallback(() => setModal(null), []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [
        r.number,
        r.title,
        empName(r.employee),
        r.incidentType?.name,
        ACTION_LABEL[r.action] || r.action,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<IncidentRow[]>('/api/catalog/incidents');
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
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(qs ? `/catalog/incidents?${qs}` : '/catalog/incidents', { scroll: false });
  }

  async function remove(row: IncidentRow) {
    if (!(await confirm('Удалить инцидент?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/incidents/${row.id}`, { method: 'DELETE' });
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
      `incidents-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        'Номер инцидента': r.number || r.title,
        'Дата инцидента': fmtDate(r.occurredAt),
        'Физическое лицо': empName(r.employee),
        'Тип инцидента': r.incidentType?.name || '',
        'Сумма ущерба': money(r.damageAmount),
        Действие: ACTION_LABEL[r.action] || r.action,
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    try {
      await downloadXlsxViaApi(
        '/api/catalog/incidents/export.xlsx',
        `incidents-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="incidents" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeIncident}`}>
          <i className="fas fa-exclamation-triangle" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Инциденты</h1>
          <p className={shared.pageSubtitle}>Регистрация и учёт дисциплинарных инцидентов</p>
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
          <button
            type="button"
            className={styles.exportBtn}
            disabled={exportBusy}
            onClick={() => void exportExcel()}
          >
            {exportBusy ? 'Excel…' : 'Excel'}
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
              <th className={styles.checkCol} />
              <th>Номер инцидента</th>
              <th>Дата инцидента</th>
              <th>Физическое лицо</th>
              <th>Тип инцидента</th>
              <th>Сумма ущерба</th>
              <th>Действие</th>
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
                    <td>{row.number || row.title}</td>
                    <td>{fmtDate(row.occurredAt)}</td>
                    <td className={styles.empName}>{empName(row.employee)}</td>
                    <td>{row.incidentType?.name || '—'}</td>
                    <td>{money(row.damageAmount)}</td>
                    <td>{ACTION_LABEL[row.action] || row.action}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={7}>
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
        title={modal?.mode === 'edit' ? 'Инцидент (изменение)' : 'Инцидент (создание)'}
        width="xl"
        onClose={closeModal}
      >
        {modal ? (
          <IncidentForm
            key={modal.mode === 'edit' ? modal.id : 'create'}
            mode={modal.mode}
            incidentId={modal.id}
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

export default function IncidentsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <IncidentsInner />
    </Suspense>
  );
}
