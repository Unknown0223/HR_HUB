'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
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
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const INTERVALS = [
  { value: 'first_in_first_out', label: 'Первый приход и первый уход' },
  { value: 'first_in_last_out', label: 'Первый приход и последний уход' },
];

type EmpOpt = {
  id: string;
  label: string;
  divisionId?: string;
  positionId?: string;
  positionName?: string;
};
type DivOpt = { id: string; label: string };
type PosOpt = { id: string; label: string };

type Settings = {
  autoProdCalendar?: boolean;
  fillOnlyWithEmployees?: boolean;
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
  delayMode?: 'allowed' | 'strict';
  arriveGraceMinutes?: number;
  leaveGraceMinutes?: number;
  includeHolidays?: boolean;
  includeNonWorking?: boolean;
  includeExtraOff?: boolean;
  productionCalendarName?: string;
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
  positionId: string;
  staffPositionId?: string;
  employeeId?: string;
  days: Record<string, string>;
  daysCount: number;
  hoursTotal: number;
  normDays?: string;
  normHours?: string;
};

function monthIso(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

function emptyLine(positionId = '', employeeId = ''): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    positionId,
    employeeId,
    days: {},
    daysCount: 0,
    hoursTotal: 0,
    normDays: '',
    normHours: '',
  };
}

function parseHours(v: string): number | null {
  if (!v || v === 'В' || v === 'R') return null;
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
    if (h == null) {
      if (v && v !== 'В' && v !== 'R') daysCount += 1;
      continue;
    }
    daysCount += 1;
    hoursTotal += h;
  }
  return { daysCount, hoursTotal: Math.round(hoursTotal * 100) / 100 };
}

