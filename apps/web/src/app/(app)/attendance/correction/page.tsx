'use client';

import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { ymdToday } from '@/lib/tz';
import shared from '../../../page-shared.module.css';
import styles from './page.module.css';
import {
  QUICK_STATUSES,
  SPECIAL_STATUSES,
  cellKey,
  cellShort,
  fmtMonthLabel,
  fmtTotal,
  isWeekend,
  monthNow,
  shiftMonth,
  statusMeta,
  weekdayOf,
  workValue,
  WEEKDAY_SHORT_RU,
  type CorrectionCell,
  type CorrectionMatrix,
  type CorrectionRow,
  type CorrectionStatus,
} from './_lib';

type DivOpt = { id: string; name: string };
type PosOpt = { id: string; name: string };
type Pending = Record<string, { status: CorrectionStatus; lateMinutes: number }>;
type DraftFilters = {
  month: string;
  q: string;
  divisionId: string;
  positionId: string;
};

const EMPTY_DRAFT: DraftFilters = {
  month: monthNow(),
  q: '',
  divisionId: '',
  positionId: '',
};

function filtersReady(f: DraftFilters) {
  return Boolean(f.divisionId || f.positionId || f.q.trim());
}

function effectiveStatus(
  employeeId: string,
  cell: CorrectionCell,
  pending: Pending,
): CorrectionCell {
  const p = pending[cellKey(employeeId, cell.date)];
  if (!p) return cell;
  return { ...cell, status: p.status, lateMinutes: p.lateMinutes };
}

function isContinuous(days: number[]) {
  for (let i = 1; i < days.length; i++) {
    if (days[i] !== days[i - 1] + 1) return false;
  }
  return days.length > 0;
}

