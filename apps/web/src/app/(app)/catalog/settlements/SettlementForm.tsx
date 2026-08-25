'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import {
  money,
  toDatetimeLocal,
  type AccountPair,
  type SettlementDoc,
  type SettlementLine,
} from '@/lib/settlements';
import form from '../../payroll/accruals/form.module.css';
import list from '../absence-types/page.module.css';
import extra from './extra.module.css';

export function SettlementForm({ docId }: { docId?: string }) {
  const router = useRouter();
  const isNew = !docId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pairs, setPairs] = useState<AccountPair[]>([]);
  const [docDate, setDocDate] = useState(toDatetimeLocal());
  const [note, setNote] = useState('');
  const [pairIds, setPairIds] = useState<string[]>([]);
  const [lines, setLines] = useState<SettlementLine[]>([]);
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [subconto, setSubconto] = useState('');
  const [status, setStatus] = useState('open');

  useEffect(() => {
    void (async () => {
      try {
        const all = await apiFetch<AccountPair[]>('/api/payroll/account-pairs');
        const active = all.filter((p) => p.isActive);
        setPairs(active);
        if (docId) {
          const row = await apiFetch<SettlementDoc>(`/api/payroll/settlements/${docId}`);
          setDocDate(toDatetimeLocal(row.docDate));
          setNote(row.note || '');
          setPairIds(row.pairIds?.length ? row.pairIds : active.map((p) => p.id));
          setLines(row.lines || []);
          setStatus(row.status);
        } else {
          setPairIds(active.map((p) => p.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [docId]);

  const selected = pairs.filter((p) => pairIds.includes(p.id));

  async function refresh() {
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch<{ lines: SettlementLine[] }>('/api/payroll/settlements/refresh', {
        method: 'POST',
        body: JSON.stringify({ pairIds, subconto: subconto || undefined }),
      });
      setLines(data.lines || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка обновления');
    } finally {
      setSaving(false);
    }
  }

  async function saveAndPost() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        docDate: new Date(docDate).toISOString(),
        note,
        pairIds,
        lines: lines.map((l) => ({
          id: l.id,
          accountPairId: l.accountPairId || undefined,
          pairName: l.pairName,
          currency: l.currency || 'UZS',
          subconto: l.subconto || '',
          firstAmount: Number(l.firstAmount) || 0,
          secondAmount: Number(l.secondAmount) || 0,
          amount: Number(l.amount) || 0,
        })),
      };
      let id = docId;
      if (isNew) {
        const created = await apiFetch<SettlementDoc>('/api/payroll/settlements', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/settlements/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      if (id) {
        await apiFetch(`/api/payroll/settlements/${id}/post`, { method: 'POST' });
      }
      router.push('/catalog/settlements');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проведения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Загрузка…</p>;
  const readOnly = status !== 'open';
  const title = `Взаимозачет (${isNew ? 'создание' : readOnly ? 'просмотр' : 'изменение'})`;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="settlements" titleOverride={title} />
      <div className={form.topBar}>
        <h1 className={form.title}>{title}</h1>
        <div className={form.actions}>
          {!readOnly ? (
            <button type="button" className={form.btnPost} disabled={saving} onClick={() => void saveAndPost()}>
              Провести
            </button>
          ) : null}
          <button type="button" className={form.btnClose} onClick={() => router.push('/catalog/account-pairs')}>
            Все парные счета
          </button>
          <button type="button" className={form.btnClose} onClick={() => router.push('/catalog/settlements')}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      <div className={form.head}>
        <div className={form.card}>
          <div className={form.grid2}>
            <div className={form.field}>
              <label>
                Дата <span className={form.req}>*</span>
              </label>
              <input
                type="datetime-local"
                step="1"
                value={docDate.slice(0, 19)}
                disabled={readOnly}
                onChange={(e) => setDocDate(e.target.value)}
              />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>Парные счета</label>
              <div className={extra.chips}>
                {selected.map((p) => (
                  <span key={p.id} className={extra.chip}>
                    {p.name}
                    {!readOnly ? (
                      <button type="button" onClick={() => setPairIds((ids) => ids.filter((id) => id !== p.id))}>
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
                {!readOnly ? (
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id && !pairIds.includes(id)) setPairIds((ids) => [...ids, id]);
                    }}
                    style={{ border: 'none', minWidth: 160 }}
                  >
                    <option value="">Добавить…</option>
                    {pairs
                      .filter((p) => !pairIds.includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                ) : null}
              </div>
              <div className={extra.hint}>
                {selected.length === pairs.length && pairs.length > 0
                  ? 'Выбраны все парные счета по умолчанию'
                  : `Выбрано: ${selected.length}`}
              </div>
            </div>
          </div>
        </div>
        <div className={form.card}>
          <div className={form.field}>
            <label>Примечание</label>
            <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>

      <div className={form.card}>
        <div className={form.lineBar}>
          <div className={form.lineLeft}>
            {!readOnly ? (
              <button type="button" className={list.createBtn} disabled={saving} onClick={() => void refresh()}>
                Обновить данные
              </button>
            ) : null}
            <button type="button" className={extra.iconBtn} onClick={() => setFilterOpen(true)} aria-label="Фильтр">
              ▾
            </button>
          </div>
          <div className={form.lineRight}>
            <input className={form.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className={form.tableWrap}>
          <table className={form.table}>
            <thead>
              <tr>
                <th>№</th>
                <th>Парные счета</th>
                <th>Валюта</th>
                <th>Субконто</th>
                <th className={form.num}>Сумма первого счета</th>
                <th className={extra.arrow}>→</th>
                <th className={form.num}>Сумма второго счета</th>
                <th className={form.num}>Сумма</th>
                {!readOnly ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={9} className={list.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {lines.map((l, i) => {
                const qq = q.trim().toLowerCase();
                if (qq && ![l.pairName, l.currency, l.subconto].join(' ').toLowerCase().includes(qq)) {
                  return null;
                }
                return (
                <tr key={l.id || `${l.accountPairId}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{l.pairName}</td>
                  <td>{l.currency}</td>
                  <td>{l.subconto || '—'}</td>
                  <td className={form.num}>
                    {readOnly ? (
                      money(l.firstAmount)
                    ) : (
                      <input
                        type="number"
                        value={l.firstAmount}
                        onChange={(e) => {
                          const firstAmount = Number(e.target.value) || 0;
                          setLines((prev) =>
                            prev.map((x, idx) =>
                              idx === i
                                ? {
                                    ...x,
                                    firstAmount,
                                    amount: Math.min(firstAmount, x.secondAmount) || firstAmount || x.secondAmount,
                                  }
                                : x,
                            ),
                          );
                        }}
                      />
                    )}
                  </td>
                  <td className={extra.arrow}>→</td>
                  <td className={form.num}>
                    {readOnly ? (
                      money(l.secondAmount)
                    ) : (
                      <input
                        type="number"
                        value={l.secondAmount}
                        onChange={(e) => {
                          const secondAmount = Number(e.target.value) || 0;
                          setLines((prev) =>
                            prev.map((x, idx) =>
                              idx === i
                                ? {
                                    ...x,
                                    secondAmount,
                                    amount: Math.min(x.firstAmount, secondAmount) || x.firstAmount || secondAmount,
                                  }
                                : x,
                            ),
                          );
                        }}
                      />
                    )}
                  </td>
                  <td className={form.num}>{money(l.amount)}</td>
                  {!readOnly ? (
                    <td>
                      <button
                        type="button"
                        className={extra.trash}
                        onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        🗑
                      </button>
                    </td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filterOpen ? (
        <div className={extra.modalBack} onClick={() => setFilterOpen(false)}>
          <div className={extra.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={extra.modalTitle}>Фильтр</h2>
            <div className={form.field}>
              <label>Субконто</label>
              <input placeholder="Поиск..." value={subconto} onChange={(e) => setSubconto(e.target.value)} />
            </div>
            <div className={extra.modalActions}>
              <button
                type="button"
                className={form.btnPost}
                onClick={() => {
                  setFilterOpen(false);
                  void refresh();
                }}
              >
                Фильтр
              </button>
              <button
                type="button"
                className={form.btnClose}
                onClick={() => {
                  setSubconto('');
                  setFilterOpen(false);
                  void refresh();
                }}
              >
                Показать все
              </button>
              <button type="button" className={form.btnClose} onClick={() => setFilterOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
