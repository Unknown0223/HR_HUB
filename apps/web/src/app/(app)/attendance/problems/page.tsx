'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import styles from '../marks/page.module.css';

type Problem = {
  id: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: string;
  resolved?: boolean;
};

const problemsListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.attendance-problems.v1',
  title: 'Проблемные отметки',
  columns: [
    { key: 'employee', label: 'Сотрудник' },
    { key: 'device', label: 'Устройство' },
    { key: 'deviceType', label: 'Тип устройства' },
    { key: 'markType', label: 'Тип отметки' },
    { key: 'reason', label: 'Причина' },
    { key: 'createdAt', label: 'Время' },
  ],
  defaultColumns: [
    'employee',
    'device',
    'deviceType',
    'markType',
    'reason',
    'createdAt',
  ],
  defaultSearchKeys: ['employee', 'device', 'reason'],
  defaultSort: [{ key: 'createdAt', dir: 'desc' }],
});

function reasonLabel(reason: string) {
  if (reason === 'device_clock_skew') return 'Сдвиг часов терминала';
  if (reason === 'device_clock_rollback') return 'Часы терминала откатили назад';
  if (reason === 'offline_unverified') return 'Отметка в офлайн-периоде';
  if (reason === 'unknown_employee') return 'Неизвестный сотрудник';
  if (reason === 'device_admin_login') return 'Пароль администратора на терминале';
  return reason;
}

function payloadField(p: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

function problemCell(r: Problem, key: string): string {
  const p = r.payload || {};
  switch (key) {
    case 'employee':
      return payloadField(p, ['employeeName', 'fullName', 'employeeExternalId']);
    case 'device':
      return payloadField(p, ['deviceName', 'serialNumber']);
    case 'deviceType':
      return payloadField(p, ['deviceType', 'adapterType']);
    case 'markType':
      return payloadField(p, ['markType', 'direction']);
    case 'reason':
      return reasonLabel(r.reason);
    case 'createdAt':
      return new Date(r.createdAt).toLocaleString('ru-RU');
    default:
      return '';
  }
}

function ProblemsInner() {
  const prefs = useTablePrefs(problemsListPrefs);
  const [rows, setRows] = useState<Problem[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : problemsListPrefs.defaultColumns;
  const colCount = visibleCols.length + 1;

  async function load() {
    setError('');
    try {
      const data = await apiFetch<Problem[]>('/api/attendance/problems');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.reason, JSON.stringify(r.payload)].some((x) => x.toLowerCase().includes(s)),
    );
  }, [rows, q]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, problemCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  async function resolve(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/problems/${id}/resolve`, { method: 'PATCH' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `attendance-problems-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = problemCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="marks" titleOverride="Список проблемных отметок" />
      <div className={styles.toolbar}>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className={styles.pagerMeta}>
            {displayRows.length}/{rows.length}
          </span>
          <button type="button" className={styles.btnGhost} onClick={() => void load()}>
            Обновить
          </button>
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              {visibleCols.map((key) => (
                <th key={key}>{prefs.labelOf(key)}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr key={r.id}>
                  {visibleCols.map((key) => (
                    <td key={key}>{problemCell(r, key) || '—'}</td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className={styles.btnBlue}
                      disabled={busy}
                      onClick={() => void resolve(r.id)}
                    >
                      Решить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProblemsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <ProblemsInner />
    </Suspense>
  );
}
