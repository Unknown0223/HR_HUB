'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { ROUNDING_OPTS } from '@/lib/vedomost';
import {
  SALES_KINDS,
  type PayType,
  type SalesAccrualDoc,
  type SalesKind,
} from '@/lib/sales-accruals';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function SalesAccrualFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string, openDoc: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cashboxes, setCashboxes] = useState<string[]>([]);

  const [number, setNumber] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth());
  const [periodTo, setPeriodTo] = useState(today());
  const [title, setTitle] = useState('');
  const [paymentType, setPaymentType] = useState<PayType>('cash');
  const [salesKind, setSalesKind] = useState<SalesKind>('personal');
  const [cashbox, setCashbox] = useState('Основная касса');
  const [bankAccount, setBankAccount] = useState('');
  const [rounding, setRounding] = useState('####.000000');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setNumber('');
    setDocDate(today());
    setPeriodFrom(firstOfMonth());
    setPeriodTo(today());
    setTitle('');
    setPaymentType('cash');
    setSalesKind('personal');
    setCashbox('Основная касса');
    setBankAccount('');
    setRounding('####.000000');
    setNote('');

    apiFetch<Array<{ code: string; items?: Array<{ name: string; code: string }> }>>(
      '/api/settings/dictionaries?kind=extra',
    )
      .then((dicts) => {
        const cb = dicts.find((d) => d.code === 'cashboxes')?.items || [];
        const names = cb.map((i) => i.name || i.code).filter(Boolean);
        setCashboxes(names);
        if (names.includes('Основная касса')) setCashbox('Основная касса');
        else if (names[0]) setCashbox(names[0]);
      })
      .catch(() => setCashboxes([]));
  }, [open]);

  async function save(openDoc: boolean) {
    if (!docDate || !periodFrom || !periodTo) {
      setError('Заполните обязательные даты');
      return;
    }
    if (paymentType === 'cash' && !cashbox.trim()) {
      setError('Укажите кассу');
      return;
    }
    if (paymentType === 'bank' && !bankAccount.trim()) {
      setError('Укажите расчетный счет');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<SalesAccrualDoc>('/api/payroll/sales-accruals', {
        method: 'POST',
        body: JSON.stringify({
          number: number.trim() || undefined,
          docDate,
          periodFrom,
          periodTo,
          title: title.trim() || undefined,
          paymentType,
          salesKind,
          cashbox: paymentType === 'cash' ? cashbox : undefined,
          bankAccount: paymentType === 'bank' ? bankAccount : undefined,
          rounding,
          note: note.trim() || undefined,
          lines: [],
        }),
      });
      onSaved(created?.id || '', openDoc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Начисление процентов от продаж (создание)"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy}
            onClick={() => void save(true)}
          >
            Сохранить и открыть
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={modal.fields}>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>Номер</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="авто" />
          </label>
          <label className={modal.field}>
            <span>
              Дата <em className={modal.req}>*</em>
            </span>
            <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </label>
        </div>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Дата начала <em className={modal.req}>*</em>
            </span>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </label>
          <label className={modal.field}>
            <span>
              Дата окончания <em className={modal.req}>*</em>
            </span>
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </label>
        </div>
        <label className={modal.field}>
          <span>Название</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>Тип оплаты</span>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as PayType)}
            >
              <option value="cash">Наличные</option>
              <option value="bank">Безналичные</option>
            </select>
          </label>
          <label className={modal.field}>
            <span>Вид продаж</span>
            <select
              value={salesKind}
              onChange={(e) => setSalesKind(e.target.value as SalesKind)}
            >
              {SALES_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {paymentType === 'cash' ? (
          <label className={modal.field}>
            <span>
              Касса <em className={modal.req}>*</em>
            </span>
            {cashboxes.length ? (
              <select value={cashbox} onChange={(e) => setCashbox(e.target.value)}>
                {cashboxes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input value={cashbox} onChange={(e) => setCashbox(e.target.value)} />
            )}
          </label>
        ) : (
          <label className={modal.field}>
            <span>
              Расчетный счет <em className={modal.req}>*</em>
            </span>
            <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
          </label>
        )}
        <label className={modal.field}>
          <span>Округление</span>
          <select value={rounding} onChange={(e) => setRounding(e.target.value)}>
            {ROUNDING_OPTS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#8ca0b8', lineHeight: 1.45 }}>
          Строки сотрудников добавляются после создания — откройте документ и нажмите
          «Изменить».
        </p>
      </div>
    </FormModal>
  );
}
