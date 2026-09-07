'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems, type EmployeePickItem } from '@/components/employee-pick';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { KIND_LABELS, formPageTitle, type HrChangeKind } from './kinds';
import styles from './HrChangeRequestCreateModal.module.css';

type Opt = {
  id: string;
  label: string;
  tabNumber?: string | null;
  divisionId?: string | null;
  positionName?: string;
};

type CreatedRow = { id: string };

const EMPLOYMENT_TYPES = [
  { value: 'staff', label: 'Штатный' },
  { value: 'gph', label: 'ГПХ' },
  { value: 'part_time', label: 'Совместительство' },
  { value: 'intern', label: 'Стажер' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Minimal «создание» modal for HR change requests. Fields per kind mirror the
 * server-side validation of POST /api/hr/change-requests — the rest of the
 * document is filled in the full form afterwards.
 */
export function HrChangeRequestCreateModal({
  open,
  kind,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: HrChangeKind;
  onClose: () => void;
  /** openDoc = user asked to continue in the full form */
  onCreated: (id: string, openDoc: boolean) => void;
}) {
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [staffPositions, setStaffPositions] = useState<Opt[]>([]);
  const [dismissalReasons, setDismissalReasons] = useState<Opt[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [requestDate, setRequestDate] = useState(today);
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [staffPositionId, setStaffPositionId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [quantity, setQuantity] = useState('1');
  const [employmentType, setEmploymentType] = useState('');
  const [dismissalReasonId, setDismissalReasonId] = useState('');
  const [note, setNote] = useState('');
  const [candidateGender, setCandidateGender] = useState('male');
  const [candidateFirstName, setCandidateFirstName] = useState('');
  const [candidateLastName, setCandidateLastName] = useState('');
  const [candidateMiddleName, setCandidateMiddleName] = useState('');
  const [lineEmployeeIds, setLineEmployeeIds] = useState<string[]>([]);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError('');
    setRequestDate(today());
    setNumber('');
    setTitle('');
    setDivisionId('');
    setPositionId('');
    setStaffPositionId('');
    setEmployeeId('');
    setEffectiveDate(today());
    setQuantity('1');
    setEmploymentType('');
    setDismissalReasonId('');
    setNote('');
    setCandidateGender('male');
    setCandidateFirstName('');
    setCandidateLastName('');
    setCandidateMiddleName('');
    setLineEmployeeIds([]);
    setPickOpen(false);
  }, [open, kind]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const pickItems = useMemo<EmployeePickItem[]>(
    () => toPickItems(employees),
    [employees],
  );

  const selectedLines = useMemo(() => {
    const byId = new Map(employees.map((e) => [e.id, e] as const));
    return lineEmployeeIds.map((id) => ({ id, label: byId.get(id)?.label || id }));
  }, [lineEmployeeIds, employees]);

  function validate(): string {
    if (!requestDate) return 'Дата заявки обязательна';
    if (kind === 'open_position') {
      if (!title.trim()) return 'Название обязательно';
      if (!divisionId) return 'Подразделение обязательно';
      if (!positionId && !staffPositionId) return 'Должность или позиция обязательна';
      if (!effectiveDate) return 'Дата открытия обязательна';
      if (!quantity || Number(quantity) < 1) return 'Кол-во должно быть ≥ 1';
    }
    if (kind === 'hire') {
      if (!effectiveDate) return 'Дата приема обязательна';
      if (!employmentType) return 'Вид занятости обязателен';
      if (!staffPositionId) return 'Позиция обязательна';
      if (!candidateFirstName.trim() || !candidateLastName.trim()) {
        return 'Имя и фамилия кандидата обязательны';
      }
    }
    if (kind === 'transfer') {
      if (!employeeId) return 'Сотрудник обязателен';
      if (!effectiveDate) return 'Дата «Перевод с» обязательна';
      if (!staffPositionId) return 'Позиция обязательна';
    }
    if (kind === 'transfer_batch') {
      if (lineEmployeeIds.length === 0) return 'Добавьте хотя бы одного сотрудника';
      if (!effectiveDate) return 'Дата «Перевод с» обязательна';
    }
    if (kind === 'dismiss') {
      if (!employeeId) return 'Сотрудник обязателен';
      if (!effectiveDate) return 'Дата увольнения обязательна';
    }
    return '';
  }

  function buildBody() {
    return {
      kind,
      number: number.trim() || undefined,
      requestDate,
      title: title.trim() || undefined,
      divisionId: divisionId || undefined,
      positionId: positionId || undefined,
      staffPositionId: staffPositionId || undefined,
      employeeId: employeeId || undefined,
      effectiveDate: effectiveDate || undefined,
      quantity: kind === 'open_position' && quantity ? Number(quantity) : undefined,
      employmentType: employmentType || undefined,
      dismissalReasonId: dismissalReasonId || undefined,
      note: note.trim() || undefined,
      candidateGender: kind === 'hire' ? candidateGender : undefined,
      candidateFirstName: candidateFirstName.trim() || undefined,
      candidateLastName: candidateLastName.trim() || undefined,
      candidateMiddleName: candidateMiddleName.trim() || undefined,
      lines:
        kind === 'transfer_batch'
          ? lineEmployeeIds.map((id) => ({
              employeeId: id,
              effectiveDate: effectiveDate || undefined,
              staffPositionId: staffPositionId || undefined,
              note: note.trim() || undefined,
            }))
          : undefined,
    };
  }

  async function save(openDoc: boolean) {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<CreatedRow>('/api/hr/change-requests', {
        method: 'POST',
        body: JSON.stringify(buildBody()),
      });
      onCreated(created.id, openDoc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  const metaRow = (
    <>
      <label className={modal.field}>
        <span>Тип заявки</span>
        <div className={styles.readonlyValue}>{KIND_LABELS[kind]}</div>
      </label>
      <div className={modal.row2}>
        <label className={modal.field}>
          <span>
            Дата заявки <em className={modal.req}>*</em>
          </span>
          <input
            type="date"
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
          />
        </label>
        <label className={modal.field}>
          <span>Номер</span>
          <input
            value={number}
            placeholder="авто"
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
      </div>
    </>
  );

  const employeeSelect = (label: string) => (
    <label className={modal.field}>
      <span>
        {label} <em className={modal.req}>*</em>
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
  );

  const staffPositionSelect = (required: boolean) => (
    <label className={modal.field}>
      <span>
        Позиция {required ? <em className={modal.req}>*</em> : null}
      </span>
      <select
        value={staffPositionId}
        onChange={(e) => setStaffPositionId(e.target.value)}
      >
        <option value="">—</option>
        {staffPositions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );

  const noteField = (
    <label className={modal.field}>
      <span>Примечание</span>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} />
    </label>
  );

  return (
    <>
      <FormModal
        open={open}
        title={formPageTitle(kind, 'create')}
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
            <button
              type="button"
              className={modal.btnGhost}
              disabled={busy}
              onClick={onClose}
            >
              Закрыть
            </button>
          </>
        }
      >
        {error ? <p className={modal.error}>{error}</p> : null}
        <div className={modal.fields}>
          {metaRow}

          {kind === 'open_position' ? (
            <>
              <label className={modal.field}>
                <span>
                  Название <em className={modal.req}>*</em>
                </span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Подразделение <em className={modal.req}>*</em>
                  </span>
                  <select
                    value={divisionId}
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
                <label className={modal.field}>
                  <span>
                    Должность <em className={modal.req}>*</em>
                  </span>
                  <select
                    value={positionId}
                    onChange={(e) => setPositionId(e.target.value)}
                  >
                    <option value="">—</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Дата открытия <em className={modal.req}>*</em>
                  </span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>
                <label className={modal.field}>
                  <span>
                    Кол-во <em className={modal.req}>*</em>
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
              </div>
              {noteField}
            </>
          ) : null}

          {kind === 'hire' ? (
            <>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Дата приема <em className={modal.req}>*</em>
                  </span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>
                <label className={modal.field}>
                  <span>
                    Вид занятости <em className={modal.req}>*</em>
                  </span>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                  >
                    <option value="">—</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {staffPositionSelect(true)}
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Фамилия кандидата <em className={modal.req}>*</em>
                  </span>
                  <input
                    value={candidateLastName}
                    onChange={(e) => setCandidateLastName(e.target.value)}
                  />
                </label>
                <label className={modal.field}>
                  <span>
                    Имя кандидата <em className={modal.req}>*</em>
                  </span>
                  <input
                    value={candidateFirstName}
                    onChange={(e) => setCandidateFirstName(e.target.value)}
                  />
                </label>
              </div>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>Отчество кандидата</span>
                  <input
                    value={candidateMiddleName}
                    onChange={(e) => setCandidateMiddleName(e.target.value)}
                  />
                </label>
                <div className={modal.field}>
                  <span>Пол</span>
                  <div className={modal.radioRow}>
                    <label className={modal.radio}>
                      <input
                        type="radio"
                        name="candidateGender"
                        checked={candidateGender === 'male'}
                        onChange={() => setCandidateGender('male')}
                      />
                      Мужской
                    </label>
                    <label className={modal.radio}>
                      <input
                        type="radio"
                        name="candidateGender"
                        checked={candidateGender === 'female'}
                        onChange={() => setCandidateGender('female')}
                      />
                      Женский
                    </label>
                  </div>
                </div>
              </div>
              {noteField}
            </>
          ) : null}

          {kind === 'transfer' ? (
            <>
              {employeeSelect('Сотрудник')}
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Перевод с <em className={modal.req}>*</em>
                  </span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>
                <label className={modal.field}>
                  <span>Вид занятости</span>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                  >
                    <option value="">—</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {staffPositionSelect(true)}
              {noteField}
            </>
          ) : null}

          {kind === 'transfer_batch' ? (
            <>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Перевод с <em className={modal.req}>*</em>
                  </span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>
                {staffPositionSelect(false)}
              </div>
              <div className={modal.field}>
                <span>
                  Сотрудники <em className={modal.req}>*</em>
                </span>
                <div className={styles.pickRow}>
                  <button
                    type="button"
                    className={modal.btnGhost}
                    onClick={() => setPickOpen(true)}
                  >
                    Подбор сотрудников
                  </button>
                  <span className={styles.pickMeta}>
                    Выбрано: {lineEmployeeIds.length}
                  </span>
                  {lineEmployeeIds.length > 0 ? (
                    <button
                      type="button"
                      className={styles.clearBtn}
                      onClick={() => setLineEmployeeIds([])}
                    >
                      Очистить
                    </button>
                  ) : null}
                </div>
                {selectedLines.length > 0 ? (
                  <ul className={styles.chips}>
                    {selectedLines.map((e) => (
                      <li key={e.id} className={styles.chip}>
                        {e.label}
                        <button
                          type="button"
                          aria-label={`Убрать ${e.label}`}
                          onClick={() =>
                            setLineEmployeeIds((prev) =>
                              prev.filter((id) => id !== e.id),
                            )
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.hint}>
                    Позиции и даты по строкам можно уточнить в документе после создания.
                  </p>
                )}
              </div>
              {noteField}
            </>
          ) : null}

          {kind === 'dismiss' ? (
            <>
              {employeeSelect('Сотрудник')}
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Дата увольнения <em className={modal.req}>*</em>
                  </span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>
                <label className={modal.field}>
                  <span>Причина увольнения</span>
                  <select
                    value={dismissalReasonId}
                    onChange={(e) => setDismissalReasonId(e.target.value)}
                  >
                    <option value="">—</option>
                    {dismissalReasons.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {noteField}
            </>
          ) : null}
        </div>
      </FormModal>

      {pickOpen ? (
        <EmployeePickModal
          title="Подбор сотрудников"
          confirmText="Добавить"
          items={pickItems}
          initialSelectedIds={lineEmployeeIds}
          onClose={() => setPickOpen(false)}
          onConfirm={(ids) => {
            setLineEmployeeIds(ids);
            setPickOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
