'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';
import {
  CREATE_PRESETS,
  KIND_LABELS,
  STATUS_LABELS,
  formPageTitle,
  type HrChangeKind,
} from './kinds';
import { downloadXlsxViaApi } from '@/lib/excel';
import { HrChangeRequestForm } from './HrChangeRequestForm';

type ChangeRow = {
  id: string;
  kind: HrChangeKind;
  status: string;
  number?: string | null;
  requestDate: string;
  title?: string | null;
  createdByLabel?: string | null;
  createdAt: string;
  staffPosition?: { id: string; title: string; code: string } | null;
  position?: { id: string; name: string } | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    tabNumber: string;
  } | null;
  candidateLastName?: string | null;
  candidateFirstName?: string | null;
};

const FILTER_KEYS = ['q', 'number', 'kind', 'status', 'from', 'to'] as const;

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU');
}

function positionLabel(row: ChangeRow) {
  if (row.staffPosition?.title) return row.staffPosition.title;
  if (row.position?.name) return row.position.name;
  const cand = [row.candidateLastName, row.candidateFirstName].filter(Boolean).join(' ');
  if (cand) return cand;
  if (row.employee) return `${row.employee.lastName} ${row.employee.firstName}`;
  return '—';
}

function HrRequestsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const from = filters.from;
  const to = filters.to;
  const numberFilter = filters.number;
  const kindFilter = filters.kind as HrChangeKind | '';
  const statusFilter = filters.status;

  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || from || to || numberFilter || kindFilter || statusFilter),
  );
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);
  const [exportBusy, setExportBusy] = useState(false);
  const [modal, setModal] = useState<null | {
    mode: 'create' | 'edit';
    id?: string;
    kind?: HrChangeKind;
  }>(null);

  const closeModal = useCallback(() => setModal(null), []);

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          r.number,
          r.title,
          KIND_LABELS[r.kind],
          positionLabel(r),
          r.createdByLabel,
          STATUS_LABELS[r.status],
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (numberFilter.trim()) {
      const nq = numberFilter.trim().toLowerCase();
      list = list.filter((r) => String(r.number || '').toLowerCase().includes(nq));
    }
    if (kindFilter) list = list.filter((r) => r.kind === kindFilter);
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    if (from) {
      const f = new Date(from).getTime();
      list = list.filter((r) => new Date(r.requestDate).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime();
      list = list.filter((r) => new Date(r.requestDate).getTime() <= t);
    }
    return list;
  }, [rows, q, numberFilter, kindFilter, statusFilter, from, to]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<ChangeRow[]>('/api/hr/change-requests');
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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!createMenuRef.current?.contains(e.target as Node)) setCreateMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/hr-requests?${qs}` : '/catalog/hr-requests', {
      scroll: false,
    });
  }

  async function runAction(
    row: ChangeRow,
    action: 'submit' | 'cancel' | 'delete' | 'approve' | 'reject',
  ) {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/hr/change-requests/${row.id}`, { method: 'DELETE' });
      } else if (action === 'approve' || action === 'reject') {
        await apiFetch(`/api/hr/change-requests/${row.id}/review`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: action === 'approve' ? 'approved' : 'rejected',
          }),
        });
      } else {
        await apiFetch(`/api/hr/change-requests/${row.id}/${action}`, { method: 'POST' });
      }
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `hr-requests-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        requestDate: fmtDate(r.requestDate),
        number: r.number || '',
        kind: KIND_LABELS[r.kind],
        position: positionLabel(r),
        createdBy: r.createdByLabel || '',
        createdAt: fmtDateTime(r.createdAt),
        status: STATUS_LABELS[r.status] || r.status,
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      await downloadXlsxViaApi(
        '/api/hr/change-requests/export.xlsx',
        `hr-requests-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="hr-requests" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeRequest}`}>
          <i className="fas fa-clipboard-check" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Заявки на кадровые изменения</h1>
          <p className={shared.pageSubtitle}>Заявки на перевод, увольнение и другие кадровые операции</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <div className={styles.createWrap} ref={createMenuRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateMenuOpen((v) => !v)}
            >
              Создать ▾
            </button>
            {createMenuOpen ? (
              <div className={styles.createMenu}>
                {CREATE_PRESETS.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    className={styles.createMenuLink}
                    onClick={() => {
                      setCreateMenuOpen(false);
                      setModal({ mode: 'create', kind: p.kind });
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <FilterPanel
            inline
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateRange', label: 'Дата заявки', fromKey: 'from', toKey: 'to' },
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'kind',
                label: 'Тип заявки',
                options: Object.entries(KIND_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: Object.entries(STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
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
              <th>Дата заявки ↑</th>
              <th>Номер</th>
              <th>Тип заявки</th>
              <th>Позиция</th>
              <th>Создал</th>
              <th>Дата создания</th>
              <th>Статус</th>
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
                    <td>{fmtDate(row.requestDate)}</td>
                    <td>{row.number || '—'}</td>
                    <td>{KIND_LABELS[row.kind]}</td>
                    <td className={styles.empName}>{positionLabel(row)}</td>
                    <td>{row.createdByLabel || '—'}</td>
                    <td>{fmtDateTime(row.createdAt)}</td>
                    <td>
                      <span
                        className={
                          row.status === 'approved'
                            ? styles.postedYes
                            : row.status === 'rejected' || row.status === 'cancelled'
                              ? styles.postedNo
                              : styles.postedNo
                        }
                      >
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={8}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          <button
                            type="button"
                            onClick={() => setModal({ mode: 'edit', id: row.id, kind: row.kind })}
                          >
                            {row.status === 'draft' || row.status === 'pending'
                              ? 'Изменить'
                              : 'Открыть'}
                          </button>
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'submit')}
                            >
                              На рассмотрение
                            </button>
                          ) : null}
                          {row.status === 'draft' || row.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => runAction(row, 'approve')}
                              >
                                Утвердить
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => runAction(row, 'reject')}
                              >
                                Отклонить
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => runAction(row, 'cancel')}
                              >
                                Отменить
                              </button>
                            </>
                          ) : null}
                          {row.status !== 'approved' ? (
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => runAction(row, 'delete')}
                            >
                              Удалить
                            </button>
                          ) : null}
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
          modal
            ? formPageTitle(
                modal.kind || 'open_position',
                modal.mode,
                modal.mode === 'edit'
                  ? rows.find((r) => r.id === modal.id)?.status
                  : undefined,
              )
            : ''
        }
        width="xl"
        onClose={closeModal}
      >
        {modal ? (
          <HrChangeRequestForm
            key={
              modal.mode === 'edit'
                ? modal.id
                : `create-${modal.kind || 'open_position'}`
            }
            mode={modal.mode}
            requestId={modal.id}
            kindDefault={modal.kind}
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

export default function HrRequestsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <HrRequestsInner />
    </Suspense>
  );
}
