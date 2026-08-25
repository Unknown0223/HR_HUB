'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { PageSubnav } from '@/components/PageSubnav';
import { ListBulkBar, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { type AccountPair } from '@/lib/settlements';
import styles from '../absence-types/page.module.css';
import extra from '../settlements/extra.module.css';

const PATH = '/catalog/account-pairs';
const PAGE_SIZE = 50;

function AccountPairsInner() {
  const router = useRouter();
  const [rows, setRows] = useState<AccountPair[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

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
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [r.name, r.firstAccount, r.secondAccount, r.code].join(' ').toLowerCase().includes(qq),
    );
  }, [rows, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredIds = paged.map((r) => r.id);
  const selectedRows = rows.filter((r) => selected.has(r.id));

  async function setStatus(ids: string[], isActive: boolean) {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/payroll/account-pairs/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ ids, isActive }),
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

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="account-pairs" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href={`${PATH}/new`} className={styles.createBtn}>
            Создать
          </Link>
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              {
                key: 'off',
                label: 'Неактивный',
                count: selectedRows.filter((r) => r.isActive).length,
                onClick: () => void setStatus(selectedRows.filter((r) => r.isActive).map((r) => r.id), false),
              },
              {
                key: 'on',
                label: 'Активный',
                count: selectedRows.filter((r) => !r.isActive).length,
                onClick: () => void setStatus(selectedRows.filter((r) => !r.isActive).map((r) => r.id), true),
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
          <button type="button" className={styles.toolBtn} onClick={() => router.push('/catalog/settlements')}>
            Закрыть
          </button>
        </div>
        <div className={styles.rightTools}>
          <input className={styles.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                `account-pairs.csv`,
                filtered.map((r) => ({
                  Название: r.name,
                  'Первый счет': r.firstAccount,
                  'Второй счет': r.secondAccount,
                  Статус: r.isActive ? 'Активный' : 'Неактивный',
                })),
              )
            }
          >
            CSV
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {filtered.length}
          </span>
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
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
              <th>Название</th>
              <th>Первый счет</th>
              <th>Второй счет</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
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
                    <td>{row.name}</td>
                    <td>{row.firstAccount}</td>
                    <td>{row.secondAccount}</td>
                    <td>
                      <span className={row.isActive ? extra.badge : extra.badgeOff}>
                        {row.isActive ? 'Активный' : 'Неактивный'}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={5}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link>
                          <button type="button" disabled={busy} onClick={() => void setStatus([row.id], !row.isActive)}>
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
    </div>
  );
}

export function AccountPairsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AccountPairsInner />
    </Suspense>
  );
}
