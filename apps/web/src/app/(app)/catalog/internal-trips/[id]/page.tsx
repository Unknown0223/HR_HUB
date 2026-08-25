'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../page.module.css';

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type Row = {
  id: string;
  title: string;
  requestStatus: string;
  status: string;
  visibility: string;
  note?: string | null;
  reviewNote?: string | null;
  startDate: string;
  endDate: string;
  requestDate?: string | null;
  createdAt: string;
  earlyArrival?: string;
  lateDeparture?: string;
  bySchedule?: boolean;
  quantity?: number;
  amount?: string | number | null;
  accrualName?: string | null;
  employee: Emp;
  location?: { id: string; name: string } | null;
  recipientDivision?: { id: string; name: string } | null;
  senderDivision?: { id: string; name: string } | null;
  position?: { id: string; name: string } | null;
  workSchedule?: { id: string; name: string } | null;
};

function empName(e: Emp) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function statusText(s: string) {
  if (s === 'approved') return 'Подтвержден';
  if (s === 'pending') return 'В ожидании';
  if (s === 'rejected') return 'Отклонен';
  if (s === 'cancelled') return 'Отменен';
  if (s === 'draft') return 'Черновик';
  return s;
}

export default function InternalTripDetailPage() {
  const params = useParams();
  const id = String(params.id || '');
  const router = useRouter();
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await apiFetch<Row>(`/api/hr/internal-trips/${id}`);
      setRow(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRow(null);
    }
  }

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function review(status: 'approved' | 'rejected') {
    setBusy(true);
    try {
      await apiFetch(`/api/hr/internal-trips/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await apiFetch(`/api/hr/internal-trips/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!row && !error) {
    return <p className={styles.empty}>Загрузка…</p>;
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="internal-trips" titleOverride="Внутренняя командировка" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/internal-trips" className={styles.toolBtn}>
            ← Назад
          </Link>
          {row?.requestStatus === 'pending' ? (
            <>
              <button
                type="button"
                className={styles.bulkOk}
                disabled={busy}
                onClick={() => void review('approved')}
              >
                Подтвердить
              </button>
              <button
                type="button"
                className={styles.bulkDanger}
                disabled={busy}
                onClick={() => void review('rejected')}
              >
                Отклонить
              </button>
              <button
                type="button"
                className={styles.bulkMuted}
                disabled={busy}
                onClick={() => void cancel()}
              >
                Отменить
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {row ? (
        <div className={styles.tableWrap} style={{ padding: '1rem 1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>{row.title}</h2>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '220px 1fr',
              gap: '0.55rem 1rem',
              margin: 0,
              fontSize: '0.9rem',
            }}
          >
            <dt>Статус</dt>
            <dd style={{ margin: 0 }}>{statusText(row.requestStatus)}</dd>
            <dt>Сотрудник</dt>
            <dd style={{ margin: 0 }}>{empName(row.employee)}</dd>
            <dt>Подразделение (получатель)</dt>
            <dd style={{ margin: 0 }}>{row.recipientDivision?.name || '—'}</dd>
            <dt>Подразделение (отправитель)</dt>
            <dd style={{ margin: 0 }}>{row.senderDivision?.name || '—'}</dd>
            <dt>Локация</dt>
            <dd style={{ margin: 0 }}>{row.location?.name || '—'}</dd>
            <dt>Должность</dt>
            <dd style={{ margin: 0 }}>
              {row.position?.name || '—'}
              {row.quantity ? ` · ×${row.quantity}` : ''}
            </dd>
            <dt>Дата запроса</dt>
            <dd style={{ margin: 0 }}>{fmtDate(row.requestDate)}</dd>
            <dt>Период</dt>
            <dd style={{ margin: 0 }}>
              {fmtDate(row.startDate)} — {fmtDate(row.endDate)}
            </dd>
            <dt>Ранний приход / Поздний уход</dt>
            <dd style={{ margin: 0 }}>
              {row.earlyArrival || '00:00'} / {row.lateDeparture || '00:00'}
            </dd>
            <dt>По графику</dt>
            <dd style={{ margin: 0 }}>
              {row.bySchedule ? 'Да' : 'Нет'}
              {row.workSchedule ? ` · ${row.workSchedule.name}` : ''}
            </dd>
            <dt>Начисления / Сумма</dt>
            <dd style={{ margin: 0 }}>
              {row.accrualName || '—'}
              {row.amount != null ? ` · ${row.amount}` : ''}
            </dd>
            <dt>Описание</dt>
            <dd style={{ margin: 0 }}>{row.note || '—'}</dd>
            {row.reviewNote ? (
              <>
                <dt>Комментарий рецензента</dt>
                <dd style={{ margin: 0 }}>{row.reviewNote}</dd>
              </>
            ) : null}
          </dl>
          <div style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => router.push('/catalog/internal-trips?scope=mine')}
            >
              К списку
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
