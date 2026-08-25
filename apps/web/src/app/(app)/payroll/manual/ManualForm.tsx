'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import {
  emptyLine,
  money,
  toDatetimeLocal,
  type CoaOpt,
  type ManualLine,
  type ManualOp,
} from '@/lib/manual-ops';
import form from '../accruals/form.module.css';
import extra from '../../catalog/settlements/extra.module.css';
import local from './manual.module.css';

const PATH = '/payroll/manual';

function AccountLookup({
  value,
  name,
  options,
  disabled,
  onChange,
}: {
  value: string;
  name?: string | null;
  options: CoaOpt[];
  disabled?: boolean;
  onChange: (code: string, accountName: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.code === value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const filtered = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    if (!qq) return options.slice(0, 80);
    return options.filter((o) => o.label.toLowerCase().includes(qq)).slice(0, 80);
  }, [options, draft]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const shown = selected ? selected.label : value ? `${value}${name ? ` ${name}` : ''}` : '';
  return (
    <div className={form.searchWrap} ref={wrapRef}>
      <input
        className={form.searchInput}
        disabled={disabled}
        value={open ? draft : shown}
        placeholder="Поиск..."
        onFocus={() => {
          setDraft('');
          setOpen(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {value && !open && !disabled ? (
        <button type="button" className={form.searchClear} onClick={() => onChange('', '')}>
          ×
        </button>
      ) : null}
      {open && !disabled ? (
        <div className={form.menu}>
          {filtered.length === 0 ? <div className={form.optEmpty}>Нет данных</div> : null}
          {filtered.map((o) => (
            <button
              key={o.code}
              type="button"
              className={o.code === value ? form.optOn : form.opt}
              onClick={() => {
                onChange(o.code, o.name);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ManualForm({ docId }: { docId?: string }) {
  const router = useRouter();
  const isNew = !docId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [number, setNumber] = useState('');
  const [docDate, setDocDate] = useState(toDatetimeLocal());
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<ManualLine[]>([emptyLine()]);
  const [coa, setCoa] = useState<CoaOpt[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const dicts = await apiFetch<Array<{ code: string; items?: Array<{ code: string; name: string }> }>>(
          '/api/settings/dictionaries?kind=extra',
        ).catch(() => []);
        const items = (Array.isArray(dicts) ? dicts : []).find((d) => d.code === 'coa')?.items || [];
        setCoa(items.map((i) => ({ code: i.code, name: i.name, label: `${i.code}. ${i.name}` })));
        if (docId) {
          const row = await apiFetch<ManualOp>(`/api/payroll/manual-ops/${docId}`);
          setStatus(row.status);
          setNumber(row.number || '');
          setDocDate(toDatetimeLocal(row.docDate));
          setNote(row.note || '');
          setLines(row.lines?.length ? row.lines : [emptyLine()]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [docId]);

  const readOnly = status !== 'draft';
  const title = `Ручная операция (${isNew ? 'создание' : readOnly ? 'просмотр' : 'изменение'})`;

  function payload() {
    return {
      number: number || undefined,
      docDate: new Date(docDate).toISOString(),
      note,
      lines: lines
        .filter((l) => l.debitAccount || l.creditAccount || Number(l.amount))
        .map((l) => ({
          debitAccount: l.debitAccount,
          debitName: l.debitName || undefined,
          creditAccount: l.creditAccount,
          creditName: l.creditName || undefined,
          quantity: Number(l.quantity) || 0,
          amount: Number(l.amount) || 0,
          amountBase: Number(l.amountBase || l.amount) || 0,
        })),
    };
  }

  async function save(andPost: boolean) {
    setSaving(true);
    setError('');
    try {
      let id = docId;
      const body = payload();
      if (isNew) {
        const created = await apiFetch<ManualOp>('/api/payroll/manual-ops', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/manual-ops/${docId}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      if (andPost && id) {
        await apiFetch(`/api/payroll/manual-ops/${id}/post`, { method: 'POST' });
      }
      router.push(id ? `${PATH}/${id}` : PATH);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function patchLine(i: number, next: Partial<ManualLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...next } : l)));
  }

  if (loading) return <p>Загрузка…</p>;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="manual-ops" titleOverride={title} />
      <div className={form.topBar}>
        <h1 className={form.title}>{title}</h1>
        <div className={form.actions}>
          {!readOnly ? (
            <>
              <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save(false)}>
                Сохранить
              </button>
              <button type="button" className={form.btnPost} disabled={saving} onClick={() => void save(true)}>
                Сохранить и провести
              </button>
            </>
          ) : (
            <button
              type="button"
              className={form.btnCancel}
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await apiFetch(`/api/payroll/manual-ops/${docId}/unpost`, { method: 'POST' });
                  router.refresh();
                  setStatus('draft');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Ошибка');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Отменить
            </button>
          )}
          <button type="button" className={form.btnClose} onClick={() => router.push(PATH)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      <div className={form.card}>
        <div className={form.grid2}>
          <div className={form.field}>
            <label>Номер</label>
            <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>
              Дата <span className={form.req}>*</span>
            </label>
            <input
              type="datetime-local"
              step="1"
              value={docDate}
              disabled={readOnly}
              onChange={(e) => setDocDate(e.target.value)}
            />
          </div>
          <div className={`${form.field} ${form.full}`}>
            <label>Примечание</label>
            <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>

      {lines.map((l, i) => (
        <div key={l.id || i} className={local.block}>
          <div className={local.blockHead}>
            <h2 className={local.blockTitle}>Проводка №{i + 1}</h2>
            {!readOnly ? (
              <div className={local.blockTools}>
                <button type="button" className={extra.iconBtn} onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                  +
                </button>
                <button
                  type="button"
                  className={extra.trash}
                  disabled={lines.length <= 1}
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  🗑
                </button>
              </div>
            ) : null}
          </div>
          <div className={local.row}>
            <div className={form.field}>
              <label>
                Дебет <span className={form.req}>*</span>
              </label>
              <AccountLookup
                value={l.debitAccount}
                name={l.debitName}
                options={coa}
                disabled={readOnly}
                onChange={(code, accountName) => patchLine(i, { debitAccount: code, debitName: accountName })}
              />
            </div>
            <button
              type="button"
              className={local.swap}
              disabled={readOnly}
              title="Поменять дебет и кредит"
              onClick={() =>
                patchLine(i, {
                  debitAccount: l.creditAccount,
                  debitName: l.creditName,
                  creditAccount: l.debitAccount,
                  creditName: l.debitName,
                })
              }
            >
              ⇄
            </button>
            <div className={form.field}>
              <label>
                Кредит <span className={form.req}>*</span>
              </label>
              <AccountLookup
                value={l.creditAccount}
                name={l.creditName}
                options={coa}
                disabled={readOnly}
                onChange={(code, accountName) => patchLine(i, { creditAccount: code, creditName: accountName })}
              />
            </div>
          </div>
          <div className={local.row2}>
            <div className={form.field}>
              <label>Кол-во</label>
              <input
                type="number"
                value={l.quantity}
                disabled={readOnly}
                onChange={(e) => patchLine(i, { quantity: Number(e.target.value) || 0 })}
              />
            </div>
            <div className={form.field}>
              <label>
                Сумма <span className={form.req}>*</span>
              </label>
              <input
                type="number"
                value={l.amount}
                disabled={readOnly}
                onChange={(e) => {
                  const amount = Number(e.target.value) || 0;
                  patchLine(i, { amount, amountBase: amount });
                }}
              />
            </div>
            <div className={form.field}>
              <label>
                Сумма в базовой валюте <span className={form.req}>*</span>
              </label>
              <input
                type="number"
                value={l.amountBase}
                disabled={readOnly}
                onChange={(e) => patchLine(i, { amountBase: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      ))}
      <div className={extra.muted}>Итого: {money(lines.reduce((s, l) => s + (Number(l.amountBase) || Number(l.amount) || 0), 0))}</div>
    </div>
  );
}
