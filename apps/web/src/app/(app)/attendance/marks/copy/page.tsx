'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import styles from '../marks/page.module.css';

type EmpRow = {
  id: string;
  fullName: string;
  tabNumber: string;
  hiredAt?: string | null;
  division?: { name: string } | null;
  position?: { name: string } | null;
  marksCount: number;
};

type EmpOpt = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
};

function CopyInner() {
  const router = useRouter();
  const [pool, setPool] = useState<EmpOpt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [rows, setRows] = useState<EmpRow[]>([]);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetFrom, setTargetFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const selectedIds = useMemo(() => [...selected], [selected]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<EmpOpt[] | { items: EmpOpt[] }>(
          '/api/employees?limit=300&status=active',
        );
        setPool(Array.isArray(data) ? data : data.items || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка');
      }
    })();
  }, []);

  async function preview(ids?: string[]) {
    const list = ids ?? selectedIds;
    if (!list.length) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<EmpRow[]>('/api/attendance/marks/copy/preview', {
        method: 'POST',
        body: JSON.stringify({ employeeIds: list, from, to }),
      });
      setRows(data);
      setPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function fill() {
    if (!selectedIds.length) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ ok: boolean; copied: number; message?: string }>(
        '/api/attendance/marks/copy',
        {
          method: 'POST',
          body: JSON.stringify({ employeeIds: selectedIds, from, to, targetFrom }),
        },
      );
      if (!res.ok || !res.copied) {
        setError(res.message || 'Не найдены отметки для копирования');
      } else {
        setInfo(`Скопировано отметок: ${res.copied}`);
        await preview();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="marks" titleOverride="Копирование отметок" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={!rows.length || busy}
            onClick={() => void fill()}
          >
            Заполнить
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setPickerOpen(true)}
          >
            Выбрать сотрудников
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => router.push('/attendance/marks')}
          >
            Закрыть
          </button>
        </div>
        <div className={styles.rightTools}>
          <label className={styles.filterField}>
            <span>Источник с</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>по</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Копировать на</span>
            <input
              type="date"
              value={targetFrom}
              onChange={(e) => setTargetFrom(e.target.value)}
            />
          </label>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.info}>{info}</p> : null}

      <div className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Таб. номер</th>
              <th>Дата приема</th>
              <th>Подразделение</th>
              <th>Должность</th>
              <th>Кол-во отметок</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.fullName}</td>
                  <td>{r.tabNumber}</td>
                  <td>
                    {r.hiredAt
                      ? new Date(r.hiredAt).toLocaleDateString('ru-RU')
                      : '—'}
                  </td>
                  <td>{r.division?.name || '—'}</td>
                  <td>{r.position?.name || '—'}</td>
                  <td>{r.marksCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pickerOpen ? (
        <EmployeePickModal
          items={toPickItems(pool)}
          initialSelectedIds={selectedIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids) => {
            setSelected(new Set(ids));
            void preview(ids);
          }}
        />
      ) : null}
    </div>
  );
}

export default function CopyMarksPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <CopyInner />
    </Suspense>
  );
}
