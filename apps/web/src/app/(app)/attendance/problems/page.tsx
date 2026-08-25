'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../marks/page.module.css';

type Problem = {
  id: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: string;
  resolved?: boolean;
};

function reasonLabel(reason: string) {
  if (reason === 'device_clock_skew') return 'Сдвиг часов терминала';
  if (reason === 'device_clock_rollback') return 'Часы терминала откатили назад';
  if (reason === 'offline_unverified') return 'Отметка в офлайн-периоде';
  if (reason === 'unknown_employee') return 'Неизвестный сотрудник';
  if (reason === 'device_admin_login') return 'Пароль администратора на терминале';
  return reason;
}

function ProblemsInner() {
  const [rows, setRows] = useState<Problem[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  function payloadField(p: Record<string, unknown>, keys: string[]) {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '—';
  }

  return (
    <div className={styles.wrap}>
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
            {filtered.length}/{rows.length}
          </span>
          <button type="button" className={styles.btnGhost} onClick={() => void load()}>
            Обновить
          </button>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Устройство</th>
              <th>Тип устройства</th>
              <th>Тип отметки</th>
              <th>Причина</th>
              <th>Время</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const p = r.payload || {};
                return (
                  <tr key={r.id}>
                    <td>
                      {payloadField(p, [
                        'employeeName',
                        'fullName',
                        'employeeExternalId',
                      ])}
                    </td>
                    <td>{payloadField(p, ['deviceName', 'serialNumber'])}</td>
                    <td>{payloadField(p, ['deviceType', 'adapterType'])}</td>
                    <td>{payloadField(p, ['markType', 'direction'])}</td>
                    <td>{reasonLabel(r.reason)}</td>
                    <td>{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
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
                );
              })
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
