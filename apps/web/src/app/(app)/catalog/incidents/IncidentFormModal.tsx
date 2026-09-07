'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './IncidentFormModal.module.css';

type Opt = { id: string; label: string };

const ACTION_OPTS = [
  { value: 'verbal_warning', label: 'Устное предупреждение' },
  { value: 'written_warning', label: 'Письменное предупреждение' },
  { value: 'fine', label: 'Штраф' },
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function IncidentFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string, openAfter: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [employees, setEmployees] = useState<Opt[]>([]);
  const [types, setTypes] = useState<Opt[]>([]);

  const [occurredAt, setOccurredAt] = useState(today());
  const [number, setNumber] = useState('');
  const [incidentTypeId, setIncidentTypeId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [action, setAction] = useState<string>('verbal_warning');
  const [damageAmount, setDamageAmount] = useState('');
  const [sendNotification, setSendNotification] = useState(false);
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; size: number }[]>([]);

  const loadLookups = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ employees?: Opt[]; incidentTypes?: Opt[] }>(
        '/api/catalog/lookups',
      );
      setEmployees(d.employees || []);
      setTypes(d.incidentTypes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки справочников');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setOccurredAt(today());
    setNumber('');
    setIncidentTypeId('');
    setEmployeeId('');
    setManagerId('');
    setAction('verbal_warning');
    setDamageAmount('');
    setSendNotification(false);
    setNote('');
    setAttachments([]);
    void loadLookups();
  }, [open, loadLookups]);

  async function save(openAfter: boolean) {
    if (!occurredAt) {
      setError('Дата инцидента обязательна');
      return;
    }
    if (!incidentTypeId) {
      setError('Тип инцидента обязателен');
      return;
    }
    if (!employeeId) {
      setError('Физическое лицо обязательно');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/catalog/incidents', {
        method: 'POST',
        body: JSON.stringify({
          occurredAt,
          number: number.trim() || null,
          incidentTypeId,
          employeeId,
          managerId: managerId || null,
          action,
          damageAmount:
            action === 'fine' ? damageAmount || 0 : damageAmount || null,
          sendNotification,
          note,
          description: note,
          attachments,
          title: number.trim() || undefined,
        }),
      });
      onSaved(created?.id || '', openAfter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setAttachments((prev) => [
      ...prev,
      ...Array.from(files).map((f) => ({ name: f.name, size: f.size })),
    ]);
  }

  return (
    <FormModal
      open={open}
      title="Инцидент (создание)"
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
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Дата инцидента <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Номер инцидента</span>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="авто"
              />
            </label>
          </div>

          <label className={modal.field}>
            <span>
              Тип инцидента <em className={modal.req}>*</em>
            </span>
            <select
              value={incidentTypeId}
              onChange={(e) => setIncidentTypeId(e.target.value)}
            >
              <option value="">— выберите —</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className={modal.field}>
            <span>
              Физическое лицо <em className={modal.req}>*</em>
            </span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">— выберите —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>

          <label className={modal.field}>
            <span>Руководитель</span>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>

          <div className={modal.field}>
            <span>Действия</span>
            <div className={modal.radioRow}>
              {ACTION_OPTS.map((opt) => (
                <label key={opt.value} className={modal.radio}>
                  <input
                    type="radio"
                    name="incident-action"
                    checked={action === opt.value}
                    onChange={() => setAction(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {action === 'fine' ? (
            <label className={modal.field}>
              <span>Сумма ущерба</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={damageAmount}
                onChange={(e) => setDamageAmount(e.target.value)}
              />
            </label>
          ) : null}

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={sendNotification}
              onChange={(e) => setSendNotification(e.target.checked)}
            />
            Отправлять уведомление
          </label>

          <label className={modal.field}>
            <span>Примечание</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className={styles.fileZone}>
            <div className={styles.fileLabel}>Файлы</div>
            <label className={styles.drop}>
              <input
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              Перетащите файл сюда или кликните для выбора файла
            </label>
            {attachments.length === 0 ? (
              <div className={styles.fileEmpty}>Не выбраны</div>
            ) : (
              <ul className={styles.fileList}>
                {attachments.map((a, i) => (
                  <li key={`${a.name}-${i}`}>
                    <span>{a.name}</span>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() =>
                        setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </FormModal>
  );
}
