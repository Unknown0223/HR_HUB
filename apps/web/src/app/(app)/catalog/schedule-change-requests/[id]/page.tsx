'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import styles from '../form.module.css';

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
};

type Row = {
  id: string;
  status: string;
  title: string;
  type: string;
  createdAt: string;
  reviewNote?: string | null;
  payload?: Record<string, unknown> | null;
  employee: Emp;
};

type SwapPair = { fromDate: string; toDate: string };
type DayChange = { date: string; dayType: 'work' | 'off' };

function empLabel(e: Emp) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function DetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get('edit') === '1';

  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(editMode);

  const [changeKind, setChangeKind] = useState<'day_swap' | 'schedule_change'>(
    'schedule_change',
  );
  const [swaps, setSwaps] = useState<SwapPair[]>([{ fromDate: '', toDate: '' }]);
  const [days, setDays] = useState<DayChange[]>([{ date: '', dayType: 'work' }]);
  const [note, setNote] = useState('');

  async function load() {
    setError('');
    try {
      const data = await apiFetch<Row>(`/api/hr/requests/${id}`);
      setRow(data);
      const p = data.payload || {};
      const kind =
        String(p.changeKind || p.requestKind || '') === 'day_swap'
          ? 'day_swap'
          : 'schedule_change';
      setChangeKind(kind);
      if (kind === 'day_swap' && Array.isArray(p.swaps)) {
        setSwaps(
          (p.swaps as SwapPair[]).length
            ? (p.swaps as SwapPair[])
            : [{ fromDate: '', toDate: '' }],
        );
      }
      if (kind === 'schedule_change' && Array.isArray(p.days)) {
        const list = (p.days as DayChange[]).map((d) => ({
          date: String(d.date || '').slice(0, 10),
          dayType: d.dayType === 'off' ? ('off' as const) : ('work' as const),
        }));
        setDays(list.length ? list : [{ date: '', dayType: 'work' }]);
      }
      setNote(typeof p.note === 'string' ? p.note : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setEditing(editMode);
  }, [editMode]);

  async function save() {
    if (!row) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      const payload =
        changeKind === 'day_swap'
          ? {
              changeKind: 'day_swap',
              swaps: swaps.filter((s) => s.fromDate && s.toDate),
              note: note || undefined,
            }
          : {
              changeKind: 'schedule_change',
              days: days
                .filter((d) => d.date)
                .map((d) => ({ date: d.date, dayType: d.dayType })),
              note: note || undefined,
            };
      const title =
        changeKind === 'day_swap'
          ? `Обмен дней · ${empLabel(row.employee)}`
          : `Изменение графика · ${empLabel(row.employee)}`;
      const updated = await apiFetch<Row>(`/api/hr/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, payload }),
      });
      setRow(updated);
      setOk('Сохранено');
      setEditing(false);
      router.replace(`/catalog/schedule-change-requests/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(act: string) {
    setBusy(true);
    setError('');
    setMenuOpen(false);
    try {
      if (act === 'approve' || act === 'reject') {
        await apiFetch(`/api/hr/requests/${id}/review`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: act === 'approve' ? 'approved' : 'rejected',
          }),
        });
      } else if (act === 'restore') {
        await apiFetch(`/api/hr/requests/${id}/restore`, { method: 'POST' });
      } else if (act === 'cancel') {
        await apiFetch(`/api/hr/requests/${id}/cancel`, { method: 'POST' });
      } else if (act === 'delete') {
        await apiFetch(`/api/hr/requests/${id}`, { method: 'DELETE' });
        router.replace('/catalog/schedule-change-requests');
        return;
      }
      await load();
      setOk('Готово');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!row && !error) {
    return <div className={styles.page}>Загрузка…</div>;
  }

  const p = row?.payload || {};
  const kindLabel =
    changeKind === 'day_swap' ? 'Обмен дней' : 'Изменение рабочего графика';

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.actions}>
          {editing ? (
            <button
              type="button"
              className={styles.btnSave}
              disabled={busy}
              onClick={() => void save()}
            >
              Сохранить
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnSave}
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Изменить
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={styles.btnStatus}
              disabled={busy}
              onClick={() => setMenuOpen((v) => !v)}
            >
              Состояние
            </button>
            {menuOpen ? (
              <div className={styles.statusMenu}>
                <button type="button" onClick={() => void runAction('approve')}>
                  Подтвердить
                </button>
                <button type="button" onClick={() => void runAction('reject')}>
                  Отклонить
                </button>
                <button type="button" onClick={() => void runAction('restore')}>
                  Восстановить
                </button>
                <button type="button" onClick={() => void runAction('cancel')}>
                  Отменить
                </button>
                <button type="button" onClick={() => void runAction('delete')}>
                  Удалить
                </button>
              </div>
            ) : null}
          </div>
          <Link href="/catalog/schedule-change-requests" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      <h1 className={styles.title}>
        Запрос на изменение рабочего графика
        {row ? ` · ${empLabel(row.employee)}` : ''}
      </h1>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      {row ? (
        <div className={styles.formShell}>
          <div className={styles.card}>
            <div className={styles.fieldStack}>
              <div className={styles.field}>
                <span>Сотрудник</span>
                <div className={styles.fieldValue}>{empLabel(row.employee)}</div>
              </div>
              <div className={styles.field}>
                <span>Состояние</span>
                <div className={styles.fieldValue}>{row.status}</div>
              </div>
              <div className={styles.field}>
                <span>Дата запроса</span>
                <div className={styles.fieldValue}>{fmtDt(row.createdAt)}</div>
              </div>
              <div className={styles.field}>
                <span>Тип запроса</span>
                {editing ? (
                  <div className={styles.radioRow}>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        checked={changeKind === 'day_swap'}
                        onChange={() => setChangeKind('day_swap')}
                      />
                      Обмен дней
                    </label>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        checked={changeKind === 'schedule_change'}
                        onChange={() => setChangeKind('schedule_change')}
                      />
                      Изменение графика
                    </label>
                  </div>
                ) : (
                  <div className={styles.fieldValue}>{kindLabel}</div>
                )}
              </div>

              {changeKind === 'day_swap' ? (
                <div className={styles.field}>
                  <span>Даты обмена</span>
                  {editing ? (
                    <div className={styles.swapList}>
                      {swaps.map((s, i) => (
                        <div key={i} className={styles.swapRow}>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={s.fromDate?.slice(0, 10) || ''}
                            onChange={(e) =>
                              setSwaps((prev) =>
                                prev.map((x, idx) =>
                                  idx === i ? { ...x, fromDate: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          <span className={styles.swapArrow}>↔</span>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={s.toDate?.slice(0, 10) || ''}
                            onChange={(e) =>
                              setSwaps((prev) =>
                                prev.map((x, idx) =>
                                  idx === i ? { ...x, toDate: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() =>
                          setSwaps((prev) => [...prev, { fromDate: '', toDate: '' }])
                        }
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className={styles.fieldValue}>
                      {Array.isArray(p.swaps) && (p.swaps as SwapPair[]).length
                        ? (p.swaps as SwapPair[])
                            .map((s) => `${s.fromDate} ↔ ${s.toDate}`)
                            .join('; ')
                        : '—'}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.field}>
                  <span>Изменения дней</span>
                  {editing ? (
                    <div className={styles.swapList}>
                      {days.map((d, i) => (
                        <div key={i} className={styles.dayChangeRow}>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={d.date}
                            onChange={(e) =>
                              setDays((prev) =>
                                prev.map((x, idx) =>
                                  idx === i ? { ...x, date: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          <div className={styles.dayTypeRadios}>
                            <label className={styles.radio}>
                              <input
                                type="radio"
                                name={`dayType-${i}`}
                                checked={d.dayType === 'work'}
                                onChange={() =>
                                  setDays((prev) =>
                                    prev.map((x, idx) =>
                                      idx === i ? { ...x, dayType: 'work' } : x,
                                    ),
                                  )
                                }
                              />
                              Рабочий день
                            </label>
                            <label className={styles.radio}>
                              <input
                                type="radio"
                                name={`dayType-${i}`}
                                checked={d.dayType === 'off'}
                                onChange={() =>
                                  setDays((prev) =>
                                    prev.map((x, idx) =>
                                      idx === i ? { ...x, dayType: 'off' } : x,
                                    ),
                                  )
                                }
                              />
                              Выходной день
                            </label>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() =>
                          setDays((prev) => [...prev, { date: '', dayType: 'work' }])
                        }
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className={styles.fieldValue}>
                      {Array.isArray(p.days) && (p.days as DayChange[]).length
                        ? (p.days as DayChange[])
                            .map(
                              (d) =>
                                `${d.date} (${d.dayType === 'off' ? 'выходной' : 'рабочий'})`,
                            )
                            .join('; ')
                        : '—'}
                    </div>
                  )}
                </div>
              )}

              <div className={styles.field}>
                <span>Примечание</span>
                {editing ? (
                  <textarea
                    rows={4}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                ) : (
                  <div className={styles.fieldValue}>
                    {typeof p.note === 'string' && p.note ? p.note : '—'}
                  </div>
                )}
              </div>

              {row.reviewNote ? (
                <div className={styles.field}>
                  <span>Примечание руководителя</span>
                  <div className={styles.fieldValue}>{row.reviewNote}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ScheduleChangeRequestDetailPage() {
  return (
    <Suspense fallback={<div className={styles.page}>Загрузка…</div>}>
      <DetailInner />
    </Suspense>
  );
}
