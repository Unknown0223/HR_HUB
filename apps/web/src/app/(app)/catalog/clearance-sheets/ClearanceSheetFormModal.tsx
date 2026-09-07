'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './ClearanceSheetFormModal.module.css';

type EmpOpt = { id: string; label: string };
type TemplateOpt = { id: string; name: string; code?: string; isActive?: boolean };

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ClearanceSheetFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);

  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [documentDate, setDocumentDate] = useState(today());
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('Обходной лист');
  const [note, setNote] = useState('');

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [lookups, tpl] = await Promise.all([
        apiFetch<{ employees?: EmpOpt[] }>('/api/catalog/lookups'),
        apiFetch<TemplateOpt[] | { items?: TemplateOpt[] }>(
          '/api/catalog/clearance-templates',
        ),
      ]);
      setEmployees(lookups.employees || []);
      setTemplates(Array.isArray(tpl) ? tpl : tpl.items || []);
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
    setEmployeeId('');
    setTemplateId('');
    setDocumentDate(today());
    setNumber('');
    setTitle('Обходной лист');
    setNote('');
    void loadOptions();
  }, [open, loadOptions]);

  async function save() {
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    if (!templateId) {
      setError('Выберите шаблон');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/catalog/clearance-sheets', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          templateId,
          documentDate: documentDate || undefined,
          number: number.trim() || undefined,
          title: title.trim() || 'Обходной лист',
          note: note.trim() || undefined,
        }),
      });
      onSaved(created?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Обходной лист (создание)"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Сохранить'}
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
                Дата документа <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Номер</span>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="авто"
              />
            </label>
          </div>

          <label className={modal.field}>
            <span>
              Сотрудник <em className={modal.req}>*</em>
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
            <span>
              Шаблон <em className={modal.req}>*</em>
            </span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— выберите —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className={modal.field}>
            <span>Заголовок</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className={modal.field}>
            <span>Примечание</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      )}
    </FormModal>
  );
}
