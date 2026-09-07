'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { confirm } from '@/lib/dialogs';
import { downloadXlsxViaApi } from '@/lib/excel';
import { HrChangeRequestCreateModal } from './HrChangeRequestCreateModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';
import {
  CREATE_PRESETS,
  KIND_LABELS,
  STATUS_LABELS,
  type HrChangeKind,
} from './kinds';

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

type RowAction = 'submit' | 'cancel' | 'delete' | 'approve' | 'reject';

const FILTER_KEYS = ['q', 'number', 'kind', 'status', 'from', 'to'] as const;
const COL_COUNT = 8;

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

function statusBadge(status: string) {
  const text = STATUS_LABELS[status] || status;
  if (status === 'approved') return { text, cls: styles.badgeOk };
  if (status === 'pending') return { text, cls: styles.badgePending };
  if (status === 'rejected') return { text, cls: styles.badgeBad };
  if (status === 'cancelled') return { text, cls: styles.badgeMuted };
  return { text, cls: styles.badgeDraft };
}

/** Which rows a bulk action may touch — everything else is skipped. */
function isEligible(row: ChangeRow, action: RowAction) {
  if (action === 'submit') return row.status === 'draft';
  if (action === 'delete') return row.status !== 'approved';
  return row.status === 'draft' || row.status === 'pending';
}

