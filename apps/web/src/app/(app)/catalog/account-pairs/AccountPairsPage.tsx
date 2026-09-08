'use client';

import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { ListBulkBar, togglePage, toggleSelect } from '@/components/ListBulkBar';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { type AccountPair } from '@/lib/settlements';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import extra from '../settlements/extra.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/account-pairs';
const PAGE_SIZE = 50;

const accountPairsListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.account-pairs.v1',
  title: 'Парные счета',
  columns: [
    { key: 'name', label: 'Название' },
    { key: 'firstAccount', label: 'Первый счет' },
    { key: 'secondAccount', label: 'Второй счет' },
    { key: 'isActive', label: 'Статус' },
  ],
  defaultColumns: ['name', 'firstAccount', 'secondAccount', 'isActive'],
  defaultSearchKeys: ['name', 'firstAccount', 'secondAccount'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function accountPairCell(row: AccountPair, key: string): string {
  switch (key) {
    case 'name':
      return row.name || '';
    case 'firstAccount':
      return row.firstAccount || '';
    case 'secondAccount':
      return row.secondAccount || '';
    case 'isActive':
      return row.isActive ? 'Активный' : 'Неактивный';
    default:
      return '';
  }
}

type CoaItem = { id: string; code: string; name: string };

function AccountPairsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefs = useTablePrefs(accountPairsListPrefs);
  const [rows, setRows] = useState<AccountPair[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const [mode, setMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [firstAccount, setFirstAccount] = useState('');
  const [secondAccount, setSecondAccount] = useState('');
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [coa, setCoa] = useState<CoaItem[]>([]);
  const [formError, setFormError] = useState('');

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : accountPairsListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<AccountPair[]>('/api/payroll/account-pairs'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    apiFetch<Array<{ code: string; items?: CoaItem[] }>>('/api/settings/dictionaries')
      .then((dicts) => setCoa(dicts.find((d) => d.code === 'coa')?.items || []))
      .catch(() => setCoa([]));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q]);

  function clearParams() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    params.delete('edit');
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  async function openCreate() {
    setEditId(null);
    setName('');
    setFirstAccount('');
    setSecondAccount('');
    setSortOrder((rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) || 0) + 1);
    setIsActive(true);
    setFormError('');
    setMode('create');
  }

  function openEdit(row: AccountPair) {
    setEditId(row.id);
    setName(row.name);
    setFirstAccount(row.firstAccount || row.debitAccount || '');
    setSecondAccount(row.secondAccount || row.creditAccount || '');
    setSortOrder(row.sortOrder || 1);
    setIsActive(row.isActive);
    setFormError('');
    setMode('edit');
  }

  function closeModal() {
    setMode('none');
    setEditId(null);
    setFormError('');
    clearParams();
  }

  useEffect(() => {
    if (searchParams.get('create') === '1') void openCreate();
    const edit = searchParams.get('edit');
    if (edit && rows.length) {
      const row = rows.find((r) => r.id === edit);
      if (row) openEdit(row);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, rows.length]);

  async function save() {
    if (!name.trim() || !firstAccount.trim() || !secondAccount.trim()) {
      setFormError('Название и оба счёта обязательны');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: name.trim(),
        firstAccount: firstAccount.trim(),
        secondAccount: secondAccount.trim(),
        sortOrder,
        isActive,
        subcontos: [] as string[],
      };
      if (editId) {
        await apiFetch(`/api/payroll/account-pairs/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/payroll/account-pairs', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      closeModal();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [r.name, r.firstAccount, r.secondAccount, r.code].join(' ').toLowerCase().includes(qq),
    );
  }, [rows, q]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, accountPairCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const pageCount = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const paged = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredIds = paged.map((r) => r.id);
  const selectedRows = rows.filter((r) => selected.has(r.id));

  async function setStatus(ids: string[], nextActive: boolean) {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/payroll/account-pairs/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ ids, isActive: nextActive }),
      });
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function remove(ids: string[]) {
    if (!ids.length) return;
    if (!(await confirm({ message: 'Удалить выбранные парные счета?', variant: 'danger' }))) return;
    setBusy(true);
    try {
      await apiFetch('/api/payroll/account-pairs/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `account-pairs.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = accountPairCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="account-pairs" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeDoc}`}>
          <i className="fas fa-link" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Парные счета</h1>
          <p className={shared.pageSubtitle}>
            Пары счетов для взаиморасчётов и проводок
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={() => void openCreate()}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              {
                key: 'off',
                label: 'Неактивный',
                count: selectedRows.filter((r) => r.isActive).length,
                onClick: () =>
                  void setStatus(
                    selectedRows.filter((r) => r.isActive).map((r) => r.id),
                    false,
                  ),
              },
              {
                key: 'on',
                label: 'Активный',
                count: selectedRows.filter((r) => !r.isActive).length,
                onClick: () =>
                  void setStatus(
                    selectedRows.filter((r) => !r.isActive).map((r) => r.id),
                    true,
                  ),
              },
              {
                key: 'delete',
                label: 'Удалить',
                count: selected.size,
                variant: 'danger',
                onClick: () => void remove([...selected]),
              },
            ]}
          />
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => router.push('/catalog/settlements')}
          >
            Закрыть
          </button>
        </div>
        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Предыдущая страница"
          >
            <i className="fas fa-chevron-left" aria-hidden />
          </button>
          <span className={styles.pagerMeta}>
            {Math.min(page, pageCount)} / {pageCount}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Следующая страница"
          >
            <i className="fas fa-chevron-right" aria-hidden />
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
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={extra.muted}>Загрузка…</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))}
                  onChange={(e) => setSelected(togglePage(selected, filteredIds, e.target.checked))}
                  aria-label="Выбрать все"
                />
              </th>
              {visibleCols.map((key) => (
                <th key={key}>{prefs.labelOf(key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && !loading ? (
              <tr>
                <td colSpan={colCount} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {paged.map((row) => {
              const open = focusId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setFocusId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                    className={open || selected.has(row.id) ? styles.rowSelected : undefined}
                  >
                    <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={(e) => setSelected(toggleSelect(selected, row.id, e.target.checked))}
                      />
                    </td>
                    {visibleCols.map((key) => {
                      if (key === 'name') {
                        return <td key={key}>{row.name}</td>;
                      }
                      if (key === 'firstAccount') {
                        return <td key={key}>{row.firstAccount}</td>;
                      }
                      if (key === 'secondAccount') {
                        return <td key={key}>{row.secondAccount}</td>;
                      }
                      if (key === 'isActive') {
                        return (
                          <td key={key}>
                            <span className={row.isActive ? extra.badge : extra.badgeOff}>
                              {row.isActive ? 'Активный' : 'Неактивный'}
                            </span>
                          </td>
                        );
                      }
                      return <td key={key}>{accountPairCell(row, key) || '—'}</td>;
                    })}
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={colCount}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          <button type="button" onClick={() => openEdit(row)}>
                            <i className="fas fa-pen" aria-hidden />
                            Изменить
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setStatus([row.id], !row.isActive)}
                          >
                            {row.isActive ? 'Неактивный' : 'Активный'}
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
        open={mode !== 'none'}
        title={
          mode === 'edit'
            ? 'Парные счета (изменение)'
            : 'Парные счета (создание)'
        }
        width="md"
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '…' : 'Сохранить'}
            </button>
            <button type="button" className={modal.btnGhost} onClick={closeModal}>
              Закрыть
            </button>
          </>
        }
      >
        {formError ? <p className={modal.error}>{formError}</p> : null}
        <div className={modal.field}>
          <label>
            Название <span className={modal.req}>*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className={modal.field}>
          <label>
            Первый счет <span className={modal.req}>*</span>
          </label>
          <input
            list="ap-coa-first"
            value={firstAccount}
            onChange={(e) => setFirstAccount(e.target.value)}
            placeholder="Поиск..."
          />
          <datalist id="ap-coa-first">
            {coa.map((c) => (
              <option key={c.id} value={`${c.code}. ${c.name}`} />
            ))}
          </datalist>
        </div>
        <div className={modal.field}>
          <label>
            Второй счет <span className={modal.req}>*</span>
          </label>
          <input
            list="ap-coa-second"
            value={secondAccount}
            onChange={(e) => setSecondAccount(e.target.value)}
            placeholder="Поиск..."
          />
          <datalist id="ap-coa-second">
            {coa.map((c) => (
              <option key={`s-${c.id}`} value={`${c.code}. ${c.name}`} />
            ))}
          </datalist>
        </div>
        <div className={modal.row2}>
          <div className={modal.field}>
            <label>Порядковый номер</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
          </div>
          <div className={modal.field}>
            <span>Статус</span>
            <label className={formStyles.toggleRow}>
              <button
                type="button"
                className={`${formStyles.toggle} ${isActive ? formStyles.toggleOn : ''}`}
                onClick={() => setIsActive((v) => !v)}
                aria-pressed={isActive}
              />
              <span>{isActive ? 'Активный' : 'Неактивный'}</span>
            </label>
          </div>
        </div>
      </FormModal>
    </div>
  );
}

export function AccountPairsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <AccountPairsInner />
    </Suspense>
  );
}
