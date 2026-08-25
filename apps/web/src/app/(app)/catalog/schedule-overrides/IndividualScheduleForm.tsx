'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiDownload, apiFetch } from '@/lib/api';
import type { ScheduleKind } from './page';
import styles from './form.module.css';

const KIND_TITLE: Record<ScheduleKind, string> = {
  ordinary: 'Обычный график работы',
  hourly: 'Почасовой график работы',
  advanced: 'Продвинутый график работы',
  multi_shift: 'Многосменный график',
  advanced_multi_shift: 'Продвинутый многосменный график',
};

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const INTERVALS = [
  { value: 'first_in_first_out', label: 'Первый приход и первый уход' },
  { value: 'first_in_last_out', label: 'Первый приход и последний уход' },
  { value: 'last_in_last_out', label: 'Последний приход и последний уход' },
];

type EmpOpt = {
  id: string;
  label: string;
  divisionId?: string;
  positionId?: string;
  positionName?: string;
  tabNumber?: string;
};
type DivOpt = { id: string; label: string };

type Settings = {
  autoProdCalendar?: boolean;
  useTemplate?: boolean;
  trackMarks?: boolean;
  byLocation?: boolean;
  advancedLateEarly?: boolean;
  intervalType?: string;
  displayMode?: 'hours' | 'time_range';
  weekPattern?: '5/2' | '6/1' | '5/1';
  dayNorm?: number;
  startTime?: string;
  endTime?: string;
  maxWorkdayHours?: number;
  maxWorkdayMinutes?: number;
  dayShiftTime?: string;
  arrivalBeforeHours?: number;
  arrivalBeforeMinutes?: number;
  leaveAfterHours?: number;
  leaveAfterMinutes?: number;
  delayMode?: 'allowed' | 'strict';
  arriveGraceMinutes?: number;
  leaveGraceMinutes?: number;
  includeHolidays?: boolean;
  includeNonWorking?: boolean;
  includeExtraOff?: boolean;
  shifts?: Array<{
    code: string;
    startTime: string;
    endTime: string;
    breakYn: 'Y' | 'N';
    breakStart?: string;
    breakEnd?: string;
    appearance?: string;
  }>;
};

type LineDraft = {
  key: string;
  employeeId: string;
  days: Record<string, string>;
  daysCount: number;
  hoursTotal: number;
};

