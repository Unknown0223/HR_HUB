'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { formPageTitle, type HrChangeKind } from './kinds';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type LineDraft = {
  key: string;
  employeeId: string;
  effectiveDate: string;
  staffPositionId: string;
  note: string;
};

type ChangeRow = {
  id: string;
  kind: HrChangeKind;
  status: string;
  number?: string | null;
  requestDate: string;
  title?: string | null;
  divisionId?: string | null;
  positionId?: string | null;
  staffPositionId?: string | null;
  employeeId?: string | null;
  effectiveDate?: string | null;
  quantity?: number | null;
  employmentType?: string | null;
  dismissalReasonId?: string | null;
  note?: string | null;
  candidateGender?: string | null;
  candidateFirstName?: string | null;
  candidateLastName?: string | null;
  candidateMiddleName?: string | null;
  lines?: Array<{
    employeeId: string;
    effectiveDate?: string | null;
    staffPositionId?: string | null;
    note?: string | null;
  }>;
};

const EMPLOYMENT_TYPES = [
  { value: 'staff', label: 'Штатный' },
  { value: 'gph', label: 'ГПХ' },
  { value: 'part_time', label: 'Совместительство' },
  { value: 'intern', label: 'Стажер' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId: '',
    effectiveDate: today(),
    staffPositionId: '',
    note: '',
  };
}

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className={styles.label}>
      {children}
      {required ? <span className={styles.req}>*</span> : null}
    </span>
  );
}

function FilesZone({ disabled }: { disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  return (
    <div>
      <div className={styles.filesLabel}>Файлы</div>
      <div
        className={styles.filesZone}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click();
        }}
      >
        Перетащите файл сюда или кликните для выбора файла
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          disabled={disabled}
          onChange={(e) => {
            const list = Array.from(e.target.files || []).map((f) => f.name);
            setNames(list);
          }}
        />
      </div>
      <div className={styles.filesMeta}>
        <span>📎</span>
        <span>{names.length ? names.join(', ') : 'Не выбраны'}</span>
      </div>
    </div>
  );
}

type FormProps = {
  mode: 'create' | 'edit';
  requestId?: string;
  kindDefault?: HrChangeKind;
};

