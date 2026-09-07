'use client';

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type PayRow = { id: string; name: string; indicators: string };

type SchedItem = { id: string; scheduleId: string };

type Row = {
  id: string;
  code: string;
  divisionId?: string | null;
  positionId?: string | null;
  gradeId?: string | null;
  scheduleId?: string | null;
  tariffGroupId?: string | null;
  scheduleItems?: { scheduleId?: string }[] | null;
  accruals?: { name?: string; indicators?: string }[] | null;
  deductions?: { name?: string; indicators?: string }[] | null;
  isActive?: boolean;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function PositionTemplateFormModal({
  open,
  onClose,
  onSaved,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  editId?: string | null;
}) {
  const isEdit = Boolean(editId);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [extraSchedules, setExtraSchedules] = useState<SchedItem[]>([]);
  const [tariffGroupId, setTariffGroupId] = useState('');
  const [code, setCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [accruals, setAccruals] = useState<PayRow[]>([]);
  const [deductions, setDeductions] = useState<PayRow[]>([]);

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);
  const [tariffGroups, setTariffGroups] = useState<Opt[]>([]);

  const loadLookups = useCallback(async () => {
    try {
      const [lookups, tariffs] = await Promise.all([
        apiFetch<{
          divisions?: Opt[];
          positions?: Opt[];
          grades?: Opt[];
          schedules?: Opt[];
        }>('/api/catalog/lookups'),
        apiFetch<
          | { id: string; code: string; name: string }[]
          | { items?: { id: string; code: string; name: string }[] }
        >('/api/catalog/tariff-groups').catch(() => []),
      ]);
      setDivisions(lookups.divisions || []);
      setPositions(lookups.positions || []);
      setGrades(lookups.grades || []);
      setSchedules(lookups.schedules || []);
      const tList = Array.isArray(tariffs)
        ? tariffs
        : Array.isArray((tariffs as { items?: unknown[] }).items)
          ? ((tariffs as { items: { id: string; code: string; name: string }[] })
              .items)
          : [];
      setTariffGroups(
        tList.map((t) => ({
          id: t.id,
          label: t.code ? `${t.code} — ${t.name}` : t.name,
        })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadLookups();
  }, [open, loadLookups]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setDivisionId('');
      setPositionId('');
      setGradeId('');
      setScheduleId('');
      setExtraSchedules([]);
      setTariffGroupId('');
      setCode('');
      setIsActive(true);
      setAccruals([]);
      setDeductions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<Row>(`/api/catalog/position-templates/${editId}`)
      .then((row) => {
        setCode(row.code || '');
        setDivisionId(row.divisionId || '');
        setPositionId(row.positionId || '');
        setGradeId(row.gradeId || '');
        setScheduleId(row.scheduleId || '');
        setTariffGroupId(row.tariffGroupId || '');
        setIsActive(row.isActive !== false);
        const items = Array.isArray(row.scheduleItems) ? row.scheduleItems : [];
        setExtraSchedules(
          items
            .map((x) => String(x?.scheduleId || ''))
            .filter((id) => id && id !== (row.scheduleId || ''))
            .map((sid) => ({ id: uid(), scheduleId: sid })),
        );
        setAccruals(
          (Array.isArray(row.accruals) ? row.accruals : []).map((a) => ({
            id: uid(),
            name: String(a.name || ''),
            indicators: String(a.indicators || ''),
          })),
        );
        setDeductions(
          (Array.isArray(row.deductions) ? row.deductions : []).map((a) => ({
            id: uid(),
            name: String(a.name || ''),
            indicators: String(a.indicators || ''),
          })),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const scheduleItems = [
        ...(scheduleId ? [{ scheduleId }] : []),
        ...extraSchedules
          .filter((s) => s.scheduleId)
          .map((s) => ({ scheduleId: s.scheduleId })),
      ];
      const body = {
        code: code.trim() || `PT-${Date.now().toString(36).toUpperCase()}`,
        divisionId: divisionId || null,
        positionId: positionId || null,
        gradeId: gradeId || null,
        scheduleId: scheduleId || null,
        tariffGroupId: tariffGroupId || null,
        scheduleItems,
        accruals: accruals
          .filter((a) => a.name.trim())
          .map(({ name, indicators }) => ({
            name: name.trim(),
            indicators: indicators.trim(),
          })),
        deductions: deductions
          .filter((a) => a.name.trim())
          .map(({ name, indicators }) => ({
            name: name.trim(),
            indicators: indicators.trim(),
          })),
        isActive,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/position-templates/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<Row>('/api/catalog/position-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        onSaved(created?.id || '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function PayBlock({
    title,
    nameHeader,
    rows,
    setRows,
  }: {
    title: string;
    nameHeader: string;
    rows: PayRow[];
    setRows: Dispatch<SetStateAction<PayRow[]>>;
  }) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <div className={styles.sectionTools}>
            {title === 'Оплата труда' ? (
              <select
                value={tariffGroupId}
                onChange={(e) => setTariffGroupId(e.target.value)}
              >
                <option value="">Тарифная группа — поиск...</option>
                {tariffGroups.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className={styles.addBtn}
              onClick={() =>
                setRows((prev) => [...prev, { id: uid(), name: '', indicators: '' }])
              }
            >
              Добавить
            </button>
          </div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '3rem' }}>№</th>
              <th>{nameHeader}</th>
              <th>Показатели</th>
              <th style={{ width: '6rem' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  нет данных
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      value={r.name}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) =>
                            x.id === r.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={r.indicators}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) =>
                            x.id === r.id
                              ? { ...x, indicators: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.rowAction}
                      onClick={() =>
                        setRows((prev) => prev.filter((x) => x.id !== r.id))
                      }
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <FormModal
      open={open}
      title={isEdit ? 'Шаблон должности (изменение)' : 'Шаблон должности (создание)'}
      onClose={onClose}
      width="xl"
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
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={styles.card}>
          <div className={styles.grid2}>
            <div className={styles.col}>
              <div className={styles.field}>
                <label>Подразделение</label>
                <select
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Должность</label>
                <select
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Разряд</label>
                <select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
                  <option value="">Поиск...</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.col}>
              <div className={styles.field}>
                <label>График работы</label>
                <select
                  value={scheduleId}
                  onChange={(e) => setScheduleId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {extraSchedules.length > 0 ? (
                <div className={styles.schedList}>
                  {extraSchedules.map((item) => (
                    <div key={item.id} className={styles.schedRow}>
                      <select
                        value={item.scheduleId}
                        onChange={(e) =>
                          setExtraSchedules((prev) =>
                            prev.map((x) =>
                              x.id === item.id
                                ? { ...x, scheduleId: e.target.value }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">Поиск...</option>
                        {schedules.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setExtraSchedules((prev) =>
                            prev.filter((x) => x.id !== item.id),
                          )
                        }
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className={styles.addLink}
                onClick={() =>
                  setExtraSchedules((prev) => [
                    ...prev,
                    { id: uid(), scheduleId: '' },
                  ])
                }
              >
                + Добавить пункт
              </button>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Активный
              </label>
            </div>
          </div>

          <PayBlock
            title="Оплата труда"
            nameHeader="Начисление"
            rows={accruals}
            setRows={setAccruals}
          />
          <PayBlock
            title="Удержания"
            nameHeader="Удержания"
            rows={deductions}
            setRows={setDeductions}
          />
        </div>
      )}
    </FormModal>
  );
}