export function PositionScheduleForm({
  mode,
  documentId,
  initialKind = 'ordinary',
}: {
  mode: 'create' | 'edit';
  documentId?: string;
  initialKind?: ScheduleKind;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind] = useState<ScheduleKind>(initialKind);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
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
    fillOnlyWithEmployees: true,
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
    delayMode: 'allowed',
    arriveGraceMinutes: 0,
    leaveGraceMinutes: 0,
    includeHolidays: true,
    includeNonWorking: true,
    includeExtraOff: true,
    shifts: [
      {
        code: 'Смена 1',
        startTime: '09:00',
        endTime: '18:00',
        breakYn: 'Y',
        breakStart: '13:00',
        breakEnd: '14:00',
        appearance: '08:00',
      },
    ],
  });

  const [lines, setLines] = useState<LineDraft[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<DivOpt[]>([]);
  const [positions, setPositions] = useState<PosOpt[]>([]);
  const [confirmPost, setConfirmPost] = useState(false);
  const [normOpen, setNormOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);

  const readOnly = status === 'posted' || status === 'cancelled';
  const showAdvanced =
    kind === 'advanced' || kind === 'multi_shift' || kind === 'advanced_multi_shift' || kind === 'hourly';

  const daysInMonth = useMemo(
    () => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(),
    [year, monthIndex],
  );
  const dayCols = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const wd = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
        const weekend =
          (settings.weekPattern || '5/2') === '6/1' ? wd === 0 : wd === 0 || wd === 6;
        return { day, wdLabel: WEEKDAYS[wd], weekend };
      }),
    [daysInMonth, year, monthIndex, settings.weekPattern],
  );

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const posMap = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);

  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => {
      const emp = l.employeeId ? empMap.get(l.employeeId) : null;
      const pos = posMap.get(l.positionId);
      return (
        (emp?.label || '').toLowerCase().includes(q) ||
        (pos?.label || '').toLowerCase().includes(q)
      );
    });
  }, [lines, lineSearch, empMap, posMap]);

  const loadLookups = useCallback(async () => {
    try {
      const d = await apiFetch<{
        employees?: EmpOpt[];
        divisions?: DivOpt[];
        positions?: PosOpt[];
      }>('/api/catalog/lookups');
      setEmployees(d.employees || []);
      setDivisions(d.divisions || []);
      setPositions(d.positions || []);
    } catch {
      /* ignore */
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
      try {
        const row = await apiFetch<{
          id: string;
          status: string;
          documentDate: string;
          number?: string | null;
          month: string;
          divisionId?: string | null;
          note?: string | null;
          settings?: Settings | null;
          lines?: Array<{
            positionId: string;
            staffPositionId?: string | null;
            employeeId?: string | null;
            days?: Record<string, string>;
            daysCount?: number;
            hoursTotal?: number | string;
            normDays?: number | string | null;
            normHours?: number | string | null;
          }>;
        }>(`/api/catalog/position-schedules/${documentId}`);
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
        setSettings((s) => ({ ...s, ...(row.settings || {}) }));
        setLines(
          (row.lines || []).map((l) => {
            const days = (l.days || {}) as Record<string, string>;
            const t = recomputeTotals(days);
            return {
              ...emptyLine(l.positionId, l.employeeId || ''),
              staffPositionId: l.staffPositionId || undefined,
              days,
              daysCount: l.daysCount ?? t.daysCount,
              hoursTotal: Number(l.hoursTotal ?? t.hoursTotal),
              normDays: l.normDays != null ? String(l.normDays) : '',
              normHours: l.normHours != null ? String(l.normHours) : '',
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
  }, [mode, documentId]);

  function patchSettings(p: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...p }));
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
      lines: lines
        .filter((l) => l.positionId)
        .map((l, idx) => ({
          positionId: l.positionId,
          staffPositionId: l.staffPositionId || undefined,
          employeeId: l.employeeId || undefined,
          sortOrder: idx,
          days: l.days,
          daysCount: l.daysCount,
          hoursTotal: l.hoursTotal,
          normDays: l.normDays ? Number(l.normDays) : undefined,
          normHours: l.normHours ? Number(l.normHours) : undefined,
        })),
    };
  }

  async function save(andPost = false) {
    setError('');
    setOkMsg('');
    if (andPost && !lines.some((l) => l.positionId)) {
      setError('Добавьте хотя бы одну позицию');
      return;
    }
    setSaving(true);
    try {
      const body = buildBody();
      let id = docId;
      if (id) {
        await apiFetch(`/api/catalog/position-schedules/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<{ id: string }>('/api/catalog/position-schedules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
        setDocId(id);
      }
      if (andPost && id) {
        setPosting(true);
        await apiFetch(`/api/catalog/position-schedules/${id}/post`, { method: 'POST' });
        setStatus('posted');
        router.push('/catalog/position-schedules');
        return;
      }
      setOkMsg('Сохранено');
      if (mode === 'create' && id) router.replace(`/catalog/position-schedules/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
      setPosting(false);
      setConfirmPost(false);
    }
  }

  async function fillSelected() {
    setFilling(true);
    setError('');
    try {
      const res = await apiFetch<{
        lines: Array<{
          positionId: string;
          staffPositionId?: string | null;
          employeeId?: string | null;
          days: Record<string, string>;
          daysCount: number;
          hoursTotal: number;
        }>;
      }>('/api/catalog/position-schedules/fill', {
        method: 'POST',
        body: JSON.stringify({
          month: monthIso(year, monthIndex),
          divisionId: divisionId || undefined,
          fillOnlyWithEmployees: settings.fillOnlyWithEmployees !== false,
          dayNorm: settings.dayNorm ?? 8,
          weekPattern: settings.weekPattern || '5/2',
          kind,
          displayMode: settings.displayMode || 'hours',
          startTime: settings.startTime || '09:00',
          endTime: settings.endTime || '18:00',
          defaultShiftCode:
            kind === 'multi_shift' || kind === 'advanced_multi_shift'
              ? settings.shifts?.[0]?.code || 'Смена 1'
              : undefined,
        }),
      });
      setLines(
        (res.lines || []).map((l) => ({
          ...emptyLine(l.positionId, l.employeeId || ''),
          staffPositionId: l.staffPositionId || undefined,
          days: l.days || {},
          daysCount: l.daysCount || 0,
          hoursTotal: l.hoursTotal || 0,
        })),
      );
      setOkMsg(`Заполнено: ${res.lines?.length || 0} строк`);
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
      const q = new URLSearchParams({
        month: monthIso(year, monthIndex),
        fillOnlyWithEmployees: settings.fillOnlyWithEmployees === false ? '0' : '1',
      });
      if (docId) q.set('documentId', docId);
      if (divisionId) q.set('divisionId', divisionId);
      await apiDownload(
        `/api/catalog/position-schedules/template.xlsx?${q}`,
        `individ-position-${year}-${monthIndex + 1}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка шаблона');
    } finally {
      setTplBusy(false);
    }
  }

  async function onUpload(file: File) {
    setTplBusy(true);
    setError('');
    setOkMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (docId) fd.append('documentId', docId);
      fd.append('month', monthIso(year, monthIndex));
      const res = await apiFetch<{
        lines?: Array<{
          positionId: string;
          staffPositionId?: string | null;
          employeeId?: string | null;
          days: Record<string, string>;
          daysCount: number;
          hoursTotal: number;
        }>;
        document?: { id: string };
        imported: number;
        unmatched?: string[];
        shifts?: Settings['shifts'];
      }>('/api/catalog/position-schedules/import', {
        method: 'POST',
        body: fd,
      });
      if (res.shifts?.length) {
        patchSettings({ useTemplate: true, shifts: res.shifts });
      } else {
        patchSettings({ useTemplate: true });
      }
      if (res.document?.id) {
        setDocId(res.document.id);
        setOkMsg(`Импорт: ${res.imported} строк`);
        router.replace(`/catalog/position-schedules/${res.document.id}`);
        return;
      }
      if (res.lines) {
        setLines(
          res.lines.map((l) => ({
            ...emptyLine(l.positionId, l.employeeId || ''),
            staffPositionId: l.staffPositionId || undefined,
            days: l.days || {},
            daysCount: l.daysCount || 0,
            hoursTotal: l.hoursTotal || 0,
          })),
        );
      }
      const um = res.unmatched?.length ? `; не найдено: ${res.unmatched.slice(0, 5).join(', ')}` : '';
      setOkMsg(`Импорт: ${res.imported} строк${um}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setTplBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading) return <p className={styles.muted} style={{ padding: '1rem' }}>Загрузка…</p>;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="position-schedules" />
      <div className={styles.docHead}>
        <h1 className={styles.docTitle}>
          {KIND_TITLE[kind]} ({mode === 'edit' ? 'изменение' : 'создание'})
        </h1>
        <div className={styles.docActions}>
          <button type="button" className={styles.primary} disabled={saving || readOnly} onClick={() => void save(false)}>
            Сохранить
          </button>
          <button type="button" className={styles.primary} disabled={saving || readOnly} onClick={() => setConfirmPost(true)}>
            Провести
          </button>
          <Link href="/catalog/position-schedules" className={styles.secondary}>
            Закрыть
          </Link>
          <Link href="/catalog/schedule-shifts" className={styles.shiftsTab}>
            Смены
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {okMsg ? <p className={styles.banner}>{okMsg}</p> : null}
      {readOnly ? <p className={styles.banner}>Документ {status === 'posted' ? 'проведён' : 'отменён'}</p> : null}

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <div className={styles.col}>
            <label>
              Дата *
              <input type="date" value={documentDate} disabled={readOnly} onChange={(e) => setDocumentDate(e.target.value)} />
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
            <label>
              Подразделение
              <select value={divisionId} disabled={readOnly} onChange={(e) => setDivisionId(e.target.value)}>
                <option value="">Поиск…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={settings.fillOnlyWithEmployees !== false}
                disabled={readOnly}
                onChange={(e) => patchSettings({ fillOnlyWithEmployees: e.target.checked })}
              />
              Заполнять только позициями с сотрудниками
            </label>
            <label>
              Примечание
              <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} rows={3} />
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
            {settings.autoProdCalendar ? (
              <div className={styles.radios}>
                <label className={styles.check}>
                  <input type="checkbox" checked={settings.includeHolidays !== false} disabled={readOnly}
                    onChange={(e) => patchSettings({ includeHolidays: e.target.checked })} />
                  Праздничные дни
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={settings.includeNonWorking !== false} disabled={readOnly}
                    onChange={(e) => patchSettings({ includeNonWorking: e.target.checked })} />
                  Нерабочие дни
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={settings.includeExtraOff !== false} disabled={readOnly}
                    onChange={(e) => patchSettings({ includeExtraOff: e.target.checked })} />
                  Доп. выходные
                </label>
              </div>
            ) : null}

            <label>
              Тип расчета интервала *
              <select value={settings.intervalType || 'first_in_first_out'} disabled={readOnly}
                onChange={(e) => patchSettings({ intervalType: e.target.value })}>
                {INTERVALS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </label>

            <div>
              <span className={styles.muted}>Способ отображения графика дня</span>
              <div className={styles.radios}>
                <label>
                  <input type="radio" checked={(settings.displayMode || 'hours') === 'hours'} disabled={readOnly}
                    onChange={() => patchSettings({ displayMode: 'hours' })} />
                  Часы
                </label>
                <label>
                  <input type="radio" checked={settings.displayMode === 'time_range'} disabled={readOnly}
                    onChange={() => patchSettings({ displayMode: 'time_range' })} />
                  Время начала и конца
                </label>
              </div>
            </div>

            <label className={styles.check}>
              <input type="checkbox" checked={Boolean(settings.useTemplate)} disabled={readOnly}
                onChange={(e) => patchSettings({ useTemplate: e.target.checked })} />
              Использовать шаблон для заполнения графика
            </label>
            {settings.useTemplate || true ? (
              <div className={styles.inlineNums} style={{ flexWrap: 'wrap' }}>
                <button type="button" className={styles.lineBtn} disabled={tplBusy} onClick={() => void downloadTemplate()}>
                  {tplBusy ? '…' : 'Шаблон'}
                </button>
                <button type="button" className={styles.lineBtn} disabled={readOnly || tplBusy} onClick={() => fileRef.current?.click()}>
                  Загрузить
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                  }}
                />
                <span className={styles.muted}>Excel: data + metadata (Verifix)</span>
              </div>
            ) : null}

            {showAdvanced ? (
              <label>
                Макс. продолжительность дня
                <div className={styles.inlineNums}>
                  <input type="number" value={settings.maxWorkdayHours ?? 24} disabled={readOnly}
                    onChange={(e) => patchSettings({ maxWorkdayHours: Number(e.target.value) || 0 })} />
                  <span className={styles.muted}>ч</span>
                  <input type="number" value={settings.maxWorkdayMinutes ?? 0} disabled={readOnly}
                    onChange={(e) => patchSettings({ maxWorkdayMinutes: Number(e.target.value) || 0 })} />
                  <span className={styles.muted}>мин</span>
                </div>
              </label>
            ) : null}

            {kind === 'advanced' || kind === 'advanced_multi_shift' ? (
              <label>
                Время смены дня
                <input type="time" value={settings.dayShiftTime || '00:00'} disabled={readOnly}
                  onChange={(e) => patchSettings({ dayShiftTime: e.target.value })} />
              </label>
            ) : null}

            <label className={styles.check}>
              <input type="checkbox" checked={Boolean(settings.trackMarks)} disabled={readOnly}
                onChange={(e) => patchSettings({ trackMarks: e.target.checked })} />
              Расписание отметок
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={Boolean(settings.byLocation)} disabled={readOnly}
                onChange={(e) => patchSettings({ byLocation: e.target.checked })} />
              Считать факты по локациям
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={Boolean(settings.advancedLateEarly)} disabled={readOnly}
                onChange={(e) => patchSettings({ advancedLateEarly: e.target.checked })} />
              Расширенные настройки позднего прихода и раннего ухода
            </label>
            {settings.advancedLateEarly ? (
              <div className={styles.inlineNums}>
                <span className={styles.muted}>Приход после</span>
                <input type="number" value={settings.arriveGraceMinutes ?? 0} disabled={readOnly}
                  onChange={(e) => patchSettings({ arriveGraceMinutes: Number(e.target.value) || 0 })} />
                <span className={styles.muted}>мин · Уход</span>
                <input type="number" value={settings.leaveGraceMinutes ?? 0} disabled={readOnly}
                  onChange={(e) => patchSettings({ leaveGraceMinutes: Number(e.target.value) || 0 })} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.linesCard}>
        <div className={styles.linesToolbar}>
          <div className={styles.lineActions}>
            <button type="button" className={styles.lineBtn} disabled={readOnly || filling} onClick={() => void fillSelected()}>
              {filling ? '…' : 'Заполнить'}
            </button>
            <button type="button" className={styles.lineBtn} disabled={readOnly} onClick={() => setNormOpen(true)}>
              Изменить норму
            </button>
          </div>
          <input className={styles.lineSearch} placeholder="Поиск..." value={lineSearch}
            onChange={(e) => setLineSearch(e.target.value)} />
        </div>

        <div className={styles.gridWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={styles.stickyLeft}>
                  <input
                    type="checkbox"
                    checked={filteredLines.length > 0 && filteredLines.every((l) => selectedKeys.includes(l.key))}
                    onChange={(e) =>
                      setSelectedKeys(e.target.checked ? filteredLines.map((l) => l.key) : [])
                    }
                  />
                </th>
                <th className={`${styles.stickyLeft} ${styles.emp}`}>Позиция</th>
                <th className={`${styles.stickyLeft} ${styles.pos}`}>Сотрудник</th>
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
                    Нет строк — «Заполнить» или загрузите Excel-шаблон
                  </td>
                </tr>
              ) : null}
              {filteredLines.map((line) => {
                const emp = line.employeeId ? empMap.get(line.employeeId) : null;
                const pos = posMap.get(line.positionId);
                return (
                  <tr key={line.key}>
                    <td className={styles.stickyLeft}>
                      <input
                        type="checkbox"
                        checked={selectedKeys.includes(line.key)}
                        onChange={(e) =>
                          setSelectedKeys((prev) =>
                            e.target.checked ? [...prev, line.key] : prev.filter((k) => k !== line.key),
                          )
                        }
                      />
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.emp}`} title={pos?.label}>
                      {pos?.label || line.positionId.slice(0, 8)}
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.pos}`}>
                      {emp?.label || '—'}
                    </td>
                    <td className={`${styles.stickyLeft} ${styles.stat}`}>{line.daysCount}</td>
                    <td className={`${styles.stickyLeft} ${styles.stat}`}>{line.hoursTotal}</td>
                    {dayCols.map((c) => {
                      const val = line.days[String(c.day)] ?? '';
                      const isWork = val && val !== 'В' && val !== 'R';
                      return (
                        <td key={c.day} className={isWork ? styles.work : styles.off}>
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
              <button type="button" className={styles.primary} onClick={() => void save(true)}>Да</button>
              <button type="button" className={styles.secondary} onClick={() => setConfirmPost(false)}>Нет</button>
            </div>
          </div>
        </div>
      ) : null}

      {normOpen ? (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ width: 'min(720px, 100%)', maxHeight: '70vh', overflow: 'auto' }}>
            <p className={styles.modalTitle}>Изменение нормы (плана) часов и дней для месяца</p>
            <table className={styles.grid} style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Позиция</th>
                  <th>Норма дней</th>
                  <th>Норма часов</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>{posMap.get(l.positionId)?.label || l.positionId.slice(0, 8)}</td>
                    <td>
                      <input
                        value={l.normDays ?? ''}
                        disabled={readOnly}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) => (x.key === l.key ? { ...x, normDays: e.target.value } : x)),
                          )
                        }
                        style={{ width: 70 }}
                      />
                    </td>
                    <td>
                      <input
                        value={l.normHours ?? ''}
                        disabled={readOnly}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) => (x.key === l.key ? { ...x, normHours: e.target.value } : x)),
                          )
                        }
                        style={{ width: 70 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.modalActions}>
              <button type="button" className={styles.primary} onClick={() => setNormOpen(false)}>Сохранить</button>
              <button type="button" className={styles.secondary} onClick={() => setNormOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
