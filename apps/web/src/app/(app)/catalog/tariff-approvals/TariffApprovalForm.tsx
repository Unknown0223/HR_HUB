'use client';

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type Line = {
  id: string;
  gradeId: string;
  gradeName: string;
  coefficient: string;
  salary: string;
  note: string;
};

type Approval = {
  id: string;
  tariffGroupId: string;
  documentDate?: string | null;
  documentNumber?: string | null;
  effectiveAt?: string | null;
  baseRate?: string | number | null;
  linkedToBase?: boolean;
  indicators?: unknown;
  lines?: {
    gradeId?: string;
    gradeName?: string;
    coefficient?: string | number;
    salary?: string | number;
    note?: string;
  }[];
  note?: string | null;
  status: string;
  tariffGroup?: { id: string; name: string; baseRate?: string | number } | null;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function toInputDate(iso?: string | null) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function emptyLine(): Line {
  return {
    id: uid(),
    gradeId: '',
    gradeName: '',
    coefficient: '',
    salary: '',
    note: '',
  };
}

export function TariffApprovalForm({
  mode,
  approvalId,
}: {
  mode: 'create' | 'edit' | 'view';
  approvalId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceEdit = searchParams.get('edit') === '1';
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);
  const [status, setStatus] = useState('draft');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [lineQ, setLineQ] = useState('');

  const [documentDate, setDocumentDate] = useState(todayInput());
  const [documentNumber, setDocumentNumber] = useState('');
  const [tariffGroupId, setTariffGroupId] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [note, setNote] = useState('');
  const [linkedToBase, setLinkedToBase] = useState(true);
  const [indicatorsText, setIndicatorsText] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const [groups, setGroups] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);

  const readOnly =
    (mode === 'view' && !forceEdit) || status === 'approved' || status === 'rejected';

  const pageTitle =
    mode === 'create'
      ? 'Утверждение тарифной группы (создание)'
      : readOnly
        ? 'Утверждение тарифной группы (просмотр)'
        : 'Утверждение тарифной группы (изменение)';

  const loadLookups = useCallback(async () => {
    try {
      const lookups = await apiFetch<{
        tariffGroups?: Opt[];
        grades?: Opt[];
      }>('/api/catalog/lookups');
      setGroups(lookups.tariffGroups || []);
      setGrades(lookups.grades || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode === 'create' || !approvalId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<Approval>(
          `/api/catalog/tariff-approvals/${approvalId}`,
        );
        if (cancelled) return;
        setStatus(row.status || 'draft');
        setDocumentDate(toInputDate(row.documentDate) || todayInput());
        setDocumentNumber(row.documentNumber || '');
        setTariffGroupId(row.tariffGroupId || '');
        setEffectiveAt(toInputDate(row.effectiveAt));
        setNote(row.note || '');
        setLinkedToBase(row.linkedToBase !== false);
        setBaseRate(row.baseRate != null ? String(row.baseRate) : '');
        setIndicatorsText(
          row.indicators != null
            ? typeof row.indicators === 'string'
              ? row.indicators
              : JSON.stringify(row.indicators, null, 2)
            : '',
        );
        const rawLines = Array.isArray(row.lines) ? row.lines : [];
        setLines(
          rawLines.length
            ? rawLines.map((l) => ({
                id: uid(),
                gradeId: String(l.gradeId || ''),
                gradeName: String(l.gradeName || ''),
                coefficient: l.coefficient != null ? String(l.coefficient) : '',
                salary: l.salary != null ? String(l.salary) : '',
                note: String(l.note || ''),
              }))
            : [emptyLine()],
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
  }, [mode, approvalId]);

  useEffect(() => {
    if (!tariffGroupId || baseRate) return;
    const g = groups.find((x) => x.id === tariffGroupId);
    if (!g) return;
    void (async () => {
      try {
        const row = await apiFetch<{ baseRate?: string | number }>(
          `/api/catalog/tariff-groups/${tariffGroupId}`,
        );
        if (row.baseRate != null) setBaseRate(String(row.baseRate));
      } catch {
        /* ignore */
      }
    })();
  }, [tariffGroupId, groups, baseRate]);

  const filteredLines = useMemo(() => {
    const q = lineQ.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) =>
      [l.gradeName, l.coefficient, l.salary, l.note].join(' ').toLowerCase().includes(q),
    );
  }, [lines, lineQ]);

  function buildBody() {
    let indicators: unknown = null;
    if (indicatorsText.trim()) {
      try {
        indicators = JSON.parse(indicatorsText);
      } catch {
        indicators = indicatorsText.trim();
      }
    }
    return {
      tariffGroupId,
      documentDate: documentDate || null,
      documentNumber: documentNumber.trim() || null,
      effectiveAt: effectiveAt || null,
      baseRate: baseRate ? Number(baseRate) : null,
      linkedToBase,
      indicators,
      note: note.trim() || null,
      status: status === 'approved' ? 'approved' : 'draft',
      lines: lines
        .filter((l) => l.gradeId || l.salary.trim())
        .map((l) => ({
          gradeId: l.gradeId || null,
          gradeName:
            l.gradeName || grades.find((g) => g.id === l.gradeId)?.label || '',
          coefficient: l.coefficient ? Number(l.coefficient) : null,
          salary: l.salary ? Number(l.salary) : null,
          note: l.note.trim() || null,
        })),
    };
  }

  async function save(andPost: boolean) {
    setTouched(true);
    if (!documentDate || !tariffGroupId || !effectiveAt) {
      setError('Заполните обязательные поля');
      return;
    }
    const badLine = lines.find(
      (l) => (l.gradeId || l.salary) && (!l.gradeId || !l.salary.trim()),
    );
    if (badLine) {
      setError('В строках заполните Разряд и Оклад');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = buildBody();
      let id = approvalId;
      if (mode === 'create' || !id) {
        const created = await apiFetch<{ id: string }>('/api/catalog/tariff-approvals', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/catalog/tariff-approvals/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      if (andPost && id) {
        await apiFetch(`/api/catalog/tariff-approvals/${id}/post`, { method: 'POST' });
      }
      router.push('/catalog/tariff-approvals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    void save(false);
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="tariff-approvals" titleOverride={pageTitle} />
        <p>Загрузка…</p>
      </div>
    );
  }

  const dateInvalid = touched && !documentDate;
  const groupInvalid = touched && !tariffGroupId;
  const effectiveInvalid = touched && !effectiveAt;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="tariff-approvals" titleOverride={pageTitle} />

      <form onSubmit={onSave} className={styles.form}>
        <div className={styles.actions}>
          {!readOnly ? (
            <>
              <button type="submit" className={styles.primary} disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className={styles.teal}
                disabled={saving}
                onClick={() => void save(true)}
              >
                Провести
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.push('/catalog/tariff-approvals')}
          >
            Закрыть
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.card}>
          <div className={styles.grid}>
            <label>
              Дата <span className={styles.req}>*</span>
              <input
                type="date"
                disabled={readOnly}
                className={dateInvalid ? styles.invalid : undefined}
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </label>
            <label>
              Номер
              <input
                disabled={readOnly}
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </label>
            <label className={styles.spanNote}>
              Примечание
              <textarea
                disabled={readOnly}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className={styles.indicatorsBtn}
                onClick={() => setShowIndicators((v) => !v)}
              >
                Показатели {showIndicators ? '▾' : '>'}
              </button>
            </label>

            <label>
              Тарифная группа <span className={styles.req}>*</span>
              <select
                disabled={readOnly}
                className={groupInvalid ? styles.invalid : undefined}
                value={tariffGroupId}
                onChange={(e) => {
                  setTariffGroupId(e.target.value);
                  setBaseRate('');
                }}
              >
                <option value="">Поиск...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Вступает в силу с <span className={styles.req}>*</span>
              <input
                type="date"
                disabled={readOnly}
                className={effectiveInvalid ? styles.invalid : undefined}
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
              />
            </label>

            <label className={styles.check}>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={linkedToBase}
                onChange={(e) => setLinkedToBase(e.target.checked)}
              />
              Размеры тарифов уст. в привязке к базовому тарифу
            </label>
          </div>

          {showIndicators ? (
            <label className={styles.full}>
              Показатели
              <textarea
                disabled={readOnly}
                rows={4}
                placeholder="Текст или JSON"
                value={indicatorsText}
                onChange={(e) => setIndicatorsText(e.target.value)}
              />
            </label>
          ) : null}
        </div>

        <div className={styles.card}>
          <div className={styles.linesToolbar}>
            <button
              type="button"
              className={styles.addBtn}
              disabled={readOnly}
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              Добавить
            </button>
            <input
              className={styles.search}
              placeholder="Поиск..."
              value={lineQ}
              onChange={(e) => setLineQ(e.target.value)}
            />
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th />
                  <th>№</th>
                  <th>Разряд</th>
                  <th>Коэффициент</th>
                  <th>Оклад</th>
                  <th>Примечание</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.length ? (
                  filteredLines.map((line, idx) => {
                    const open = selectedLineId === line.id;
                    const gradeInvalid =
                      touched && Boolean(line.salary.trim()) && !line.gradeId;
                    const salaryInvalid =
                      touched && Boolean(line.gradeId) && !line.salary.trim();
                    return (
                      <Fragment key={line.id}>
                        <tr
                          className={open ? styles.rowSelected : undefined}
                          onClick={() =>
                            setSelectedLineId(open ? null : line.id)
                          }
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={open}
                              onChange={() =>
                                setSelectedLineId(open ? null : line.id)
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <select
                              disabled={readOnly}
                              className={gradeInvalid ? styles.invalid : undefined}
                              value={line.gradeId}
                              onChange={(e) => {
                                const gradeId = e.target.value;
                                const g = grades.find((x) => x.id === gradeId);
                                setLines((prev) =>
                                  prev.map((x) =>
                                    x.id === line.id
                                      ? {
                                          ...x,
                                          gradeId,
                                          gradeName: g?.label || '',
                                        }
                                      : x,
                                  ),
                                );
                              }}
                            >
                              <option value="">Поиск...</option>
                              {grades.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              disabled
                              className={styles.readonly}
                              value={line.coefficient}
                              placeholder="—"
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              disabled={readOnly}
                              className={salaryInvalid ? styles.invalid : undefined}
                              value={line.salary}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((x) =>
                                    x.id === line.id
                                      ? { ...x, salary: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              disabled={readOnly}
                              value={line.note}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((x) =>
                                    x.id === line.id
                                      ? { ...x, note: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </td>
                        </tr>
                        {open && !readOnly ? (
                          <tr>
                            <td colSpan={6}>
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLines((prev) =>
                                      prev.filter((x) => x.id !== line.id),
                                    );
                                    setSelectedLineId(null);
                                  }}
                                >
                                  Удалить строку
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className={styles.emptyCell}>
                      нет данных
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </div>
  );
}