function DayPickerPanel({
  month,
  days,
  editDays,
  onToggleDay,
  onSelectRange,
  onClearDays,
  onToday,
}: {
  month: string;
  days: number[];
  editDays: number[];
  onToggleDay: (d: number) => void;
  onSelectRange: (from: number, to: number) => void;
  onClearDays: () => void;
  onToday: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(15, days.length || 15));
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0 });
  const today = ymdToday();
  const isCurrentMonth = today.startsWith(month);
  const todayDay = Number(today.slice(8, 10));
  const selected = useMemo(() => new Set(editDays), [editDays]);
  const dim = days.length;

  const label =
    editDays.length === 0
      ? 'Дни'
      : editDays.length === 1
        ? `${String(editDays[0]).padStart(2, '0')}-й день`
        : isContinuous(editDays)
          ? `${String(editDays[0]).padStart(2, '0')}–${String(editDays[editDays.length - 1]).padStart(2, '0')}`
          : `${editDays.length} дн.`;

  const reposition = useCallback(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = Math.min(288, vw - 16);
    let left = r.right - panelW;
    if (left < 8) left = 8;
    if (left + panelW > vw - 8) left = Math.max(8, vw - 8 - panelW);
    let top = r.bottom + 6;
    if (top + 360 > vh - 8) top = Math.max(8, r.top - 6 - 360);
    setBox({ top, left });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`${styles.toolBtn} ${editDays.length ? styles.toolBtnActive : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        ▦ {label}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className={styles.dayPanel}
              style={{ top: box.top, left: box.left }}
            >
              <div className={styles.dayPanelHead}>
                <strong>Выбор дней</strong>
                <div className={styles.dayPanelActions}>
                  {isCurrentMonth ? (
                    <button type="button" onClick={onToday}>
                      Сегодня
                    </button>
                  ) : null}
                  <button type="button" onClick={onClearDays}>
                    Очистить
                  </button>
                </div>
              </div>
              <div className={styles.dayRange}>
                <span>Диапазон:</span>
                <input
                  type="number"
                  min={1}
                  max={dim}
                  value={from}
                  onChange={(e) => setFrom(Number(e.target.value))}
                />
                <span>—</span>
                <input
                  type="number"
                  min={1}
                  max={dim}
                  value={to}
                  onChange={(e) => setTo(Number(e.target.value))}
                />
                <button
                  type="button"
                  className={styles.dayRangeApply}
                  onClick={() => {
                    onSelectRange(from, to);
                    setOpen(false);
                  }}
                >
                  Выбрать
                </button>
              </div>
              <div className={styles.dayGrid}>
                {days.map((d) => {
                  const ymd = `${month}-${String(d).padStart(2, '0')}`;
                  const sel = selected.has(d);
                  const sun = isWeekend(ymd);
                  const isT = isCurrentMonth && d === todayDay;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={[
                        styles.dayChip,
                        sel ? styles.dayChipOn : '',
                        !sel && isT ? styles.dayChipToday : '',
                        !sel && sun ? styles.dayChipWeekend : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onToggleDay(d)}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className={styles.dayHint}>
                Диапазон или отдельные дни → статус сверху. Галочки слева —
                кому проставить (пусто = всем в таблице).
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type GridRowProps = {
  row: CorrectionRow;
  month: string;
  days: number[];
  today: string;
  selected: boolean;
  selectedDays: Set<number>;
  pending: Pending;
  onToggleRow: (id: string) => void;
  onCellClick: (employeeId: string, cell: CorrectionCell) => void;
};

const GridRow = memo(function GridRow({
  row,
  month,
  days,
  today,
  selected,
  selectedDays,
  pending,
  onToggleRow,
  onCellClick,
}: GridRowProps) {
  let total = 0;
  const cells = days.map((d) => {
    const c =
      row.cells.find((x) => x.day === d) ||
      ({
        day: d,
        date: `${month}-${String(d).padStart(2, '0')}`,
        status: 'not_started',
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
      } as CorrectionCell);
    const eff = effectiveStatus(row.employeeId, c, pending);
    total += workValue(eff.status);
    return { c, eff };
  });

  return (
    <tr className={selected ? styles.rowSelected : undefined}>
      <td className={styles.stickyCheck}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleRow(row.employeeId)}
        />
      </td>
      <td className={styles.stickyName}>
        <div className={styles.fio}>{row.fullName}</div>
        <div className={styles.muted}>{row.tabNumber}</div>
      </td>
      <td className={styles.stickyPos}>
        <span className={styles.muted}>{row.position || '—'}</span>
      </td>
      <td className={styles.stickyDiv}>
        <span className={styles.muted}>{row.division || '—'}</span>
      </td>
      <td className={styles.total}>{fmtTotal(total)}</td>
      {cells.map(({ c, eff }) => {
        const meta = statusMeta(eff.status);
        const key = cellKey(row.employeeId, c.date);
        const isPend = Boolean(pending[key]);
        const selCol = selectedDays.has(c.day);
        const future = c.date > today;
        const tdClass = [
          styles.cell,
          selCol ? styles.cellColSel : '',
          isPend ? styles.cellPending : '',
        ]
          .filter(Boolean)
          .join(' ');

        if (future) {
          return (
            <td key={c.date} className={tdClass}>
              <span className={styles.futureDot}>·</span>
            </td>
          );
        }

        return (
          <td key={c.date} className={tdClass}>
            <button
              type="button"
              className={`${styles.cellBadge} ${styles[meta.cellClass as keyof typeof styles] || ''}`}
              title={`${meta.label}${
                eff.lateMinutes ? ` · ${eff.lateMinutes} мин` : ''
              } — клик: сменить статус`}
              onClick={() => onCellClick(row.employeeId, c)}
            >
              {cellShort(eff)}
            </button>
          </td>
        );
      })}
    </tr>
  );
});

/** Cycle quick statuses on cell click (fast, no expand). */
const CYCLE: CorrectionStatus[] = [
  'on_time',
  'late',
  'absent',
  'day_off',
  'leave',
  'on_time',
];

function CorrectionPageInner() {
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<DraftFilters | null>(null);
  const [divisions, setDivisions] = useState<DivOpt[]>([]);
  const [positions, setPositions] = useState<PosOpt[]>([]);
  const [data, setData] = useState<CorrectionMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editDays, setEditDays] = useState<number[]>([]);
  const [pending, setPending] = useState<Pending>({});
  const [lateMinutes, setLateMinutes] = useState(15);

  const bulkActive = editDays.length > 0;
  const canApply = filtersReady(draft);
  const today = ymdToday();

  const loadLookups = useCallback(async () => {
    try {
      const [divs, poss] = await Promise.all([
        apiFetch<{ items?: DivOpt[] } | DivOpt[]>(
          '/api/organization/divisions?take=500',
        ).catch(() => []),
        apiFetch<{ items?: PosOpt[] } | PosOpt[]>(
          '/api/organization/positions?take=500',
        ).catch(() => []),
      ]);
      const dList = Array.isArray(divs) ? divs : divs.items || [];
      const pList = Array.isArray(poss) ? poss : poss.items || [];
      setDivisions(
        dList.map((x: { id: string; name?: string; label?: string }) => ({
          id: x.id,
          name: x.name || x.label || x.id,
        })),
      );
      setPositions(
        pList.map((x: { id: string; name?: string; label?: string }) => ({
          id: x.id,
          name: x.name || x.label || x.id,
        })),
      );
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMatrix = useCallback(async (f: DraftFilters) => {
    if (!filtersReady(f)) {
      setError('Выберите подразделение, должность или сотрудника');
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        month: f.month,
        limit: '100',
      });
      if (f.divisionId) params.set('divisionIds', f.divisionId);
      if (f.positionId) params.set('positionIds', f.positionId);
      if (f.q.trim()) params.set('q', f.q.trim());
      const res = await apiFetch<CorrectionMatrix>(
        `/api/attendance/correction-matrix?${params}`,
      );
      setData(res);
      setPending({});
      setSelectedRows(new Set());
      setEditDays([]);
      setApplied(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить табель');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onApply = () => {
    if (!canApply) {
      setToast('Сначала выберите фильтр (подразделение / должность / ФИО)');
      return;
    }
    void loadMatrix(draft);
  };

  const days = data?.days ?? [];
  const rows = data?.rows ?? [];
  const pendingCount = Object.keys(pending).length;
  const selectedDaySet = useMemo(() => new Set(editDays), [editDays]);

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedRows.has(r.employeeId));

  const toggleRow = useCallback((id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllRows = () => {
    if (allSelected) setSelectedRows(new Set());
    else setSelectedRows(new Set(rows.map((r) => r.employeeId)));
  };

  /** Header: select day for bulk (Shift = add to selection). */
  const headerDayClick = (d: number, shiftKey: boolean) => {
    setEditDays((prev) => {
      if (shiftKey) {
        const set = new Set(prev);
        if (set.has(d)) set.delete(d);
        else set.add(d);
        return [...set].sort((a, b) => a - b);
      }
      return prev.length === 1 && prev[0] === d ? [] : [d];
    });
  };

  const toggleDayInPicker = (d: number) => {
    setEditDays((prev) => {
      const set = new Set(prev);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      return [...set].sort((a, b) => a - b);
    });
  };

  const selectRange = (from: number, to: number) => {
    const a = Math.max(1, Math.min(from, to));
    const b = Math.min(days.length, Math.max(from, to));
    const list = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    setEditDays(list);
    setToast(`Выбрано дней: ${list.length}`);
  };

  const clearDays = () => setEditDays([]);

  const pickToday = () => {
    const month = applied?.month || draft.month;
    if (!today.startsWith(month)) return;
    const d = Number(today.slice(8, 10));
    if (days.includes(d)) setEditDays([d]);
  };

  const setCellStatus = useCallback(
    (employeeId: string, cell: CorrectionCell, status: CorrectionStatus) => {
      const mins =
        status === 'late' ? Math.max(1, Number(lateMinutes) || 15) : 0;
      const key = cellKey(employeeId, cell.date);
      setPending((p) => {
        const next = { ...p };
        if (
          cell.status === status &&
          (status !== 'late' || cell.lateMinutes === mins) &&
          !p[key]
        ) {
          return next;
        }
        if (
          p[key]?.status === status &&
          p[key]?.lateMinutes === mins
        ) {
          delete next[key];
          return next;
        }
        if (
          cell.status === status &&
          (status !== 'late' || cell.lateMinutes === mins)
        ) {
          delete next[key];
        } else {
          next[key] = { status, lateMinutes: mins };
        }
        return next;
      });
    },
    [lateMinutes],
  );

  const onCellClick = useCallback(
    (employeeId: string, cell: CorrectionCell) => {
      const minsBase = Math.max(1, Number(lateMinutes) || 15);
      setPending((p) => {
        const cur = effectiveStatus(employeeId, cell, p);
        const idx = CYCLE.indexOf(cur.status as CorrectionStatus);
        const status = CYCLE[idx >= 0 ? idx + 1 : 0] || 'on_time';
        const mins = status === 'late' ? minsBase : 0;
        const key = cellKey(employeeId, cell.date);
        const next = { ...p };
        if (
          cell.status === status &&
          (status !== 'late' || cell.lateMinutes === mins)
        ) {
          delete next[key];
        } else {
          next[key] = { status, lateMinutes: mins };
        }
        return next;
      });
    },
    [lateMinutes],
  );

  const bulkApply = (status: CorrectionStatus) => {
    if (editDays.length === 0) {
      setToast('Сначала выберите дни (шапка или «Дни»)');
      return;
    }
    const mins = status === 'late' ? Math.max(1, Number(lateMinutes) || 15) : 0;
    const targets =
      selectedRows.size > 0
        ? rows.filter((r) => selectedRows.has(r.employeeId))
        : rows;
    if (!targets.length) {
      setToast('Нет сотрудников');
      return;
    }
    setPending((p) => {
      const next = { ...p };
      for (const r of targets) {
        for (const d of editDays) {
          const cell = r.cells.find((c) => c.day === d);
          if (!cell || cell.date > today) continue;
          const key = cellKey(r.employeeId, cell.date);
          if (
            cell.status === status &&
            (status !== 'late' || cell.lateMinutes === mins)
          ) {
            delete next[key];
          } else {
            next[key] = { status, lateMinutes: mins };
          }
        }
      }
      return next;
    });
    const scope =
      selectedRows.size > 0 ? `${targets.length} сотр.` : 'всем в таблице';
    setToast(
      `«${statusMeta(status).label}» · ${editDays.length} дн. (${scope})`,
    );
  };

  const discard = () => {
    setPending({});
    setEditDays([]);
    setToast('Изменения отменены');
  };

  const save = async () => {
    const entries = Object.entries(pending).map(([key, v]) => {
      const [employeeId, date] = key.split('|');
      return {
        employeeId,
        date,
        status: v.status,
        lateMinutes: v.lateMinutes,
      };
    });
    if (!entries.length) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; updated: number }>(
        '/api/attendance/correction-matrix/batch',
        { method: 'POST', body: JSON.stringify({ entries }) },
      );
      setToast(`Сохранено: ${res.updated}`);
      if (applied) await loadMatrix(applied);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = fmtMonthLabel(draft.month);

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="attendance-correction" />

      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <h1>Корректировка табеля</h1>
          <p>
            Сначала фильтры → «Применить». Клик по дню в шапке выделяет колонку;
            клик по ячейке меняет статус. Без тяжёлого раскрытия колонки.
          </p>
        </div>
        <div className={styles.monthNav}>
          <button
            type="button"
            className={styles.monthBtn}
            onClick={() =>
              setDraft((d) => ({ ...d, month: shiftMonth(d.month, -1) }))
            }
          >
            ‹
          </button>
          <div className={styles.monthLabel}>{monthLabel}</div>
          <button
            type="button"
            className={styles.monthBtn}
            onClick={() =>
              setDraft((d) => ({ ...d, month: shiftMonth(d.month, 1) }))
            }
          >
            ›
          </button>
        </div>
      </div>

      {data ? (
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{data.stats.employees}</div>
            <div className={styles.statLbl}>В выборке</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{data.stats.atWork}</div>
            <div className={styles.statLbl}>В работе</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{data.stats.absent}</div>
            <div className={styles.statLbl}>Отсутствуют</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{data.stats.leave}</div>
            <div className={styles.statLbl}>Отпуск</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{data.stats.dayOff}</div>
            <div className={styles.statLbl}>Выходной</div>
          </div>
        </div>
      ) : null}

      <div className={styles.filters}>
        <div className={styles.field}>
          <label>Подразделение</label>
          <select
            value={draft.divisionId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, divisionId: e.target.value }))
            }
          >
            <option value="">Все</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Должность</label>
          <select
            value={draft.positionId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, positionId: e.target.value }))
            }
          >
            <option value="">Все</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Сотрудник</label>
          <input
            value={draft.q}
            onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
            placeholder="ФИО или таб. №"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onApply();
            }}
          />
        </div>
        <button
          type="button"
          className={styles.applyBtn}
          disabled={!canApply || loading}
          onClick={onApply}
        >
          {loading ? 'Загрузка…' : 'Применить'}
        </button>
      </div>

      {!applied && !loading ? (
        <div className={styles.emptyGate}>
          <strong>Выберите фильтры и нажмите «Применить»</strong>
          <p>
            Таблица не загружается сразу — так страница не зависает на сотнях
            сотрудников. Укажите подразделение, должность или ФИО.
          </p>
        </div>
      ) : null}

      {error ? <div className={styles.empty}>{error}</div> : null}

      {applied && data ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div
                className={`${styles.quickGroup} ${bulkActive ? styles.quickGroupActive : ''}`}
              >
                {QUICK_STATUSES.map((st) => {
                  const meta = statusMeta(st);
                  const cls =
                    st === 'on_time'
                      ? styles.quickOnTime
                      : st === 'late'
                        ? styles.quickLate
                        : styles.quickAbsent;
                  return (
                    <button
                      key={st}
                      type="button"
                      className={`${styles.quickBtn} ${cls}`}
                      disabled={!bulkActive}
                      title={
                        bulkActive
                          ? `Проставить «${meta.label}»`
                          : 'Сначала выберите дни'
                      }
                      onClick={() => bulkApply(st)}
                    >
                      {meta.code || meta.short}
                    </button>
                  );
                })}
                <input
                  className={styles.lateInput}
                  type="number"
                  min={1}
                  max={720}
                  value={lateMinutes}
                  onChange={(e) =>
                    setLateMinutes(Number(e.target.value) || 15)
                  }
                  title="Минуты опоздания"
                />
                <span className={styles.muted}>мин</span>
                {SPECIAL_STATUSES.map((st) => {
                  const meta = statusMeta(st);
                  const cls =
                    st === 'day_off' ? styles.quickDayOff : styles.quickLeave;
                  return (
                    <button
                      key={st}
                      type="button"
                      className={`${styles.quickBtn} ${cls}`}
                      disabled={!bulkActive}
                      onClick={() => bulkApply(st)}
                    >
                      {meta.short}
                    </button>
                  );
                })}
              </div>

              <DayPickerPanel
                month={applied.month}
                days={days}
                editDays={editDays}
                onToggleDay={toggleDayInPicker}
                onSelectRange={selectRange}
                onClearDays={clearDays}
                onToday={pickToday}
              />

              <span className={styles.muted}>
                {editDays.length
                  ? `Дней: ${editDays.length}${
                      selectedRows.size
                        ? ` · сотр.: ${selectedRows.size}`
                        : ' · всем в таблице'
                    }`
                  : 'Дни не выбраны'}
                {pendingCount ? ` · черновик ${pendingCount}` : ''}
                {rows.length >= 100 ? ' · макс. 100 в выборке' : ''}
              </span>
            </div>
            <div className={styles.toolbarRight}>
              <button
                type="button"
                className={styles.cancelBtn}
                disabled={!pendingCount || saving}
                onClick={discard}
              >
                Отменить
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                disabled={!pendingCount || saving}
                onClick={() => void save()}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            {!rows.length ? (
              <div className={styles.empty}>Нет сотрудников по фильтру</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.stickyCheck}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAllRows}
                        aria-label="Выбрать всех"
                      />
                    </th>
                    <th className={styles.stickyName}>ФИО</th>
                    <th className={styles.stickyPos}>Должность</th>
                    <th className={styles.stickyDiv}>Подразделение</th>
                    <th className={styles.total}>Итого</th>
                    {days.map((d) => {
                      const ymd = `${applied.month}-${String(d).padStart(2, '0')}`;
                      const sel = selectedDaySet.has(d);
                      const weekend = isWeekend(ymd);
                      const isToday = ymd === today;
                      return (
                        <th
                          key={d}
                          className={[
                            styles.dayHead,
                            sel ? styles.dayHeadSel : '',
                            !sel && weekend ? styles.dayHeadWeekend : '',
                            isToday ? styles.dayHeadToday : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={(e) => headerDayClick(d, e.shiftKey)}
                          title="Клик — выбрать день · Shift+клик — несколько дней"
                        >
                          <div className={styles.dayNum}>
                            {String(d).padStart(2, '0')}
                          </div>
                          <div className={styles.dayWd}>
                            {WEEKDAY_SHORT_RU[weekdayOf(ymd)]}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <GridRow
                      key={r.employeeId}
                      row={r}
                      month={applied.month}
                      days={days}
                      today={today}
                      selected={selectedRows.has(r.employeeId)}
                      selectedDays={selectedDaySet}
                      pending={pending}
                      onToggleRow={toggleRow}
                      onCellClick={onCellClick}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.legend}>
            {[...QUICK_STATUSES, ...SPECIAL_STATUSES].map((st) => {
              const meta = statusMeta(st);
              return (
                <span key={st} className={styles.legendItem}>
                  <span
                    className={`${styles.cellBadge} ${styles[meta.cellClass as keyof typeof styles] || ''}`}
                  >
                    {meta.code || meta.short}
                  </span>
                  {meta.code || meta.short} — {meta.label}
                </span>
              );
            })}
            <span className={styles.muted} style={{ marginLeft: 'auto' }}>
              Ячейка: клик = следующий статус · Шапка дня + 1/0.5/0 = массово
            </span>
          </div>
        </>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}

export default function AttendanceCorrectionPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <CorrectionPageInner />
    </Suspense>
  );
}
