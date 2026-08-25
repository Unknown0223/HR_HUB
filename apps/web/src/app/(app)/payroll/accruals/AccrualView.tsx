'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import {
  type AccrualAudit,
  type AccrualDoc,
  fmtDate,
  formatMonthRu,
  kindLabel,
  money,
} from '@/lib/accruals';
import styles from './form.module.css';

type Tab = 'main' | 'operations' | 'history';

type OpRow = {
  employee: string;
  name: string;
  amount: number;
  amountBase: number;
  opType: string;
};

export function AccrualView({ id }: { id: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('main');
  const [doc, setDoc] = useState<AccrualDoc | null>(null);
  const [ops, setOps] = useState<OpRow[]>([]);
  const [history, setHistory] = useState<AccrualAudit[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const row = await apiFetch<AccrualDoc>(`/api/payroll/accruals/${id}`);
      setDoc(row);
      const [o, h] = await Promise.all([
        apiFetch<OpRow[]>(`/api/payroll/accruals/${id}/operations`),
        apiFetch<AccrualAudit[]>(`/api/payroll/accruals/${id}/history`),
      ]);
      setOps(o);
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cancel() {
    if (!(await confirm({ message: 'Отменить проведение?', confirmText: 'Да', cancelText: 'Нет', variant: 'danger' }))) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/payroll/accruals/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return error ? <p className={styles.error}>{error}</p> : <p>Загрузка…</p>;
  }

  const title = `${kindLabel(doc.kind)} (${doc.status === 'posted' ? 'просмотр' : 'изменение'})`;
  const sideTitle = `${kindLabel(doc.kind)} № ${doc.number || '—'} от ${formatMonthRu(doc.month)}`;

  return (
    <div className={styles.page}>
      <PageSubnav groupKey="accruals" titleOverride={title} />
      <div className={styles.topBar}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>
          {doc.status === 'posted' ? (
            <button type="button" className={styles.btnCancel} disabled={busy} onClick={() => void cancel()}>
              Отменить
            </button>
          ) : (
            <button type="button" className={styles.btnSave} onClick={() => router.push(`/payroll/accruals/${id}/edit?kind=${doc.kind}`)}>
              Изменить
            </button>
          )}
          <button type="button" className={styles.btnClose} onClick={() => router.push('/payroll/accruals')}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.layout}>
        <aside className={styles.side}>
          <div className={styles.sideHead}>{sideTitle}</div>
          <span className={doc.status === 'posted' ? styles.badge : `${styles.badge} ${styles.badgeOff}`}>
            {doc.status === 'posted' ? 'Проведен' : doc.status === 'cancelled' ? 'Отменен' : 'Черновик'}
          </span>
          <nav className={styles.sideNav}>
            <button type="button" data-on={tab === 'main' ? '1' : '0'} onClick={() => setTab('main')}>
              Основная информация
            </button>
            <button type="button" data-on={tab === 'operations' ? '1' : '0'} onClick={() => setTab('operations')}>
              Операции
            </button>
            <button type="button" data-on={tab === 'history' ? '1' : '0'} onClick={() => setTab('history')}>
              История изменений
            </button>
          </nav>
        </aside>

        <div className={styles.card}>
          {tab === 'main' ? (
            <>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label>Месяц начисления</label>
                  <div>{formatMonthRu(doc.month)}</div>
                </div>
                <div className={styles.field}>
                  <label>Дата</label>
                  <div>{fmtDate(doc.docDate)}</div>
                </div>
                <div className={styles.field}>
                  <label>Номер</label>
                  <div>{doc.number || '—'}</div>
                </div>
                <div className={`${styles.field} ${styles.full}`}>
                  <label>Название документа</label>
                  <div>{doc.title || '—'}</div>
                </div>
                <div className={styles.field}>
                  <label>Подразделение</label>
                  <div>{doc.division?.name || '—'}</div>
                </div>
                <div className={styles.field}>
                  <label>Валюта</label>
                  <div>{doc.currency === 'UZS' ? 'Узбекский сум' : doc.currency}</div>
                </div>
                <div className={`${styles.field} ${styles.full}`}>
                  <label>Примечание</label>
                  <div>{doc.note || '—'}</div>
                </div>
              </div>
              <div className={styles.sums} style={{ marginTop: 16 }}>
                <div className={styles.sumAcc}>
                  <div className={styles.sumLabel}>Начислено</div>
                  <div className={styles.sumVal}>{money(doc.accruedTotal)}</div>
                </div>
                <div className={styles.sumDed}>
                  <div className={styles.sumLabel}>Удержано</div>
                  <div className={styles.sumVal}>{money(doc.deductedTotal)}</div>
                </div>
              </div>
            </>
          ) : null}

          {tab === 'operations' ? (
            <>
              <div className={styles.cardHead}>
                <h2>Операции</h2>
                <div className={styles.cardLinks}>
                  <Link href={`/payroll/accruals/${id}`}>Начисление</Link>
                  <Link href={`/payroll/accruals/${id}/entries`}>Проводки</Link>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Начисление</th>
                      <th className={styles.num}>Сумма выдачи</th>
                      <th className={styles.num}>Сумма выдачи в базовой валюте</th>
                      <th>Тип операции</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.empty}>
                          Нет данных
                        </td>
                      </tr>
                    ) : null}
                    {ops.map((r, i) => (
                      <tr key={i}>
                        <td>{r.employee}</td>
                        <td>{r.name}</td>
                        <td className={styles.num}>{money(r.amount)}</td>
                        <td className={styles.num}>{money(r.amountBase)}</td>
                        <td>{r.opType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {tab === 'history' ? (
            <>
              <div className={styles.cardHead}>
                <h2>История изменений</h2>
                <div className={styles.cardLinks}>
                  <Link href={`/payroll/accruals/${id}`}>Начисление</Link>
                  <Link href={`/payroll/accruals/${id}/entries`}>Проводки</Link>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Дата события</th>
                      <th>Пользователь</th>
                      <th>Событие</th>
                      <th>Месяц</th>
                      <th>Номер</th>
                      <th>Название документа</th>
                      <th>Проведен</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={styles.empty}>
                          Нет данных
                        </td>
                      </tr>
                    ) : null}
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>
                          {new Date(h.occurredAt).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td>{h.userName}</td>
                        <td>{h.event}</td>
                        <td>{h.month ? formatMonthRu(h.month) : '—'}</td>
                        <td>{h.number || '—'}</td>
                        <td>{h.title || '—'}</td>
                        <td>
                          <span className={h.posted ? styles.badge : `${styles.badge} ${styles.badgeOff}`}>
                            {h.posted ? 'Да' : 'Нет'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
