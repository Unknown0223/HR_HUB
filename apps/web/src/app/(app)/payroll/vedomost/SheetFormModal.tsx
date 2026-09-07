'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { formatMonthRu } from '@/lib/fine-policies';
import { kindLabel, type SheetKind, type SheetPayType } from '@/lib/vedomost';

type Opt = { id: string; label: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function SheetFormModal({
  open,
  initialKind,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialKind?: string | null;
  onClose: () => void;
  onSaved: (id: string, openAfter: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [cashboxes, setCashboxes] = useState<string[]>([]);

  const [kind, setKind] = useState<SheetKind>('vedomost');
  const [month, setMonth] = useState(currentMonth());
  const [issueDate, setIssueDate] = useState(today());
  const [number, setNumber] = useState('');
  const [payType, setPayType] = useState<SheetPayType>('cash');
  const [divisionId, setDivisionId] = useState('');
  const [cashbox, setCashbox] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [note, setNote] = useState('');

  const loadLookups = useCallback(async () => {
    setLoading(true);
    try {
      const [divs, dicts] = await Promise.all([
        apiFetch<Array<{ id: string; name: string }>>('/api/organization/divisions').catch(
          () => [],
        ),
        apiFetch<Array<{ code: string; items?: Array<{ name: string; code: string }> }>>(
          '/api/settings/dictionaries?kind=extra',
        ).catch(() => []),
      ]);
      setDivisions(
        (Array.isArray(divs) ? divs : []).map((d) => ({ id: d.id, label: d.name })),
      );
      const cb = (Array.isArray(dicts) ? dicts : []).find((d) => d.code === 'cashboxes')
        ?.items || [];
      setCashboxes(cb.map((i) => i.name || i.code).filter(Boolean));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки справочников');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const startKind: SheetKind =
      initialKind === 'advance_salary' ? 'advance_salary' : 'vedomost';
    setError('');
    setBusy(false);
    setKind(startKind);
    setMonth(currentMonth());
    setIssueDate(today());
    setNumber('');
    setPayType('cash');
    setDivisionId('');
    setCashbox('');
    setBankAccount('');
    setCurrency('UZS');
    setNote('');
    void loadLookups();
  }, [open, initialKind, loadLookups]);

  async function save(openAfter: boolean) {
    if (!month) {
      setError('Месяц обязателен');
      return;
    }
    if (!issueDate) {
      setError('Дата выдачи обязательна');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/payroll/sheets', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          month: `${month}-01`,
          issueDate,
          payType: kind === 'vedomost' ? payType : undefined,
          number: number.trim() || undefined,
          divisionId: divisionId || undefined,
          cashbox: cashbox || undefined,
          bankAccount: bankAccount || undefined,
          currency,
          note: note.trim() || undefined,
          lines: [],
        }),
      });
      onSaved(created?.id || '', openAfter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  const isAdvance = kind === 'advance_salary';

  return (
    <FormModal
      open={open}
      title={`${kindLabel(kind)} (создание)`}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy || loading}
            onClick={() => void save(true)}
          >
            Сохранить и открыть
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Отмена
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={modal.fields}>
        <label className={modal.field}>
          <span>
            Тип документа <em className={modal.req}>*</em>
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SheetKind)}
          >
            <option value="vedomost">Ведомость</option>
            <option value="advance_salary">Аванс по официальному окладу</option>
          </select>
        </label>

        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Месяц <em className={modal.req}>*</em>
            </span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <span>{month ? formatMonthRu(`${month}-01`) : ''}</span>
          </label>
          <label className={modal.field}>
            <span>
              Дата выдачи <em className={modal.req}>*</em>
            </span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </label>
        </div>

        <div className={modal.row2}>
          <label className={modal.field}>
            <span>Номер</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="авто"
            />
          </label>
          {!isAdvance ? (
            <label className={modal.field}>
              <span>Тип оплаты</span>
              <select
                value={payType}
                onChange={(e) => setPayType(e.target.value as SheetPayType)}
              >
                <option value="cash">Наличные</option>
                <option value="bank">Безналичные</option>
              </select>
            </label>
          ) : (
            <label className={modal.field}>
              <span>Валюта</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="UZS">Узбекский сум</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
          )}
        </div>

        {!isAdvance ? (
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Валюта</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="UZS">Узбекский сум</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            {payType === 'cash' ? (
              <label className={modal.field}>
                <span>Касса</span>
                <select
                  value={cashbox}
                  disabled={loading}
                  onChange={(e) => setCashbox(e.target.value)}
                >
                  <option value="">—</option>
                  {cashboxes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className={modal.field}>
                <span>Банковский счёт</span>
                <input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                />
              </label>
            )}
          </div>
        ) : null}

        <label className={modal.field}>
          <span>Подразделение</span>
          <select
            value={divisionId}
            disabled={loading}
            onChange={(e) => setDivisionId(e.target.value)}
          >
            <option value="">—</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