async function callAction(id: string, action: RowAction) {
  if (action === 'delete') {
    await apiFetch(`/api/hr/change-requests/${id}`, { method: 'DELETE' });
    return;
  }
  if (action === 'approve' || action === 'reject') {
    await apiFetch(`/api/hr/change-requests/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected' }),
    });
    return;
  }
  await apiFetch(`/api/hr/change-requests/${id}/${action}`, { method: 'POST' });
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
  const [createKind, setCreateKind] = useState<HrChangeKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [searchDraft, setSearchDraft] = useState(q);
  const [exportBusy, setExportBusy] = useState(false);

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

  const checkedRows = useMemo(
    () => filtered.filter((r) => checked[r.id]),
    [filtered, checked],
  );

  const allChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const someChecked = filtered.some((r) => checked[r.id]) && !allChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
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

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<ChangeRow[]>('/api/hr/change-requests');
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      setChecked((prev) => {
        const alive = new Set(list.map((r) => r.id));
        const next: Record<string, boolean> = {};
        for (const id of Object.keys(prev)) if (alive.has(id)) next[id] = true;
        return next;
      });
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
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!createMenuRef.current?.contains(e.target as Node)) setCreateMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // `/new?kind=…` redirects here — open the modal and drop the params so that
  // `kind` is not picked up as a list filter.
  useEffect(() => {
    if (searchParams?.get('create') !== '1') return;
    const kind = (searchParams.get('kind') || 'open_position') as HrChangeKind;
    setCreateKind(kind);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    params.delete('kind');
    const qs = params.toString();
    router.replace(qs ? `/catalog/hr-requests?${qs}` : '/catalog/hr-requests', {
      scroll: false,
    });
  }, [searchParams, router]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/hr-requests?${qs}` : '/catalog/hr-requests', {
      scroll: false,
    });
  }

  async function runAction(row: ChangeRow, action: RowAction) {
    if (action === 'delete') {
      const ok = await confirm(
        `Удалить заявку № ${row.number || '—'} от ${fmtDate(row.requestDate)}?`,
      );
      if (!ok) return;
    }
    if (action === 'reject') {
      const ok = await confirm({
        message: `Отклонить заявку № ${row.number || '—'}?`,
        confirmText: 'Отклонить',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      await callAction(row.id, action);
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: RowAction) {
    const targets = checkedRows;
    if (targets.length === 0) return;
    const eligible = targets.filter((r) => isEligible(r, action));
    if (eligible.length === 0) {
      setError('Среди выбранных нет заявок в подходящем статусе');
      return;
    }
    if (action === 'delete') {
      const ok = await confirm(`Удалить выбранные заявки (${eligible.length} шт.)?`);
      if (!ok) return;
    }
    if (action === 'reject') {
      const ok = await confirm({
        message: `Отклонить выбранные заявки (${eligible.length} шт.)?`,
        confirmText: 'Отклонить',
      });
      if (!ok) return;
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of eligible) {
        try {
          await callAction(row.id, action);
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      const skipped = targets.length - eligible.length;
      const notes: string[] = [];
      if (failed > 0) notes.push(`не выполнено: ${failed}`);
      if (skipped > 0) notes.push(`пропущено по статусу: ${skipped}`);
      if (notes.length > 0) setError(`Часть операций ${notes.join(', ')}`);
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
          <p className={shared.pageSubtitle}>
            Заявки на перевод, увольнение и другие кадровые операции
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
          <div className={styles.createWrap} ref={createMenuRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateMenuOpen((v) => !v)}
              aria-expanded={createMenuOpen}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать
              <i className="fas fa-chevron-down" aria-hidden />
            </button>
            {createMenuOpen ? (
              <div className={styles.createMenu}>
                {CREATE_PRESETS.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      setError('');
                      setCreateKind(p.kind);
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
            disabled={exportBusy}
            onClick={() => void exportExcel()}
            title="Excel"
            aria-label="Экспорт Excel"
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

      {checkedRows.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedRows.length}</strong>
          </span>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('submit')}
          >
            <i className="fas fa-paper-plane" aria-hidden />
            На рассмотрение
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('approve')}
          >
            <i className="fas fa-check" aria-hidden />
            Утвердить
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('reject')}
          >
            <i className="fas fa-times" aria-hidden />
            Отклонить
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('cancel')}
          >
            <i className="fas fa-ban" aria-hidden />
            Отменить
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
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Дата заявки</th>
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
                const badge = statusBadge(row.status);
                const editable = row.status === 'draft' || row.status === 'pending';
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
                          aria-label={`Выбрать ${row.number || row.id}`}
                        />
                      </td>
                      <td>{fmtDate(row.requestDate)}</td>
                      <td>{row.number || '—'}</td>
                      <td>{KIND_LABELS[row.kind]}</td>
                      <td className={styles.empName}>{positionLabel(row)}</td>
                      <td>{row.createdByLabel || '—'}</td>
                      <td>{fmtDateTime(row.createdAt)}</td>
                      <td>
                        <span className={badge.cls}>{badge.text}</span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/hr-requests/${row.id}`}>
                              <i
                                className={editable ? 'fas fa-pen' : 'fas fa-eye'}
                                aria-hidden
                              />
                              {editable ? 'Изменить' : 'Открыть'}
                            </Link>
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'submit')}
                              >
                                <i className="fas fa-paper-plane" aria-hidden />
                                На рассмотрение
                              </button>
                            ) : null}
                            {editable ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runAction(row, 'approve')}
                                >
                                  <i className="fas fa-check" aria-hidden />
                                  Утвердить
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runAction(row, 'reject')}
                                >
                                  <i className="fas fa-times" aria-hidden />
                                  Отклонить
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runAction(row, 'cancel')}
                                >
                                  <i className="fas fa-ban" aria-hidden />
                                  Отменить
                                </button>
                              </>
                            ) : null}
                            {row.status !== 'approved' ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void runAction(row, 'delete')}
                              >
                                <i className="fas fa-trash" aria-hidden />
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
        <div className={styles.footer}>
          <p>
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <HrChangeRequestCreateModal
        open={createKind !== null}
        kind={createKind ?? 'open_position'}
        onClose={() => setCreateKind(null)}
        onCreated={(id, openDoc) => {
          setCreateKind(null);
          if (openDoc) {
            router.push(`/catalog/hr-requests/${id}`);
            return;
          }
          void load();
        }}
      />
    </div>
  );
}

export default function HrRequestsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <HrRequestsInner />
    </Suspense>
  );
}
