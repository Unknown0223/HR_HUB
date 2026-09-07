'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type EmpOpt = { id: string; label: string };
type TplOpt = { id: string; name: string; code?: string };

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function ClearanceSheetForm({
  embedded,
  onSuccess,
  onCancel,
}: {
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [templates, setTemplates] = useState<TplOpt[]>([]);

  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [number, setNumber] = useState('');
  const [documentDate, setDocumentDate] = useState(todayInput());
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lookups, tpls] = await Promise.all([
          apiFetch<{ employees?: EmpOpt[] }>('/api/catalog/lookups'),
          apiFetch<TplOpt[]>('/api/catalog/clearance-templates'),
        ]);
        if (cancelled) return;
        setEmployees(lookups.employees || []);
        setTemplates(Array.isArray(tpls) ? tpls : []);
      } catch {
        if (!cancelled) {
          setEmployees([]);
          setTemplates([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    if (!templateId) {
      setError('Выберите шаблон');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/catalog/clearance-sheets', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          templateId,
          number: number.trim() || undefined,
          documentDate: documentDate || undefined,
          title: title.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form
      onSubmit={onSave}
      className={embedded ? styles.formEmbedded : styles.form}
    >
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Закрыть
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.card}>
        <label>
          Сотрудник <span className={styles.req}>*</span>
          <select
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Выберите…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Шаблон <span className={styles.req}>*</span>
          <select
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Выберите…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.code ? ` (${t.code})` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.grid2}>
          <label>
            Номер
            <input value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label>
            Дата
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>
        </div>
        <label>
          Название
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="По умолчанию — название шаблона"
          />
        </label>
        <label>
          Примечание
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </form>
  );

  return form;
}
