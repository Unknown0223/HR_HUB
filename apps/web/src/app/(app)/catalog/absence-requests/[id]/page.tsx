'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from '../form.module.css';

type Row = {
  id: string;
  status: string;
  note?: string | null;
  managerNote?: string | null;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  };
  absenceType: { id: string; name: string };
  meta?: Record<string, unknown> | null;
};

function empName(e: Row['employee']) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function statusInfo(row: Row) {
  const meta = row.meta || {};
  if (meta.completed) return { text: 'Завершён', cls: styles.badgeDone };
  if (row.status === 'approved') return { text: 'Подтвержден', cls: styles.badgeOk };
  if (row.status === 'pending') return { text: 'В ожидании', cls: styles.badgePending };
  if (row.status === 'rejected') return { text: 'Отклонен', cls: styles.badgeBad };
  if (row.status === 'cancelled') return { text: 'Отменен', cls: styles.badgeMuted };
  return { text: row.status, cls: styles.badgeMuted };
}

export default function AbsenceRequestViewPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'main' | 'history'>('main');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const data = await apiFetch<Row>(`/api/hr/absences/${id}`);
      setRow(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  async function doAction(act: string) {
    setBusy(true);
    setOk('');
    try {
      if (act === 'approve' || act === 'reject') {
        await apiFetch(`/api/hr/absences/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ action: act }),
        });
      } else {
        await apiFetch(`/api/hr/absences/${id}/${act}`, { method: 'POST' });
      }
      setMenuOpen(false);
      setOk('Статус обновлён');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!row && !error) return <p className={styles.muted}>Загрузка…</p>;
  if (!row) return <p className={styles.error}>{error}</p>;

  const st = statusInfo(row);
  const meta = row.meta || {};
  const num = typeof meta.number === 'string' ? meta.number : row.id.slice(0, 8);
  const sideTitle = `Запрос ${empName(row.employee).toUpperCase()} от ${fmtDt(row.createdAt)} (${num})`;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>Запрос на отсутствие (просмотр)</h1>
        <div className={styles.actions} ref={menuRef}>
          <button
            type="button"
            className={styles.btnStatus}
            disabled={busy}
            onClick={() => setMenuOpen((v) => !v)}
          >
            Изменить статус ▾
          </button>
          {menuOpen ? (
            <div className={styles.statusMenu}>
              <button type="button" onClick={() => void doAction('complete')}>
                Завершить
              </button>
              <button type="button" onClick={() => void doAction('cancel')}>
                Отменить
              </button>
              <button type="button" onClick={() => void doAction('restore')}>
                Восстановить
              </button>
              <button type="button" onClick={() => void doAction('approve')}>
                Подтвердить
              </button>
            </div>
          ) : null}
          <Link href="/catalog/absence-requests" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      <div className={styles.layout}>
        <aside className={styles.side}>
          <h2 className={styles.sideTitle}>{sideTitle}</h2>
          <span className={st.cls}>{st.text}</span>
          <nav className={styles.sideNav}>
            <button
              type="button"
              className={tab === 'main' ? styles.sideLinkActive : styles.sideLink}
              onClick={() => setTab('main')}
            >
              Основная информация
            </button>
            <button
              type="button"
              className={tab === 'history' ? styles.sideLinkActive : styles.sideLink}
              onClick={() => setTab('history')}
            >
              История изменений
            </button>
          </nav>
        </aside>

        <div className={styles.main}>
          {tab === 'history' ? (
            <p className={styles.historyEmpty}>История изменений пока недоступна</p>
          ) : (
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Сотрудник</label>
                <div className={styles.fieldValue}>{empName(row.employee)}</div>
              </div>
              <div className={styles.field}>
                <label>Начало</label>
                <div className={styles.fieldValue}>{fmtDate(row.startDate)}</div>
              </div>
              <div className={styles.field}>
                <label>Вид отсутствия</label>
                <div className={styles.fieldValue}>{row.absenceType?.name || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Начало (время)</label>
                <div className={styles.fieldValue}>{row.startTime || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Примечание</label>
                <div className={styles.fieldValue}>{row.note || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Конец (время)</label>
                <div className={styles.fieldValue}>{row.endTime || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Подтвердил</label>
                <div className={styles.fieldValue}>
                  {typeof meta.confirmedBy === 'string' ? meta.confirmedBy : '—'}
                </div>
              </div>
              <div className={styles.field}>
                <label>Конец</label>
                <div className={styles.fieldValue}>{fmtDate(row.endDate)}</div>
              </div>
              <div className={styles.field}>
                <label>Примечание руководителя</label>
                <div className={styles.fieldValue}>{row.managerNote || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Завершил</label>
                <div className={styles.fieldValue}>
                  {typeof meta.completedBy === 'string' ? meta.completedBy : '—'}
                </div>
              </div>
              <div className={styles.field}>
                <label>Создал</label>
                <div className={styles.fieldValue}>{empName(row.employee)}</div>
              </div>
              <div className={styles.field}>
                <label>Изменил</label>
                <div className={styles.fieldValue}>
                  {typeof meta.updatedBy === 'string'
                    ? meta.updatedBy
                    : typeof meta.confirmedBy === 'string'
                      ? meta.confirmedBy
                      : '—'}
                </div>
              </div>
              <div className={styles.field}>
                <label>Время создания</label>
                <div className={styles.fieldValue}>{fmtDt(row.createdAt)}</div>
              </div>
              <div className={styles.field}>
                <label>Дата изменения</label>
                <div className={styles.fieldValue}>{fmtDt(row.updatedAt)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
