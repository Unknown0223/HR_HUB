'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type IncidentRow = {
  id: string;
  number?: string | null;
  title: string;
  occurredAt: string;
  action: string;
  damageAmount?: string | number | null;
  note?: string | null;
  description?: string | null;
  sendNotification?: boolean;
  employeeId?: string | null;
  managerId?: string | null;
  incidentTypeId: string;
  attachments?: { name: string; size?: number }[] | null;
  employee?: Opt & { firstName?: string; lastName?: string; middleName?: string; tabNumber?: string };
  incidentType?: { id: string; name: string } | null;
};

const ACTION_OPTS = [
  { value: 'verbal_warning', label: 'Устное предупреждение' },
  { value: 'written_warning', label: 'Письменное предупреждение' },
  { value: 'fine', label: 'Штраф' },
] as const;

const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  ACTION_OPTS.map((a) => [a.value, a.label]),
);

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function money(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU');
}

export function IncidentForm({
  mode,
  incidentId,
  embedded,
  onSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  incidentId?: string;
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [occurredAt, setOccurredAt] = useState(todayInput());
  const [number, setNumber] = useState('');
  const [incidentTypeId, setIncidentTypeId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [action, setAction] = useState('verbal_warning');
  const [damageAmount, setDamageAmount] = useState('');
  const [sendNotification, setSendNotification] = useState(false);
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; size: number }[]>([]);
  const [related, setRelated] = useState<IncidentRow[]>([]);
  const [relatedQ, setRelatedQ] = useState('');

  const [employees, setEmployees] = useState<Opt[]>([]);
  const [types, setTypes] = useState<Opt[]>([]);

  const pageTitle = mode === 'edit' ? 'Инцидент (изменение)' : 'Инцидент (создание)';

  function goBack() {
    if (onCancel) onCancel();
    else router.push('/catalog/incidents');
  }

  const loadLookups = useCallback(async () => {
    try {
      const d = await apiFetch<{ employees?: Opt[]; incidentTypes?: Opt[] }>(
        '/api/catalog/lookups',
      );
      setEmployees(d.employees || []);
      setTypes(d.incidentTypes || []);
    } catch {
      setEmployees([]);
      setTypes([]);
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode !== 'edit' || !incidentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<IncidentRow>(`/api/catalog/incidents/${incidentId}`);
        if (cancelled) return;
        setOccurredAt(String(row.occurredAt).slice(0, 10));
        setNumber(row.number || '');
        setIncidentTypeId(row.incidentTypeId);
        setEmployeeId(row.employeeId || '');
        setManagerId(row.managerId || '');
        setAction(row.action || 'verbal_warning');
        setDamageAmount(row.damageAmount != null ? String(row.damageAmount) : '');
        setSendNotification(Boolean(row.sendNotification));
        setNote(row.note || row.description || '');
        setAttachments(
          Array.isArray(row.attachments)
            ? row.attachments.map((a) => ({ name: a.name, size: a.size || 0 }))
            : [],
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, incidentId]);

  useEffect(() => {
    if (!employeeId) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    apiFetch<IncidentRow[]>('/api/catalog/incidents')
      .then((all) => {
        if (cancelled) return;
        setRelated(
          (Array.isArray(all) ? all : []).filter(
            (r) => r.employeeId === employeeId && r.id !== incidentId,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, incidentId]);

  const relatedFiltered = useMemo(() => {
    const qq = relatedQ.trim().toLowerCase();
    if (!qq) return related;
    return related.filter((r) => {
      const blob = [r.number, r.title, r.incidentType?.name, ACTION_LABEL[r.action]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [related, relatedQ]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
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
    setSaving(true);
    setError('');
    try {
      const body = {
        occurredAt,
        number: number || null,
        incidentTypeId,
        employeeId,
        managerId: managerId || null,
        action,
        damageAmount: action === 'fine' ? damageAmount || 0 : damageAmount || null,
        sendNotification,
        note,
        description: note,
        attachments,
        title: number || undefined,
      };
      if (mode === 'edit' && incidentId) {
        await apiFetch(`/api/catalog/incidents/${incidentId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/incidents', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      if (onSuccess) onSuccess();
      else router.push('/catalog/incidents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = [...attachments];
    for (const f of Array.from(files)) {
      next.push({ name: f.name, size: f.size });
    }
    setAttachments(next);
  }

  if (loading) {
    if (embedded) return <p>Загрузка…</p>;
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="incidents" />
        <p>Загрузка…</p>
      </div>
    );
  }

  const form = (
      <form onSubmit={onSave}>
        <div className={styles.docHead}>
          {!embedded ? <h2 className={styles.docTitle}>{pageTitle}</h2> : null}
          <div className={styles.docActions}>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button type="button" className={styles.secondary} onClick={goBack}>
              Закрыть
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.split}>
          <div className={styles.card}>
            <div className={styles.grid2}>
              <label>
                Дата инцидента *
                <input
                  type="date"
                  required
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </label>
              <label>
                Номер инцидента
                <input value={number} onChange={(e) => setNumber(e.target.value)} />
              </label>
            </div>

            <label className={styles.full}>
              Тип инцидента *
              <select
                required
                value={incidentTypeId}
                onChange={(e) => setIncidentTypeId(e.target.value)}
              >
                <option value="">Поиск</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.full}>
              Физическое лицо *
              <select
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Поиск</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.full}>
              Руководитель
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">Поиск</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className={styles.radioGroup}>
              <legend>Действия</legend>
              {ACTION_OPTS.map((opt) => (
                <label key={opt.value} className={styles.check}>
                  <input
                    type="radio"
                    name="action"
                    checked={action === opt.value}
                    onChange={() => setAction(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            {action === 'fine' ? (
              <label className={styles.full}>
                Сумма ущерба
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

            <label className={styles.full}>
              Примечание
              <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
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

          <div className={styles.sideCard}>
            <div className={styles.linesHead}>
              <input
                className={styles.lineSearch}
                placeholder="Поиск..."
                value={relatedQ}
                onChange={(e) => setRelatedQ(e.target.value)}
              />
              <span className={styles.pagerMeta}>
                {relatedFiltered.length} / {related.length}
              </span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Номер инцидента</th>
                    <th>Дата инцидента</th>
                    <th>Тип инцидента</th>
                    <th>Сумма инцидента</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {relatedFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    relatedFiltered.map((r) => (
                      <tr key={r.id}>
                        <td>{r.number || r.title}</td>
                        <td>{fmtDate(r.occurredAt)}</td>
                        <td>{r.incidentType?.name || '—'}</td>
                        <td>{money(r.damageAmount)}</td>
                        <td>{ACTION_LABEL[r.action] || r.action}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </form>
  );

  if (embedded) return form;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="incidents" titleOverride={pageTitle} />
      {form}
    </div>
  );
}
