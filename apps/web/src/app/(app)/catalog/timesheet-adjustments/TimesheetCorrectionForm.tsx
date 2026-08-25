'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type EmpOpt = { id: string; label: string; divisionId?: string; tabNumber?: string; positionName?: string };
type DivOpt = { id: string; label: string };

type LineDraft = {
  key: string;
  employeeId: string;
  plannedHours: string;
  onTimeHours: string;
  outsideHours: string;
  workedHours: string;
  overtimeHours: string;
  beforeHours: string;
  afterHours: string;
};

type PolicyMeta = {
  filterByDepartments?: boolean;
  outsideLimit?: string;
  countLunch?: boolean;
  countBefore?: boolean;
  beforeLimit?: string;
  afterLimit?: string;
  countAfter?: boolean;
};

type CorrectionRow = {
  id: string;
  status: string;
  documentDate: string;
  number?: string | null;
  title: string;
  divisionId?: string | null;
  periodFrom: string;
  periodTo: string;
  meta?: PolicyMeta | null;
  lines?: Array<{
    employeeId: string;
    plannedHours?: number | string | null;
    onTimeHours?: number | string | null;
    outsideHours?: number | string | null;
    workedHours?: number | string | null;
    overtimeHours?: number | string | null;
    beforeHours?: number | string | null;
    afterHours?: number | string | null;
  }>;
};

function defaultPeriod() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    documentDate: now.toISOString().slice(0, 10),
    periodFrom: from.toISOString().slice(0, 10),
    periodTo: now.toISOString().slice(0, 10),
  };
}

function emptyLine(employeeId = ''): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    employeeId,
    plannedHours: '',
    onTimeHours: '',
    outsideHours: '',
    workedHours: '',
    overtimeHours: '',
    beforeHours: '',
    afterHours: '',
  };
}

