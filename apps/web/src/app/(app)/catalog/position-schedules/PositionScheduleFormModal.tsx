'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import type { ScheduleKind } from './page';
import styles from './page.module.css';

const KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'ordinary', label: 'Обычный' },
  { kind: 'hourly', label: 'Почасовой' },
  { kind: 'advanced', label: 'Продвинутый' },
  { kind: 'multi_shift', label: 'Многосменный' },
];

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

type DivOpt = { id: string; label: string };

type DocRow = {
  id: string;
  status: string;
  kind: string;
  documentDate: string;
  number?: string | null;
  month: string;
  divisionId?: string | null;
  note?: string | null;
  settings?: Record<string, unknown> | null;
};

function monthIso(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

export function PositionScheduleFormModal({
  open,
  editId,
  initialKind = 'ordinary',
  onClose,
  onSaved,
}: {
  open: boolean;
  editId?: string | null;
  initialKind?: ScheduleKind;
  onClose: () => void;
  /** `openDoc` — сохранить и перейти к заполнению графика */
  onSaved: (id: string, openDoc: boolean) => void;
}) {
  const isEdit = Boolean(editId);
  const now = new Date();

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');

  const [kind, setKind] = useState<ScheduleKind>(initialKind);
  const [documentDate, setDocumentDate] = useState(now.toISOString().slice(0, 10));
  const [number, setNumber] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [divisionId, setDivisionId] = useState('');
  const [note, setNote] = useState('');
  const [fillOnlyWithEmployees, setFillOnlyWithEmployees] = useState(true);
  const [savedSettings, setSavedSettings] = useState<Record<string, unknown>>({});
  const [divisions, setDivisions] = useState<DivOpt[]>([]);

  const readOnly = isEdit && status !== 'draft';

  useEffect(() => {
    if (!open) return;
    apiFetch<{ divisions?: DivOpt[] }>('/api/catalog/lookups')
      .then((d) => setDivisions(d.divisions || []))
      .catch(() => setDivisions([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      const d = new Date();
      setStatus('draft');
      setKind(initialKind);
      setDocumentDate(d.toISOString().slice(0, 10));
      setNumber('');
      setYear(d.getFullYear());
      setMonthIndex(d.getMonth());
      setDivisionId('');
      setNote('');
      setFillOnlyWithEmployees(true);
      setSavedSettings({});
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<DocRow>(`/api/catalog/position-schedules/${editId}`)
      .then((row) => {
        setStatus(row.status || 'draft');
        setKind((row.kind as ScheduleKind) || 'ordinary');
        setDocumentDate(String(row.documentDate).slice(0, 10));
        setNumber(row.number || '');
        const m = new Date(row.month);
        if (!Number.isNaN(m.getTime())) {
          setYear(m.getUTCFullYear());
          setMonthIndex(m.getUTCMonth());
        }
        setDivisionId(row.divisionId || '');
        setNote(row.note || '');
        const s = (row.settings || {}) as Record<string, unknown>;
        setSavedSettings(s);
        setFillOnlyWithEmployees(s.fillOnlyWithEmployees !== false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId, initialKind]);

  async function save(openDoc: boolean) {
    if (!documentDate) {
      setError('Дата обязательна');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        kind,
        documentDate,
        number: number.trim() || undefined,
        month: monthIso(year, monthIndex),
        divisionId: divisionId || undefined,
        note: note.trim() || undefined,
        settings: { ...savedSettings, fillOnlyWithEmployees },
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/position-schedules/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId, openDoc);
      } else {
        const created = await apiFetch<{ id: string }>('/api/catalog/position-schedules', {
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
      title={isEdit ? 'График для позиций (изменение)' : 'График для позиций (создание)'}
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
              Тип графика <em className={modal.req}>*</em>
            </span>
            <select
              value={kind}
              disabled={isEdit || readOnly}
              onChange={(e) => setKind(e.target.value as ScheduleKind)}
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
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
              <span>Подразделение</span>
              <select
                value={divisionId}
                disabled={readOnly}
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
          </div>

          <label className={modal.radio}>
            <input
              type="checkbox"
              checked={fillOnlyWithEmployees}
              disabled={readOnly}
              onChange={(e) => setFillOnlyWithEmployees(e.target.checked)}
            />
            Заполнять только позициями с сотрудниками
          </label>

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
            Строки позиций и сетка дней заполняются в документе — «Сохранить и заполнить».
          </p>
        </div>
      )}
    </FormModal>
  );
}