function HrChangeRequestFormInner({ mode, requestId, kindDefault }: FormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kindFromQuery = (searchParams.get('kind') || kindDefault || 'open_position') as HrChangeKind;

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [docId, setDocId] = useState<string | null>(requestId ?? null);
  const [kind, setKind] = useState<HrChangeKind>(kindFromQuery);

  const [number, setNumber] = useState('');
  const [requestDate, setRequestDate] = useState(today());
  const [title, setTitle] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [staffPositionId, setStaffPositionId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [quantity, setQuantity] = useState('1');
  const [employmentType, setEmploymentType] = useState('');
  const [dismissalReasonId, setDismissalReasonId] = useState('');
  const [note, setNote] = useState('');
  const [candidateGender, setCandidateGender] = useState('male');
  const [candidateFirstName, setCandidateFirstName] = useState('');
  const [candidateLastName, setCandidateLastName] = useState('');
  const [candidateMiddleName, setCandidateMiddleName] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [lineSearch, setLineSearch] = useState('');

  const [employees, setEmployees] = useState<Opt[]>([]);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [staffPositions, setStaffPositions] = useState<Opt[]>([]);
  const [dismissalReasons, setDismissalReasons] = useState<Opt[]>([]);

  const readOnly = status === 'approved' || status === 'rejected' || status === 'cancelled';
  const pageTitle = formPageTitle(kind, mode === 'edit' ? 'edit' : 'create', status);

  useEffect(() => {
    apiFetch<{
      employees?: Opt[];
      divisions?: Opt[];
      positions?: Opt[];
      staffPositions?: Opt[];
      dismissalReasons?: Opt[];
    }>('/api/catalog/lookups')
      .then((d) => {
        setEmployees(d.employees || []);
        setDivisions(d.divisions || []);
        setPositions(d.positions || []);
        setStaffPositions(d.staffPositions || []);
        setDismissalReasons(d.dismissalReasons || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !requestId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const row = await apiFetch<ChangeRow>(`/api/hr/change-requests/${requestId}`);
        if (cancelled) return;
        setDocId(row.id);
        setKind(row.kind);
        setStatus(row.status);
        setNumber(row.number || '');
        setRequestDate(String(row.requestDate).slice(0, 10));
        setTitle(row.title || '');
        setDivisionId(row.divisionId || '');
        setPositionId(row.positionId || '');
        setStaffPositionId(row.staffPositionId || '');
        setEmployeeId(row.employeeId || '');
        setEffectiveDate(row.effectiveDate ? String(row.effectiveDate).slice(0, 10) : today());
        setQuantity(String(row.quantity ?? 1));
        setEmploymentType(row.employmentType || '');
        setDismissalReasonId(row.dismissalReasonId || '');
        setNote(row.note || '');
        setCandidateGender(row.candidateGender || 'male');
        setCandidateFirstName(row.candidateFirstName || '');
        setCandidateLastName(row.candidateLastName || '');
        setCandidateMiddleName(row.candidateMiddleName || '');
        setLines(
          (row.lines || []).map((l) => ({
            key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            employeeId: l.employeeId,
            effectiveDate: l.effectiveDate ? String(l.effectiveDate).slice(0, 10) : today(),
            staffPositionId: l.staffPositionId || '',
            note: l.note || '',
          })),
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
  }, [mode, requestId]);

  function buildBody() {
    return {
      kind,
      number: number || undefined,
      requestDate,
      title: title || undefined,
      divisionId: divisionId || undefined,
      positionId: positionId || undefined,
      staffPositionId: staffPositionId || undefined,
      employeeId: employeeId || undefined,
      effectiveDate: effectiveDate || undefined,
      quantity: quantity ? Number(quantity) : undefined,
      employmentType: employmentType || undefined,
      dismissalReasonId: dismissalReasonId || undefined,
      note: note || undefined,
      candidateGender: candidateGender || undefined,
      candidateFirstName: candidateFirstName || undefined,
      candidateLastName: candidateLastName || undefined,
      candidateMiddleName: candidateMiddleName || undefined,
      lines:
        kind === 'transfer_batch'
          ? lines
              .filter((l) => l.employeeId)
              .map((l) => ({
                employeeId: l.employeeId,
                effectiveDate: l.effectiveDate || undefined,
                staffPositionId: l.staffPositionId || undefined,
                note: l.note || undefined,
              }))
          : undefined,
    };
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const body = buildBody();
      if (docId) {
        const updated = await apiFetch<ChangeRow>(`/api/hr/change-requests/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setNumber(updated.number || number);
      } else {
        const created = await apiFetch<ChangeRow>('/api/hr/change-requests', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setDocId(created.id);
        setNumber(created.number || '');
        setStatus(created.status || 'draft');
        router.replace(`/catalog/hr-requests/${created.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function close() {
    router.push('/catalog/hr-requests');
  }

  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => {
      const emp = employees.find((e) => e.id === l.employeeId);
      return (emp?.label || '').toLowerCase().includes(q);
    });
  }, [lines, lineSearch, employees]);

  const metaRow = (
    <div className={styles.grid2}>
      <label className={styles.field}>
        <Label>Номер</Label>
        <input className={`${styles.input} ${styles.inputReadonly}`} value={number} disabled readOnly placeholder="" />
      </label>
      <label className={styles.field}>
        <Label>Дата заявки</Label>
        <input className={`${styles.input} ${styles.inputReadonly}`} type="date" value={requestDate} disabled readOnly />
      </label>
    </div>
  );

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{ title: pageTitle, siblings: [] }}
          titleOverride={pageTitle}
        />
        <p className={styles.muted}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: pageTitle, siblings: [] }} titleOverride={pageTitle} />

      <div className={styles.docHead}>
        <div className={styles.docActions}>
          {!readOnly ? (
            <button
              type="button"
              className={styles.primary}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          ) : null}
          <button type="button" className={styles.ghost} onClick={close}>
            Закрыть
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {readOnly ? (
        <p className={styles.banner}>Документ в статусе «{status}» — только просмотр</p>
      ) : null}

      <div className={styles.formCard}>
        {kind === 'transfer_batch' ? (
          <>
            <div className={styles.batchMeta}>
              <label className={styles.field}>
                <Label>Номер</Label>
                <input
                  className={`${styles.input} ${styles.inputReadonly}`}
                  value={number}
                  disabled
                  readOnly
                />
              </label>
              <label className={styles.field}>
                <Label>Дата заявки</Label>
                <input
                  className={`${styles.input} ${styles.inputReadonly}`}
                  type="date"
                  value={requestDate}
                  disabled
                  readOnly
                />
              </label>
            </div>
            <div className={styles.linesToolbar}>
              <div className={styles.linesLeft}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={readOnly}
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                >
                  Добавить
                </button>
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
                    <th>Перевод с</th>
                    <th>Сотрудник</th>
                    <th>Позиция</th>
                    <th>Примечание</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredLines.map((line) => (
                      <tr key={line.key}>
                        <td>
                          <input type="checkbox" disabled={readOnly} />
                        </td>
                        <td>
                          <input
                            type="date"
                            className={styles.empSelect}
                            value={line.effectiveDate}
                            disabled={readOnly}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, effectiveDate: e.target.value }
                                    : l,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <select
                            className={styles.empSelect}
                            value={line.employeeId}
                            disabled={readOnly}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, employeeId: e.target.value }
                                    : l,
                                ),
                              )
                            }
                          >
                            <option value="">Поиск...</option>
                            {employees.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className={styles.empSelect}
                            value={line.staffPositionId}
                            disabled={readOnly}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, staffPositionId: e.target.value }
                                    : l,
                                ),
                              )
                            }
                          >
                            <option value="">Поиск...</option>
                            {staffPositions.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className={styles.empSelect}
                            value={line.note}
                            disabled={readOnly}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key ? { ...l, note: e.target.value } : l,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          {!readOnly ? (
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={() =>
                                setLines((prev) => prev.filter((l) => l.key !== line.key))
                              }
                            >
                              Удалить
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {kind === 'open_position' ? (
          <>
            {metaRow}
            <label className={styles.field}>
              <Label required>Название</Label>
              <input
                className={styles.input}
                value={title}
                disabled={readOnly}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className={styles.grid2}>
              <label className={styles.field}>
                <Label required>Подразделение</Label>
                <select
                  className={styles.select}
                  value={divisionId}
                  disabled={readOnly}
                  onChange={(e) => setDivisionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <Label required>Должность</Label>
                <select
                  className={styles.select}
                  value={positionId}
                  disabled={readOnly}
                  onChange={(e) => setPositionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <Label required>Дата открытия</Label>
                <input
                  className={styles.input}
                  type="date"
                  value={effectiveDate}
                  disabled={readOnly}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <Label required>Кол-во</Label>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={quantity}
                  disabled={readOnly}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
            </div>
            <label className={styles.field}>
              <Label>Примечание</Label>
              <textarea
                className={styles.textarea}
                value={note}
                disabled={readOnly}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {kind === 'hire' ? (
          <>
            {metaRow}
            <div className={styles.grid2}>
              <label className={styles.field}>
                <Label required>Дата приема</Label>
                <input
                  className={styles.input}
                  type="date"
                  value={effectiveDate}
                  disabled={readOnly}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <Label required>Вид занятости</Label>
                <select
                  className={styles.select}
                  value={employmentType}
                  disabled={readOnly}
                  onChange={(e) => setEmploymentType(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <Label>Подразделение</Label>
                <select
                  className={styles.select}
                  value={divisionId}
                  disabled={readOnly}
                  onChange={(e) => setDivisionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <Label>Должность</Label>
                <select
                  className={styles.select}
                  value={positionId}
                  disabled={readOnly}
                  onChange={(e) => setPositionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <Label required>Позиция</Label>
              <select
                className={styles.select}
                value={staffPositionId}
                disabled={readOnly}
                onChange={(e) => setStaffPositionId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {staffPositions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <Label>Примечание</Label>
              <textarea
                className={styles.textarea}
                value={note}
                disabled={readOnly}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <FilesZone disabled={readOnly} />

            <h2 className={styles.sectionTitle}>Информация о кандидате</h2>
            <div className={styles.candidateRow}>
              <div className={styles.avatarBlock}>
                <div className={styles.avatar}>
                  <div className={styles.avatarSilhouette} />
                  <button type="button" className={styles.avatarEdit} disabled={readOnly} title="Фото">
                    ✎
                  </button>
                </div>
                <div className={styles.genderBlock}>
                  <div className={styles.genderLabel}>Пол</div>
                  <div className={styles.genderOpts}>
                    <label>
                      <input
                        type="radio"
                        name="gender"
                        checked={candidateGender === 'male'}
                        disabled={readOnly}
                        onChange={() => setCandidateGender('male')}
                      />
                      Мужской
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="gender"
                        checked={candidateGender === 'female'}
                        disabled={readOnly}
                        onChange={() => setCandidateGender('female')}
                      />
                      Женский
                    </label>
                  </div>
                </div>
              </div>
              <div className={styles.candidateFields}>
                <label className={styles.field}>
                  <Label required>Имя</Label>
                  <input
                    className={styles.input}
                    value={candidateFirstName}
                    disabled={readOnly}
                    onChange={(e) => setCandidateFirstName(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <Label required>Фамилия</Label>
                  <input
                    className={styles.input}
                    value={candidateLastName}
                    disabled={readOnly}
                    onChange={(e) => setCandidateLastName(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <Label>Отчество</Label>
                  <input
                    className={styles.input}
                    value={candidateMiddleName}
                    disabled={readOnly}
                    onChange={(e) => setCandidateMiddleName(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </>
        ) : null}

        {kind === 'transfer' ? (
          <>
            {metaRow}
            <div className={styles.grid2}>
              <label className={styles.field}>
                <Label required>Перевод с</Label>
                <input
                  className={styles.input}
                  type="date"
                  value={effectiveDate}
                  disabled={readOnly}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <Label required>Сотрудник</Label>
                <select
                  className={styles.select}
                  value={employeeId}
                  disabled={readOnly}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <Label>Вид занятости</Label>
                <select
                  className={styles.select}
                  value={employmentType}
                  disabled={readOnly}
                  onChange={(e) => setEmploymentType(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <div />
              <label className={styles.field}>
                <Label>Подразделение</Label>
                <select
                  className={styles.select}
                  value={divisionId}
                  disabled={readOnly}
                  onChange={(e) => setDivisionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <Label>Должность</Label>
                <select
                  className={styles.select}
                  value={positionId}
                  disabled={readOnly}
                  onChange={(e) => setPositionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <Label required>Позиция</Label>
              <select
                className={styles.select}
                value={staffPositionId}
                disabled={readOnly}
                onChange={(e) => setStaffPositionId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {staffPositions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <Label>Примечание</Label>
              <textarea
                className={styles.textarea}
                value={note}
                disabled={readOnly}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <FilesZone disabled={readOnly} />
          </>
        ) : null}

        {kind === 'dismiss' ? (
          <>
            {metaRow}
            <label className={styles.field}>
              <Label required>Сотрудник</Label>
              <select
                className={styles.select}
                value={employeeId}
                disabled={readOnly}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.grid2}>
              <label className={styles.field}>
                <Label required>Дата увольнения</Label>
                <input
                  className={styles.input}
                  type="date"
                  value={effectiveDate}
                  disabled={readOnly}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <Label>Причина увольнения</Label>
                <select
                  className={styles.select}
                  value={dismissalReasonId}
                  disabled={readOnly}
                  onChange={(e) => setDismissalReasonId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {dismissalReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <Label>Примечание</Label>
              <textarea
                className={styles.textarea}
                value={note}
                disabled={readOnly}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <FilesZone disabled={readOnly} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function HrChangeRequestForm(props: FormProps) {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <HrChangeRequestFormInner {...props} />
    </Suspense>
  );
}