function numOrUndef(v: string) {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function hourStr(v?: number | string | null) {
  if (v == null || v === '') return '';
  return String(v);
}

type FormProps = {
  mode: 'create' | 'edit';
  correctionId?: string;
  batchDefault?: boolean;
};

function TimesheetCorrectionFormInner({ mode, correctionId, batchDefault }: FormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batch = batchDefault ?? searchParams.get('batch') === '1';

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [docId, setDocId] = useState<string | null>(correctionId ?? null);

  const period0 = defaultPeriod();
  const [documentDate, setDocumentDate] = useState(period0.documentDate);
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('Корректировка табеля');
  const [divisionId, setDivisionId] = useState('');
  const [periodFrom, setPeriodFrom] = useState(period0.periodFrom);
  const [periodTo, setPeriodTo] = useState(period0.periodTo);
  const [policy, setPolicy] = useState<PolicyMeta>({
    filterByDepartments: true,
    outsideLimit: 'Без ограничений',
    countLunch: true,
    countBefore: true,
    beforeLimit: 'Без ограничений',
    countAfter: true,
    afterLimit: 'Без ограничений',
  });

  const [lines, setLines] = useState<LineDraft[]>(batch ? [] : [emptyLine()]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [visitTab, setVisitTab] = useState<'with' | 'without'>('with');
  const [planMenu, setPlanMenu] = useState(false);

  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<DivOpt[]>([]);
  const [filling, setFilling] = useState(false);

  const readOnly = status === 'posted' || status === 'cancelled';

  const pageTitle = useMemo(() => {
    if (mode === 'edit') {
      return batch ? 'Корректировка табеля списком (изменение)' : 'Корректировка табеля (изменение)';
    }
    return batch ? 'Корректировка табеля списком (создание)' : 'Корректировка табеля (создание)';
  }, [mode, batch]);

  const empMap = useMemo(() => {
    const m = new Map<string, EmpOpt>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => {
      const emp = empMap.get(l.employeeId);
      return (
        (emp?.label || '').toLowerCase().includes(q) ||
        l.employeeId.toLowerCase().includes(q)
      );
    });
  }, [lines, lineSearch, empMap]);

  const loadLookups = useCallback(async () => {
    try {
      const d = await apiFetch<{ employees?: EmpOpt[]; divisions?: DivOpt[] }>(
        '/api/catalog/lookups',
      );
      setEmployees(d.employees || []);
      setDivisions(d.divisions || []);
    } catch {
      setEmployees([]);
      setDivisions([]);
    }
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode !== 'edit' || !correctionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const row = await apiFetch<CorrectionRow>(
          `/api/catalog/timesheet-adjustments/${correctionId}`,
        );
        if (cancelled) return;
        setDocId(row.id);
        setStatus(row.status);
        setDocumentDate(String(row.documentDate).slice(0, 10));
        setNumber(row.number || '');
        setTitle(row.title || 'Корректировка табеля');
        setDivisionId(row.divisionId || '');
        setPeriodFrom(String(row.periodFrom).slice(0, 10));
        setPeriodTo(String(row.periodTo).slice(0, 10));
        const meta = (row.meta || {}) as PolicyMeta;
        setPolicy({
          filterByDepartments: Boolean(meta.filterByDepartments),
          outsideLimit: String(meta.outsideLimit || 'Без ограничений'),
          countLunch: Boolean(meta.countLunch),
          countBefore: Boolean(meta.countBefore),
          beforeLimit: String(meta.beforeLimit || 'Без ограничений'),
          countAfter: Boolean(meta.countAfter),
          afterLimit: String(meta.afterLimit || 'Без ограничений'),
        });
        const nextLines = (row.lines || []).map((l) => ({
          ...emptyLine(l.employeeId),
          plannedHours: hourStr(l.plannedHours),
          onTimeHours: hourStr(l.onTimeHours),
          outsideHours: hourStr(l.outsideHours),
          workedHours: hourStr(l.workedHours),
          overtimeHours: hourStr(l.overtimeHours),
          beforeHours: hourStr(l.beforeHours),
          afterHours: hourStr(l.afterHours),
        }));
        setLines(nextLines.length ? nextLines : [emptyLine()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, correctionId]);

  function buildBody() {
    const valid = lines.filter((l) => l.employeeId);
    if (valid.length === 0) {
      throw new Error('Добавьте хотя бы одного сотрудника');
    }
    return {
      documentDate,
      number: number || undefined,
      title: title || 'Корректировка табеля',
      divisionId: divisionId || undefined,
      periodFrom,
      periodTo,
      meta: {
        filterByDepartments: Boolean(policy.filterByDepartments),
        outsideLimit: policy.outsideLimit || 'Без ограничений',
        countLunch: Boolean(policy.countLunch),
        countBefore: Boolean(policy.countBefore),
        beforeLimit: policy.beforeLimit || 'Без ограничений',
        countAfter: Boolean(policy.countAfter),
        afterLimit: policy.afterLimit || 'Без ограничений',
      },
      lines: valid.map((l, idx) => ({
        employeeId: l.employeeId,
        sortOrder: idx,
        plannedHours: numOrUndef(l.plannedHours),
        onTimeHours: numOrUndef(l.onTimeHours),
        outsideHours: numOrUndef(l.outsideHours),
        workedHours: numOrUndef(l.workedHours),
        overtimeHours: numOrUndef(l.overtimeHours),
        beforeHours: numOrUndef(l.beforeHours),
        afterHours: numOrUndef(l.afterHours),
      })),
    };
  }

  async function save(andPost = false) {
    setSaving(true);
    setError('');
    try {
      const body = buildBody();
      let id = docId;

      if (id) {
        if (!readOnly) {
          await apiFetch(`/api/catalog/timesheet-adjustments/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
        }
      } else {
        const created = await apiFetch<CorrectionRow>('/api/catalog/timesheet-adjustments', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
        setDocId(id);
        setStatus(created.status || 'draft');
        router.replace(`/catalog/timesheet-adjustments/${id}`);
      }

      if (andPost && id) {
        setPosting(true);
        await apiFetch(`/api/catalog/timesheet-adjustments/${id}/post`, { method: 'POST' });
        setStatus('posted');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
      setPosting(false);
    }
  }

  async function onPost() {
    if (readOnly) return;
    await save(true);
  }

  function close() {
    router.push('/catalog/timesheet-adjustments');
  }

  function addLine(employeeId = '') {
    setLines((prev) => [...prev, emptyLine(employeeId)]);
  }

  function removeLines(keys: string[]) {
    setLines((prev) => prev.filter((l) => !keys.includes(l.key)));
    setSelectedKeys([]);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function fillFromDivision() {
    setFilling(true);
    setError('');
    try {
      const ids = lines.map((l) => l.employeeId).filter(Boolean);
      const data = await apiFetch<{
        lines: Array<{
          employeeId: string;
          plannedHours?: number;
          onTimeHours?: number;
          outsideHours?: number;
          workedHours?: number;
          overtimeHours?: number;
          beforeHours?: number;
          afterHours?: number;
        }>;
      }>('/api/catalog/timesheet-adjustments/fill-hours', {
        method: 'POST',
        body: JSON.stringify({
          employeeIds: ids.length ? ids : undefined,
          divisionId: divisionId || undefined,
          periodFrom,
          periodTo,
          meta: {
            filterByDepartments: policy.filterByDepartments,
            outsideLimit: policy.outsideLimit,
            countLunch: policy.countLunch,
            countBefore: policy.countBefore,
            beforeLimit: policy.beforeLimit,
            countAfter: policy.countAfter,
            afterLimit: policy.afterLimit,
          },
        }),
      });
      const next = (data.lines || []).map((l) => ({
        ...emptyLine(l.employeeId),
        plannedHours: hourStr(l.plannedHours),
        onTimeHours: hourStr(l.onTimeHours),
        outsideHours: hourStr(l.outsideHours),
        workedHours: hourStr(l.workedHours),
        overtimeHours: hourStr(l.overtimeHours),
        beforeHours: hourStr(l.beforeHours),
        afterHours: hourStr(l.afterHours),
      }));
      if (next.length === 0) throw new Error('Нет сотрудников для заполнения');
      setLines(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setFilling(false);
    }
  }

  function applyPick(ids: string[]) {
    if (ids.length === 0) {
      setPickOpen(false);
      return;
    }
    setLines((prev) => {
      const base = prev.filter((l) => l.employeeId);
      const have = new Set(base.map((l) => l.employeeId));
      const added = ids.filter((id) => !have.has(id)).map((id) => emptyLine(id));
      const next = [...base, ...added];
      return next.length ? next : [emptyLine()];
    });
    setPickOpen(false);
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="timesheet-adjustments" />
        <p className={styles.muted}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="timesheet-adjustments" />

      <div className={styles.docHead}>
        <h1 className={styles.docTitle}>{pageTitle}</h1>
        <div className={styles.docActions}>
          <button
            type="button"
            className={styles.primary}
            disabled={saving || posting || readOnly}
            onClick={() => void save(false)}
          >
            {saving && !posting ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={saving || posting || readOnly}
            onClick={() => void onPost()}
          >
            {posting ? 'Проведение…' : 'Провести'}
          </button>
          <button type="button" className={styles.ghost} onClick={close}>
            Закрыть
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {readOnly ? (
        <p className={styles.banner}>
          Документ {status === 'posted' ? 'проведён' : 'отменён'} — только просмотр
        </p>
      ) : null}

      <div className={styles.formCard}>
        <div className={styles.twoCol}>
          <div className={styles.col}>
            <label>
              Дата документа
              <input
                type="date"
                value={documentDate}
                disabled={readOnly}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </label>
            <label>
              Номер документа
              <input
                value={number}
                disabled={readOnly}
                placeholder=""
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
            <div className={styles.rowWithToggle}>
              <label className={styles.grow}>
                Подразделение
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
              <label className={styles.switchLabel}>
                <input
                  type="checkbox"
                  checked={Boolean(policy.filterByDepartments)}
                  disabled={readOnly}
                  onChange={(e) =>
                    setPolicy((p) => ({ ...p, filterByDepartments: e.target.checked }))
                  }
                />
                Фильтровать по Департаментам
              </label>
            </div>
            <label>
              Название документа
              <input
                value={title}
                disabled={readOnly}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              {batch ? 'Период корректировки с' : 'Дата корректировки'}
              <input
                type="date"
                value={periodFrom}
                disabled={readOnly}
                onChange={(e) => {
                  setPeriodFrom(e.target.value);
                  if (!batch) setPeriodTo(e.target.value);
                }}
              />
            </label>
            {batch ? (
              <label>
                по
                <input
                  type="date"
                  value={periodTo}
                  disabled={readOnly}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </label>
            ) : null}
          </div>

          {batch ? (
          <div className={styles.col}>
            <label>
              Мин. и макс. время вне графика
              <input
                value={policy.outsideLimit || ''}
                disabled={readOnly}
                onChange={(e) => setPolicy((p) => ({ ...p, outsideLimit: e.target.value }))}
              />
            </label>
            <label className={styles.switchLabel}>
              <span>Обеденное время</span>
              <span className={styles.switchRight}>
                Учитывать
                <input
                  type="checkbox"
                  checked={Boolean(policy.countLunch)}
                  disabled={readOnly}
                  onChange={(e) => setPolicy((p) => ({ ...p, countLunch: e.target.checked }))}
                />
              </span>
            </label>
            <div className={styles.rowWithToggle}>
              <label className={styles.switchLabel}>
                <span>До работы</span>
                <span className={styles.switchRight}>
                  Учитывать
                  <input
                    type="checkbox"
                    checked={Boolean(policy.countBefore)}
                    disabled={readOnly}
                    onChange={(e) => setPolicy((p) => ({ ...p, countBefore: e.target.checked }))}
                  />
                </span>
              </label>
              <label className={styles.grow}>
                Мин. и макс. время до графика
                <input
                  value={policy.beforeLimit || ''}
                  disabled={readOnly || !policy.countBefore}
                  onChange={(e) => setPolicy((p) => ({ ...p, beforeLimit: e.target.value }))}
                />
              </label>
            </div>
            <div className={styles.rowWithToggle}>
              <label className={styles.switchLabel}>
                <span>После работы</span>
                <span className={styles.switchRight}>
                  Учитывать
                  <input
                    type="checkbox"
                    checked={Boolean(policy.countAfter)}
                    disabled={readOnly}
                    onChange={(e) => setPolicy((p) => ({ ...p, countAfter: e.target.checked }))}
                  />
                </span>
              </label>
              <label className={styles.grow}>
                Мин. и макс. время после графика
                <input
                  value={policy.afterLimit || ''}
                  disabled={readOnly || !policy.countAfter}
                  onChange={(e) => setPolicy((p) => ({ ...p, afterLimit: e.target.value }))}
                />
              </label>
            </div>
          </div>
          ) : null}
        </div>
      </div>

      <div className={styles.linesCard}>
        {!batch ? (
          <div className={styles.lineTabs}>
            <button
              type="button"
              className={visitTab === 'with' ? styles.lineTabOn : styles.lineTab}
              onClick={() => setVisitTab('with')}
            >
              Сотрудники с посещениями
            </button>
            <button
              type="button"
              className={visitTab === 'without' ? styles.lineTabOn : styles.lineTab}
              onClick={() => setVisitTab('without')}
            >
              Сотрудники без посещения
            </button>
          </div>
        ) : null}
        <div className={styles.linesToolbar}>
          <div className={styles.linesLeft}>
            <button
              type="button"
              className={styles.secondary}
              disabled={readOnly}
              onClick={() => addLine()}
            >
              Добавить
            </button>
            <button
              type="button"
              className={styles.secondary}
              disabled={readOnly || filling}
              onClick={() => void fillFromDivision()}
            >
              {filling ? 'Заполнение…' : 'Заполнить'}
            </button>
            <button
              type="button"
              className={styles.teal}
              disabled={readOnly}
              onClick={() => setPickOpen(true)}
            >
              {batch ? 'Подбор' : 'Выбрать'}
            </button>
            {batch ? (
              <>
                <button type="button" className={styles.secondary} disabled={readOnly}>
                  Вне графика -&gt; Явка
                </button>
                <button type="button" className={styles.secondary} disabled={readOnly}>
                  Вне графика -&gt; Сверхурочно
                </button>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={readOnly}
                    onClick={() => setPlanMenu((v) => !v)}
                  >
                    Наполнение плана
                  </button>
                  {planMenu ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        zIndex: 20,
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        minWidth: 260,
                        boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                      }}
                    >
                      {['До графика', 'После графика', 'Сверхурочные с ежемесячным лимитом'].map(
                        (label) => (
                          <button
                            key={label}
                            type="button"
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              border: 'none',
                              background: 'transparent',
                              padding: '0.45rem 0.7rem',
                              cursor: 'pointer',
                            }}
                            onClick={() => setPlanMenu(false)}
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            {selectedKeys.length > 0 && !readOnly ? (
              <button
                type="button"
                className={styles.danger}
                onClick={() => removeLines(selectedKeys)}
              >
                Удалить ({selectedKeys.length})
              </button>
            ) : null}
          </div>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={lineSearch}
            onChange={(e) => setLineSearch(e.target.value)}
          />
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol} />
                <th>№</th>
                <th>Сотрудник</th>
                <th>Часы по плану</th>
                <th>Вовремя</th>
                <th>Вне графика</th>
                <th>Отработано</th>
                <th>Сверхурочно</th>
                <th>До графика</th>
                <th>После графика</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={11} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filteredLines.map((line, idx) => {
                  const checked = selectedKeys.includes(line.key);
                  return (
                    <tr key={line.key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly}
                          onChange={() =>
                            setSelectedKeys((prev) =>
                              checked ? prev.filter((k) => k !== line.key) : [...prev, line.key],
                            )
                          }
                        />
                      </td>
                      <td>{idx + 1}</td>
                      <td>
                        <select
                          className={styles.empSelect}
                          value={line.employeeId}
                          disabled={readOnly}
                          onChange={(e) => updateLine(line.key, { employeeId: e.target.value })}
                        >
                          <option value="">— выберите —</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(
                        [
                          'plannedHours',
                          'onTimeHours',
                          'outsideHours',
                          'workedHours',
                          'overtimeHours',
                          'beforeHours',
                          'afterHours',
                        ] as const
                      ).map((field) => (
                        <td key={field}>
                          <input
                            className={styles.hourInput}
                            inputMode="decimal"
                            value={line[field]}
                            disabled={readOnly}
                            onChange={(e) => updateLine(line.key, { [field]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td>
                        {!readOnly ? (
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => removeLines([line.key])}
                          >
                            Удалить
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pickOpen ? (
        <EmployeePickModal
          title="Подбор сотрудников"
          confirmText="Добавить"
          items={toPickItems(
            employees.filter((e) => !policy.filterByDepartments || !divisionId || e.divisionId === divisionId),
          )}
          onClose={() => setPickOpen(false)}
          onConfirm={applyPick}
        />
      ) : null}
    </div>
  );
}

export function TimesheetCorrectionForm(props: FormProps) {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TimesheetCorrectionFormInner {...props} />
    </Suspense>
  );
}