type DocRow = {
  id: string;
  status: string;
  kind: ScheduleKind | string;
  documentDate: string;
  number?: string | null;
  month: string;
  divisionId?: string | null;
  note?: string | null;
  verified?: boolean;
  settings?: Settings | null;
  normDays?: number | string | null;
  normHours?: number | string | null;
  lines?: Array<{
    employeeId: string;
    days?: Record<string, string> | null;
    daysCount?: number | null;
    hoursTotal?: number | string | null;
  }>;
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
  if (!v || v === 'В' || v === 'R' || v === 'Вх' || v === 'П') return null;
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

function recomputeTotals(days: Record<string, string>) {
  let daysCount = 0;
  let hoursTotal = 0;
  for (const v of Object.values(days)) {
    const h = parseHours(v);
    if (h == null) continue;
    daysCount += 1;
    hoursTotal += h;
  }
  return { daysCount, hoursTotal: Math.round(hoursTotal * 100) / 100 };
}

function isWeekend(year: number, monthIndex: number, day: number, pattern: string) {
  const wd = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
  if (pattern === '6/1') return wd === 0;
  return wd === 0 || wd === 6;
}

export function IndividualScheduleForm({
  mode,
  documentId,
  initialKind = 'ordinary',
}: {
  mode: 'create' | 'edit';
  documentId?: string;
  initialKind?: ScheduleKind;
}) {
  const router = useRouter();
  const [kind] = useState<ScheduleKind>(initialKind);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [docId, setDocId] = useState<string | null>(documentId ?? null);

  const now = new Date();
  const [documentDate, setDocumentDate] = useState(now.toISOString().slice(0, 10));
  const [number, setNumber] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [divisionId, setDivisionId] = useState('');
  const [note, setNote] = useState('');
  const [settings, setSettings] = useState<Settings>({
    autoProdCalendar: false,
    useTemplate: false,
    trackMarks: false,
    byLocation: false,
    advancedLateEarly: false,
    intervalType: 'first_in_first_out',
    displayMode: 'hours',
    weekPattern: '5/2',
    dayNorm: 8,
    startTime: '09:00',
    endTime: '18:00',
    maxWorkdayHours: 24,
    maxWorkdayMinutes: 0,
    dayShiftTime: '00:00',
    arrivalBeforeHours: 0,
    arrivalBeforeMinutes: 0,
    leaveAfterHours: 0,
    leaveAfterMinutes: 0,
    delayMode: 'allowed',
    arriveGraceMinutes: 0,
    leaveGraceMinutes: 0,
    includeHolidays: true,
    includeNonWorking: true,
    includeExtraOff: true,
  });
  const [normDays, setNormDays] = useState('0');
  const [normHours, setNormHours] = useState('0');

  const [lines, setLines] = useState<LineDraft[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lineSearch, setLineSearch] = useState('');

  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<DivOpt[]>([]);

  const [confirmPost, setConfirmPost] = useState(false);
  const [normOpen, setNormOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const readOnly = status === 'posted' || status === 'cancelled';
  const showShifts = kind === 'multi_shift' || kind === 'advanced_multi_shift' || kind === 'advanced';
  const showAdvanced =
    kind === 'advanced' || kind === 'multi_shift' || kind === 'advanced_multi_shift';

  const pageTitle = useMemo(() => {
    const base = KIND_TITLE[kind] || 'Индивидуальный график';
    return mode === 'edit' ? `${base} (изменение)` : `${base} (создание)`;
  }, [kind, mode]);

  const daysInMonth = useMemo(
    () => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(),
    [year, monthIndex],
  );

  const dayCols = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const wd = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
      const weekend = isWeekend(year, monthIndex, day, settings.weekPattern || '5/2');
      return { day, wdLabel: WEEKDAYS[wd], weekend };
    });
  }, [daysInMonth, year, monthIndex, settings.weekPattern]);

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
        (emp?.positionName || '').toLowerCase().includes(q)
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
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode !== 'edit' || !documentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const row = await apiFetch<DocRow>(`/api/catalog/schedule-overrides/${documentId}`);
        if (cancelled) return;
        setDocId(row.id);
        setStatus(row.status);
        setDocumentDate(String(row.documentDate).slice(0, 10));
        setNumber(row.number || '');
        const m = new Date(row.month);
        setYear(m.getUTCFullYear());
        setMonthIndex(m.getUTCMonth());
        setDivisionId(row.divisionId || '');
        setNote(row.note || '');
        setNormDays(String(row.normDays ?? '0'));
        setNormHours(String(row.normHours ?? '0'));
        const s = (row.settings || {}) as Settings;
        setSettings((prev) => ({ ...prev, ...s }));
        const next = (row.lines || []).map((l) => {
          const days = (l.days || {}) as Record<string, string>;
          const t = recomputeTotals(days);
          return {
            ...emptyLine(l.employeeId),
            days,
            daysCount: l.daysCount ?? t.daysCount,
            hoursTotal: Number(l.hoursTotal ?? t.hoursTotal),
          };
        });
        setLines(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, documentId]);

  function patchSettings(patch: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...patch }));
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.days) {
          const t = recomputeTotals(next.days);
          next.daysCount = t.daysCount;
          next.hoursTotal = t.hoursTotal;
        }
        return next;
      }),
    );
  }

  function setCell(key: string, day: number, value: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const days = { ...l.days, [String(day)]: value };
        const t = recomputeTotals(days);
        return { ...l, days, daysCount: t.daysCount, hoursTotal: t.hoursTotal };
      }),
    );
  }

  function buildBody() {
    return {
      kind,
      documentDate,
      number: number || undefined,
      month: monthIso(year, monthIndex),
      divisionId: divisionId || undefined,
      note: note || undefined,
      settings,
      normDays: Number(normDays) || 0,
      normHours: Number(normHours) || 0,
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
    const valid = lines.filter((l) => l.employeeId);
    if (andPost && valid.length === 0) {
      setError('Добавьте хотя бы одного сотрудника');
      return;
    }
    setSaving(true);
    try {
      const body = buildBody();
      let id = docId;
      if (id) {
        await apiFetch(`/api/catalog/schedule-overrides/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<{ id: string }>('/api/catalog/schedule-overrides', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
        setDocId(id);
      }
      if (andPost && id) {
        setPosting(true);
        await apiFetch(`/api/catalog/schedule-overrides/${id}/post`, { method: 'POST' });
        setStatus('posted');
        router.push('/catalog/schedule-overrides');
        return;
      }
      if (mode === 'create' && id) {
        router.replace(`/catalog/schedule-overrides/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
      setPosting(false);
      setConfirmPost(false);
    }
  }

  async function fillSelected() {
    const ids =
      selectedKeys.length > 0
        ? lines.filter((l) => selectedKeys.includes(l.key) && l.employeeId).map((l) => l.employeeId)
        : lines.filter((l) => l.employeeId).map((l) => l.employeeId);
    if (ids.length === 0 && !divisionId) {
      setError('Добавьте сотрудников или выберите подразделение');
      return;
    }
    setFilling(true);
    setError('');
    try {
      const res = await apiFetch<{
        lines: Array<{
          employeeId: string;
          days: Record<string, string>;
          daysCount: number;
          hoursTotal: number;
        }>;
        normDays?: number;
        normHours?: number;
      }>('/api/catalog/schedule-overrides/fill', {
        method: 'POST',
        body: JSON.stringify({
          month: monthIso(year, monthIndex),
          employeeIds: ids.length ? ids : undefined,
          divisionId: !ids.length && divisionId ? divisionId : undefined,
          dayNorm: settings.dayNorm ?? 8,
          weekPattern: settings.weekPattern || '5/2',
          kind,
          displayMode: settings.displayMode || 'hours',
          startTime: settings.startTime || '09:00',
          endTime: settings.endTime || '18:00',
        }),
      });

      if (ids.length === 0) {
        setLines(
          (res.lines || []).map((l) => ({
            ...emptyLine(l.employeeId),
            days: l.days || {},
            daysCount: l.daysCount || 0,
            hoursTotal: l.hoursTotal || 0,
          })),
        );
      } else {
        const byEmp = new Map((res.lines || []).map((l) => [l.employeeId, l]));
        setLines((prev) =>
          prev.map((l) => {
            const filled = byEmp.get(l.employeeId);
            if (!filled) return l;
            return {
              ...l,
              days: filled.days || {},
              daysCount: filled.daysCount || 0,
              hoursTotal: filled.hoursTotal || 0,
            };
          }),
        );
      }
      if (res.normDays != null) setNormDays(String(res.normDays));
      if (res.normHours != null) setNormHours(String(res.normHours));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setFilling(false);
    }
  }

  async function downloadTemplate() {
    setTplBusy(true);
    setError('');
    try {
      const q = new URLSearchParams({ month: monthIso(year, monthIndex) });
      if (docId) q.set('documentId', docId);
      if (divisionId) q.set('divisionId', divisionId);
      await apiDownload(
        `/api/catalog/schedule-overrides/template.xlsx?${q}`,
        `individ-schedule-${year}-${monthIndex + 1}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка шаблона');
    } finally {
      setTplBusy(false);
    }
  }

  async function onUploadTemplate(file: File) {
    setTplBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (docId) fd.append('documentId', docId);
      const res = await apiFetch<{
        lines?: Array<{
          employeeId: string;
          days: Record<string, string>;
          daysCount: number;
          hoursTotal: number;
        }>;
        imported: number;
        unmatched?: string[];
        shifts?: unknown[];
      }>('/api/catalog/schedule-overrides/import', {
        method: 'POST',
        body: fd,
      });
      if (res.lines) {
        setLines(
          res.lines.map((l) => ({
            ...emptyLine(l.employeeId),
            days: l.days || {},
            daysCount: l.daysCount || 0,
            hoursTotal: l.hoursTotal || 0,
          })),
        );
      }
      setSettings((s) => ({
        ...s,
        useTemplate: true,
        ...(res.shifts ? { shifts: res.shifts as Settings['shifts'] } : {}),
      }));
      if (res.unmatched?.length) {
        setError(
          `Импорт: ${res.imported}; не найдено: ${res.unmatched.slice(0, 3).join(', ')}`,
        );
      } else {
        setError('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setTplBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function applyNorms() {
    const nd = Number(normDays) || 0;
    const nh = Number(normHours) || 0;
    const dayNorm = nd > 0 ? Math.round((nh / nd) * 100) / 100 || settings.dayNorm || 8 : settings.dayNorm || 8;
    patchSettings({ dayNorm });
    setNormOpen(false);
    void fillSelected();
  }

  function confirmPick(ids: string[]) {
    const existing = new Set(lines.map((l) => l.employeeId));
    const add = ids.filter((id) => !existing.has(id));
    setLines((prev) => [
      ...prev,
      ...add.map((id) => emptyLine(id)),
    ]);
    setPickOpen(false);
  }

  if (loading) {
    return <p className={styles.muted} style={{ padding: '1rem' }}>Загрузка…</p>;
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="schedule-overrides" />

      <div className={styles.docHead}>
        <h1 className={styles.docTitle}>{pageTitle}</h1>
        <div className={styles.docActions}>
          <button
            type="button"
            className={styles.primary}
            disabled={saving || posting || readOnly}
            onClick={() => void save(false)}
          >
            {saving ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={saving || posting || readOnly}
            onClick={() => setConfirmPost(true)}
          >
            {posting ? '…' : 'Провести'}
          </button>
          <Link href="/catalog/schedule-overrides" className={styles.secondary}>
            Закрыть
          </Link>
          {showShifts ? (
            <Link href="/catalog/schedule-shifts" className={styles.shiftsTab}>
              Смены
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {readOnly ? (
        <p className={styles.banner}>
          Документ {status === 'posted' ? 'проведён' : 'отменён'} — только просмотр
        </p>
      ) : null}

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <div className={styles.col}>
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
              <input
                value={number}
                disabled={readOnly}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Авто / вручную"
              />
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
            <label>
              Подразделение
              <select
                value={divisionId}
                disabled={readOnly}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <option value="">Поиск…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Примечание
              <textarea
                value={note}
                disabled={readOnly}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </label>
          </div>

          <div className={styles.settingBlock}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={Boolean(settings.autoProdCalendar)}
                disabled={readOnly}
                onChange={(e) => patchSettings({ autoProdCalendar: e.target.checked })}
              />
              Автоматическое обновление по производственному календарю
            </label>

            <label>
              Тип расчета интервала *
              <select
                value={settings.intervalType || 'first_in_first_out'}
                disabled={readOnly}
                onChange={(e) => patchSettings({ intervalType: e.target.value })}
              >
                {INTERVALS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className={styles.muted}>Способ отображения графика дня</span>
              <div className={styles.radios}>
                <label>
                  <input
                    type="radio"
                    checked={(settings.displayMode || 'hours') === 'hours'}
                    disabled={readOnly}
                    onChange={() => patchSettings({ displayMode: 'hours' })}
                  />
                  Часы
                </label>
                <label>
                  <input
                    type="radio"
                    checked={settings.displayMode === 'time_range'}
                    disabled={readOnly}
                    onChange={() => patchSettings({ displayMode: 'time_range' })}
                  />
                  Время начала и конца
                </label>
              </div>
            </div>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={Boolean(settings.useTemplate)}
                disabled={readOnly}
                onChange={(e) => patchSettings({ useTemplate: e.target.checked })}
              />
              Использовать шаблон для заполнения графика
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className={styles.lineBtn}
                disabled={tplBusy}
                onClick={() => void downloadTemplate()}
              >
                {tplBusy ? '…' : 'Шаблон'}
              </button>
              <button
                type="button"
                className={styles.lineBtn}
                disabled={readOnly || tplBusy}
                onClick={() => fileRef.current?.click()}
              >
                Загрузить
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUploadTemplate(f);
                }}
              />
              <span className={styles.muted}>Excel Verifix (data + metadata)</span>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={Boolean(settings.trackMarks)}
                disabled={readOnly}
                onChange={(e) => patchSettings({ trackMarks: e.target.checked })}
              />
              Фиксировать отметки
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={Boolean(settings.byLocation)}
                disabled={readOnly}
                onChange={(e) => patchSettings({ byLocation: e.target.checked })}
              />
              Считать факты по локациям
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={Boolean(settings.advancedLateEarly)}
                disabled={readOnly}
                onChange={(e) => patchSettings({ advancedLateEarly: e.target.checked })}
              />
              Расширенные настройки позднего прихода и раннего ухода
            </label>

            {showAdvanced ? (
              <>
                <label>
                  Макс. продолжительность рабочего дня
                  <div className={styles.inlineNums}>
                    <input
                      type="number"
                      min={0}
                      value={settings.maxWorkdayHours ?? 24}
                      disabled={readOnly}
                      onChange={(e) =>
                        patchSettings({ maxWorkdayHours: Number(e.target.value) || 0 })
                      }
                    />
                    <span className={styles.muted}>ч</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={settings.maxWorkdayMinutes ?? 0}
                      disabled={readOnly}
                      onChange={(e) =>
                        patchSettings({ maxWorkdayMinutes: Number(e.target.value) || 0 })
                      }
                    />
                    <span className={styles.muted}>мин</span>
                  </div>
                </label>
                {kind === 'advanced' || kind === 'advanced_multi_shift' ? (
                  <label>
                    Время смены дня
                    <input
                      type="time"
                      value={settings.dayShiftTime || '00:00'}
                      disabled={readOnly}
                      onChange={(e) => patchSettings({ dayShiftTime: e.target.value })}
                    />
                  </label>
                ) : null}
              </>
            ) : null}

            {settings.advancedLateEarly ? (
              <div>
                <span className={styles.muted}>Учет времени</span>
                <div className={styles.radios}>
                  <label>
                    <input
                      type="radio"
                      checked={(settings.delayMode || 'allowed') === 'allowed'}
                      disabled={readOnly}
                      onChange={() => patchSettings({ delayMode: 'allowed' })}
                    />
                    Дозволено
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={settings.delayMode === 'strict'}
                      disabled={readOnly}
                      onChange={() => patchSettings({ delayMode: 'strict' })}
                    />
                    Строго
                  </label>
                </div>
                <div className={styles.inlineNums} style={{ marginTop: 6 }}>
                  <span className={styles.muted}>Приход после</span>
                  <input
                    type="number"
                    min={0}
                    value={settings.arriveGraceMinutes ?? 0}
                    disabled={readOnly}
                    onChange={(e) =>
                      patchSettings({ arriveGraceMinutes: Number(e.target.value) || 0 })
                    }
                  />
                  <span className={styles.muted}>мин · Уход после</span>
                  <input
                    type="number"
                    min={0}
                    value={settings.leaveGraceMinutes ?? 0}
                    disabled={readOnly}
                    onChange={(e) =>
                      patchSettings({ leaveGraceMinutes: Number(e.target.value) || 0 })
                    }
                  />
                  <span className={styles.muted}>мин</span>
                </div>
              </div>
            ) : null}

            <label>
              Норма дней / часов (месяц)
              <div className={styles.inlineNums}>
                <input value={normDays} disabled={readOnly} onChange={(e) => setNormDays(e.target.value)} />
                <span className={styles.muted}>дн</span>
                <input value={normHours} disabled={readOnly} onChange={(e) => setNormHours(e.target.value)} />
                <span className={styles.muted}>ч</span>
              </div>
            </label>
          </div>
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
              onClick={() => void fillSelected()}
            >
              {filling ? '…' : 'Заполнить'}
            </button>
            <button
              type="button"
              className={styles.lineBtn}
              disabled={readOnly}
              onClick={() => setNormOpen(true)}
            >
              {kind === 'multi_shift' || kind === 'advanced_multi_shift'
                ? 'Изменить смену'
                : 'Изменить норму'}
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
                <th className={styles.stickyLeft}>
                  <input
                    type="checkbox"
                    checked={
                      filteredLines.length > 0 &&
                      filteredLines.every((l) => selectedKeys.includes(l.key))
                    }
                    onChange={(e) => {
                      if (e.target.checked) setSelectedKeys(filteredLines.map((l) => l.key));
                      else setSelectedKeys([]);
                    }}
                  />
                </th>
                <th className={`${styles.stickyLeft} ${styles.emp}`}>Сотрудник</th>
                <th className={`${styles.stickyLeft} ${styles.pos}`}>Позиция</th>
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
                    Нет строк — нажмите «Добавить» или «Заполнить»
                  </td>
                </tr>
              ) : null}
              {filteredLines.map((line) => {
                const emp = empMap.get(line.employeeId);
                return (
                  <tr key={line.key}>
                    <td className={styles.stickyLeft}>
                      <input
                        type="checkbox"
                        checked={selectedKeys.includes(line.key)}
                        onChange={(e) => {
                          setSelectedKeys((prev) =>
                            e.target.checked
                              ? [...prev, line.key]
                              : prev.filter((k) => k !== line.key),
                          );
                        }}
                      />
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.emp}`} title={emp?.label}>
                      {emp?.label || line.employeeId || '—'}
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.pos}`}>
                      {emp?.positionName || '—'}
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.stat}`}>{line.daysCount}</td>
                    <td className={`${styles.stickyLeft} ${styles.stat}`}>{line.hoursTotal}</td>
                    {dayCols.map((c) => {
                      const val = line.days[String(c.day)] ?? '';
                      const isWork = parseHours(val) != null;
                      return (
                        <td
                          key={c.day}
                          className={isWork ? styles.work : c.weekend ? styles.off : styles.work}
                        >
                          <input
                            value={val}
                            disabled={readOnly}
                            onChange={(e) => setCell(line.key, c.day, e.target.value)}
                            title={`${c.day} ${c.wdLabel}`}
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
        <div className={styles.overlay} role="dialog">
          <div className={styles.modal}>
            <p className={styles.modalTitle}>Сохранить и провести документ?</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.primary}
                disabled={saving || posting}
                onClick={() => void save(true)}
              >
                Да
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setConfirmPost(false)}
              >
                Нет
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {normOpen ? (
        <div className={styles.overlay} role="dialog">
          <div className={styles.modal}>
            <p className={styles.modalTitle}>
              Изменение нормы (плана) часов и дней для месяца
            </p>
            <label>
              Месяц
              <input
                value={`${MONTHS[monthIndex]} ${year}`}
                readOnly
                style={{ height: 34, border: '1px solid #d1d5db', borderRadius: 4, padding: '0 8px' }}
              />
            </label>
            <label>
              Норма дней
              <input value={normDays} onChange={(e) => setNormDays(e.target.value)} />
            </label>
            <label>
              Норма часов
              <input value={normHours} onChange={(e) => setNormHours(e.target.value)} />
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.primary} onClick={() => applyNorms()}>
                Сохранить
              </button>
              <button type="button" className={styles.secondary} onClick={() => setNormOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pickOpen ? (
        <EmployeePickModal
          title="Добавить сотрудников"
          confirmText="Добавить"
          items={toPickItems(divisionId ? employees.filter((e) => e.divisionId === divisionId) : employees)}
          onClose={() => setPickOpen(false)}
          onConfirm={confirmPick}
        />
      ) : null}
    </div>
  );
}
