'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

type EmpOpt = { id: string; label: string; positionId?: string; positionName?: string; tabNumber?: string };
type SchedOpt = { id: string; label: string };

type LineDraft = {
  key: string;
  employeeId: string;
  days: Record<string, string>;
  daysCount: number;
  hoursTotal: number;
};

function monthIso(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

function emptyLine(employeeId = ''): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    employeeId,
    days: {},
    daysCount: 0,
    hoursTotal: 0,
  };
}

function parseHours(v: string): number | null {
  if (!v || v === 'В' || v === 'R' || v === 'D') return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const m = v.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (end < start) end += 24 * 60;
    return (end - start) / 60;
  }
  return null;
}

function recompute(days: Record<string, string>) {
  let daysCount = 0;
  let hoursTotal = 0;
  for (const v of Object.values(days)) {
    const h = parseHours(v);
    if (h == null) {
      if (v && v !== 'В' && v !== 'R') daysCount += 1;
      continue;
    }
    daysCount += 1;
    hoursTotal += h;
  }
  return { daysCount, hoursTotal: Math.round(hoursTotal * 100) / 100 };
}

export function RosterForm({
  mode,
  rosterId,
}: {
  mode: 'create' | 'edit';
  rosterId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [docId, setDocId] = useState<string | null>(rosterId ?? null);

  const now = new Date();
  const [name, setName] = useState('');
  const [documentDate, setDocumentDate] = useState(now.toISOString().slice(0, 10));
  const [number, setNumber] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [scheduleId, setScheduleId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [schedules, setSchedules] = useState<SchedOpt[]>([]);
  const [confirmPost, setConfirmPost] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  const readOnly = status === 'posted' || status === 'cancelled';
  const daysInMonth = useMemo(
    () => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(),
    [year, monthIndex],
  );
  const dayCols = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const wd = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
        const weekend = wd === 0 || wd === 6;
        return { day, wdLabel: WEEKDAYS[wd], weekend };
      }),
    [daysInMonth, year, monthIndex],
  );
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => {
      const emp = empMap.get(l.employeeId);
      return (
        (emp?.label || '').toLowerCase().includes(q) ||
        (emp?.positionName || '').toLowerCase().includes(q)
      );
    });
  }, [lines, lineSearch, empMap]);

  const loadLookups = useCallback(async () => {
    try {
      const d = await apiFetch<{
        employees?: EmpOpt[];
        schedules?: SchedOpt[];
      }>('/api/catalog/lookups');
      setEmployees(d.employees || []);
      setSchedules(d.schedules || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode !== 'edit' || !rosterId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<{
          id: string;
          status: string;
          name: string;
          documentDate: string;
          number?: string | null;
          month: string;
          scheduleId: string;
          note?: string | null;
          lines?: Array<{
            employeeId: string;
            days?: Record<string, string>;
            daysCount?: number;
            hoursTotal?: number | string;
          }>;
        }>(`/api/catalog/rosters/${rosterId}`);
        if (cancelled) return;
        setDocId(row.id);
        setStatus(row.status);
        setName(row.name);
        setDocumentDate(String(row.documentDate).slice(0, 10));
        setNumber(row.number || '');
        const m = new Date(row.month);
        setYear(m.getUTCFullYear());
        setMonthIndex(m.getUTCMonth());
        setScheduleId(row.scheduleId);
        setNote(row.note || '');
        setLines(
          (row.lines || []).map((l) => {
            const days = (l.days || {}) as Record<string, string>;
            const t = recompute(days);
            return {
              ...emptyLine(l.employeeId),
              days,
              daysCount: l.daysCount ?? t.daysCount,
              hoursTotal: Number(l.hoursTotal ?? t.hoursTotal),
            };
          }),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, rosterId]);

  function setCell(key: string, day: number, value: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const days = { ...l.days, [String(day)]: value };
        const t = recompute(days);
        return { ...l, days, daysCount: t.daysCount, hoursTotal: t.hoursTotal };
      }),
    );
  }

  function buildBody() {
    if (!name.trim()) throw new Error('Название — обязательное поле');
    if (!scheduleId) throw new Error('График работы — обязательное поле');
    return {
      name: name.trim(),
      documentDate,
      number: number || undefined,
      month: monthIso(year, monthIndex),
      scheduleId,
      note: note || undefined,
      lines: lines
        .filter((l) => l.employeeId)
        .map((l, idx) => ({
          employeeId: l.employeeId,
          sortOrder: idx,
          days: l.days,
          daysCount: l.daysCount,
          hoursTotal: l.hoursTotal,
        })),
    };
  }

  async function save(andPost = false) {
    setError('');
    setSaving(true);
    try {
      const body = buildBody();
      if (andPost && !(body.lines as unknown[]).length) {
        throw new Error('Добавьте хотя бы одного сотрудника');
      }
      let id = docId;
      if (id) {
        await apiFetch(`/api/catalog/rosters/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<{ id: string }>('/api/catalog/rosters', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
        setDocId(id);
      }
      if (andPost && id) {
        await apiFetch(`/api/catalog/rosters/${id}/post`, { method: 'POST' });
        setStatus('posted');
        router.push('/catalog/rosters');
        return;
      }
      if (mode === 'create' && id) router.replace(`/catalog/rosters/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
      setConfirmPost(false);
    }
  }

  async function fillFromSchedule() {
    if (!scheduleId) {
      setError('Сначала выберите график работы');
      return;
    }
    setFilling(true);
    setError('');
    try {
      const ids = lines.filter((l) => l.employeeId).map((l) => l.employeeId);
      const res = await apiFetch<{
        lines: Array<{
          employeeId: string;
          days: Record<string, string>;
          daysCount: number;
          hoursTotal: number;
        }>;
      }>('/api/catalog/rosters/fill', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId,
          month: monthIso(year, monthIndex),
          employeeIds: ids.length ? ids : undefined,
        }),
      });
      if (ids.length) {
        const byId = new Map((res.lines || []).map((l) => [l.employeeId, l]));
        setLines((prev) =>
          prev.map((l) => {
            const f = byId.get(l.employeeId);
            if (!f) return l;
            return {
              ...l,
              days: f.days || {},
              daysCount: f.daysCount || 0,
              hoursTotal: f.hoursTotal || 0,
            };
          }),
        );
      } else {
        setLines(
          (res.lines || []).map((l) => ({
            ...emptyLine(l.employeeId),
            days: l.days || {},
            daysCount: l.daysCount || 0,
            hoursTotal: l.hoursTotal || 0,
          })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setFilling(false);
    }
  }

  function confirmPick(ids: string[]) {
    const existing = new Set(lines.map((l) => l.employeeId));
    setLines((prev) => [
      ...prev,
      ...ids.filter((id) => !existing.has(id)).map((id) => emptyLine(id)),
    ]);
    setPickOpen(false);
  }

  if (loading) {
    return <p className={styles.muted} style={{ padding: '1rem' }}>Загрузка…</p>;
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="rosters" />
      <div className={styles.docHead}>
        <h1 className={styles.docTitle}>
          Расписание ({mode === 'edit' ? 'изменение' : 'создание'})
        </h1>
        <div className={styles.docActions}>
          <button
            type="button"
            className={styles.primary}
            disabled={saving || readOnly}
            onClick={() => void save(false)}
          >
            Сохранить
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={saving || readOnly}
            onClick={() => setConfirmPost(true)}
          >
            Провести
          </button>
          <Link href="/catalog/rosters" className={styles.secondary}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {readOnly ? (
        <p className={styles.banner}>
          Документ {status === 'posted' ? 'проведён' : 'отменён'} — только просмотр
        </p>
      ) : null}

      <div className={styles.formCard}>
        <div className={styles.col}>
          <label>
            Название *
            <input value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <label>
              Дата *
              <input
                type="date"
                value={documentDate}
                disabled={readOnly}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </label>
            <label>
              Номер
              <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
            </label>
            <label>
              Месяц *
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
          </div>
          <label>
            График работы *
            <select
              value={scheduleId}
              disabled={readOnly}
              onChange={(e) => setScheduleId(e.target.value)}
            >
              <option value="">Поиск…</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Примечание
            <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
        </div>
      </div>

      <div className={styles.linesCard}>
        <div className={styles.linesToolbar}>
          <div className={styles.lineActions}>
            <button
              type="button"
              className={styles.lineBtn}
              disabled={readOnly}
              onClick={() => setPickOpen(true)}
            >
              Добавить
            </button>
            <button
              type="button"
              className={styles.lineBtn}
              disabled={readOnly || filling}
              onClick={() => void fillFromSchedule()}
            >
              {filling ? '…' : 'Заполнить из графика'}
            </button>
          </div>
          <input
            className={styles.lineSearch}
            placeholder="Поиск..."
            value={lineSearch}
            onChange={(e) => setLineSearch(e.target.value)}
          />
        </div>

        <div className={styles.gridWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={styles.stickyLeft}>№</th>
                <th className={`${styles.stickyLeft} ${styles.emp}`}>Сотрудник</th>
                <th className={`${styles.stickyLeft} ${styles.pos}`}>Должность</th>
                <th className={`${styles.stickyLeft} ${styles.stat}`}>Дней</th>
                <th className={`${styles.stickyLeft} ${styles.stat}`}>Часов</th>
                {dayCols.map((c) => (
                  <th key={c.day} className={c.weekend ? styles.weekend : undefined}>
                    <div className={styles.dayHead}>
                      {c.day}
                      <span>{c.wdLabel}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!filteredLines.length ? (
                <tr>
                  <td colSpan={5 + dayCols.length} className={styles.empty}>
                    Нет сотрудников — «Добавить» или «Заполнить из графика»
                  </td>
                </tr>
              ) : null}
              {filteredLines.map((line, idx) => {
                const emp = empMap.get(line.employeeId);
                return (
                  <tr key={line.key}>
                    <td className={styles.stickyLeft}>{idx + 1}</td>
                    <td className={`${styles.stickyLeft} ${styles.emp}`}>
                      {emp?.label || line.employeeId.slice(0, 8)}
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.pos}`}>
                      {emp?.positionName || '—'}
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.stat}`}>{line.daysCount}</td>
                    <td className={`${styles.stickyLeft} ${styles.stat}`}>{line.hoursTotal}</td>
                    {dayCols.map((c) => {
                      const val = line.days[String(c.day)] ?? '';
                      const work = parseHours(val) != null;
                      return (
                        <td key={c.day} className={work ? styles.work : styles.off}>
                          <input
                            value={val}
                            disabled={readOnly}
                            onChange={(e) => setCell(line.key, c.day, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirmPost ? (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <p className={styles.modalTitle}>Сохранить и провести документ?</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.primary} onClick={() => void save(true)}>
                Да
              </button>
              <button type="button" className={styles.secondary} onClick={() => setConfirmPost(false)}>
                Нет
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pickOpen ? (
        <EmployeePickModal
          title="Добавить сотрудников"
          confirmText="Добавить"
          items={toPickItems(employees)}
          onClose={() => setPickOpen(false)}
          onConfirm={confirmPick}
        />
      ) : null}
    </div>
  );
}
