'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

type SchedOpt = { id: string; label: string };

type DocRow = {
  id: string;
  status: string;
  name: string;
  documentDate: string;
  number?: string | null;
  month: string;
  scheduleId: string;
  note?: string | null;
};

function monthIso(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

export function RosterFormModal({
  open,
  editId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editId?: string | null;
  onClose: () => void;
  onSaved: (id: string, openDoc: boolean) => void;
}) {
  const isEdit = Boolean(editId);
  const now = new Date();

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');

  const [name, setName] = useState('');
  const [documentDate, setDocumentDate] = useState(now.toISOString().slice(0, 10));
  const [number, setNumber] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [scheduleId, setScheduleId] = useState('');
  const [note, setNote] = useState('');
  const [schedules, setSchedules] = useState<SchedOpt[]>([]);

  const readOnly = isEdit && status !== 'draft';

  useEffect(() => {
    if (!open) return;
    apiFetch<{ schedules?: SchedOpt[] }>('/api/catalog/lookups')
      .then((d) => setSchedules(d.schedules || []))
      .catch(() => setSchedules([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      const d = new Date();
      setStatus('draft');
      setName('');
      setDocumentDate(d.toISOString().slice(0, 10));
      setNumber('');
      setYear(d.getFullYear());
      setMonthIndex(d.getMonth());
      setScheduleId('');
      setNote('');
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<DocRow>(`/api/catalog/rosters/${editId}`)
      .then((row) => {
        setStatus(row.status || 'draft');
        setName(row.name || '');
        setDocumentDate(String(row.documentDate).slice(0, 10));
        setNumber(row.number || '');
        const m = new Date(row.month);
        if (!Number.isNaN(m.getTime())) {
          setYear(m.getUTCFullYear());
          setMonthIndex(m.getUTCMonth());
        }
        setScheduleId(row.scheduleId || '');
        setNote(row.note || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId]);

  async function save(openDoc: boolean) {
    if (!name.trim()) {
      setError('Название — обязательное поле');
      return;
    }
    if (!scheduleId) {
      setError('График работы — обязательное поле');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        documentDate,
        number: number.trim() || undefined,
        month: monthIso(year, monthIndex),
        scheduleId,
        note: note.trim() || undefined,
        lines: [],
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/rosters/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId, openDoc);
      } else {
        const created = await apiFetch<{ id: string }>('/api/catalog/rosters', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        onSaved(created?.id || '', openDoc);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title={isEdit ? 'Расписание (изменение)' : 'Расписание (создание)'}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading || readOnly}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy || loading || readOnly}
            onClick={() => void save(true)}
          >
            Сохранить и заполнить
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      {readOnly ? (
        <p className={modal.error}>
          Документ {status === 'posted' ? 'проведён' : 'отменён'} — редактирование недоступно
        </p>
      ) : null}
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <label className={modal.field}>
            <span>
              Название <em className={modal.req}>*</em>
            </span>
            <input
              value={name}
              disabled={readOnly}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Дата <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={documentDate}
                disabled={readOnly}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Номер</span>
              <input
                value={number}
                disabled={readOnly}
                placeholder="Авто / вручную"
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Месяц <em className={modal.req}>*</em>
              </span>
              <select
                value={`${year}-${monthIndex}`}
                disabled={readOnly}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setYear(y);
                  setMonthIndex(m);
                }}
              >
                {[year - 1, year, year + 1].flatMap((y) =>
                  MONTHS.map((label, mi) => (
                    <option key={`${y}-${mi}`} value={`${y}-${mi}`}>
                      {label} {y}
                    </option>
                  )),
                )}
              </select>
            </label>
            <label className={modal.field}>
              <span>
                График работы <em className={modal.req}>*</em>
              </span>
              <select
                value={scheduleId}
                disabled={readOnly}
                onChange={(e) => setScheduleId(e.target.value)}
              >
                <option value="">—</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={modal.field}>
            <span>Примечание</span>
            <textarea
              value={note}
              disabled={readOnly}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <p className={styles.muted}>
            Сотрудники и сетка смен заполняются в документе — «Сохранить и заполнить».
          </p>
        </div>
      )}
    </FormModal>
  );
}
