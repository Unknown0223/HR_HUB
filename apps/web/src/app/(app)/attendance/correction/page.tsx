'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
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

function effectiveCell(
  row: CorrectionRow,
  cell: CorrectionCell,
  pending: Pending,
): CorrectionCell {
  const p = pending[cellKey(row.employeeId, cell.date)];
  if (!p) return cell;
  return { ...cell, status: p.status, lateMinutes: p.lateMinutes };
}

function CorrectionPageInner() {
  const [month, setMonth] = useState(monthNow);
  const [q, setQ] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [divisions, setDivisions] = useState<DivOpt[]>([]);
  const [positions, setPositions] = useState<PosOpt[]>([]);
  const [data, setData] = useState<CorrectionMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>({});
  const [lateMinutes, setLateMinutes] = useState(15);

  const dragRef = useRef<{
    active: boolean;
    empId: string;
    date: string;
  } | null>(null);

  const loadLookups = useCallback(async () => {
    try {
      const [divs, poss] = await Promise.all([
        apiFetch<{ items?: DivOpt[] } | DivOpt[]>(
          '/api/organization/divisions?take=500',
        ).catch(() =>
          apiFetch<{ items?: DivOpt[] } | DivOpt[]>('/api/catalog/divisions').catch(
            () => [],
          ),
        ),
        apiFetch<{ items?: PosOpt[] } | PosOpt[]>(
          '/api/organization/positions?take=500',
        ).catch(() =>
          apiFetch<{ items?: PosOpt[] } | PosOpt[]>('/api/catalog/positions').catch(
            () => [],
          ),
        ),
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
      /* optional filters */
    }
  }, []);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month });
      if (divisionId) params.set('divisionIds', divisionId);
      if (positionId) params.set('positionIds', positionId);
      if (q.trim()) params.set('q', q.trim());
      const res = await apiFetch<CorrectionMatrix>(
        `/api/attendance/correction-matrix?${params}`,
      );
      setData(res);
      setPending({});
      setSelectedCells(new Set());
      setSelectedRows(new Set());
      setSelectedDays([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить табель');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, divisionId, positionId, q]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const days = data?.days ?? [];
  const rows = data?.rows ?? [];
  const today = ymdToday();
  const pendingCount = Object.keys(pending).length;
  const hasSelection =
    selectedCells.size > 0 ||
    (selectedRows.size > 0 && selectedDays.length > 0);

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedRows.has(r.employeeId));

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRows = () => {
    if (allSelected) setSelectedRows(new Set());
    else setSelectedRows(new Set(rows.map((r) => r.employeeId)));
  };

  const toggleDay = (d: number) => {
    setSelectedDays((prev) => {
      const set = new Set(prev);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      return [...set].sort((a, b) => a - b);
    });
  };

  const selectCell = (empId: string, date: string, additive: boolean) => {
    const key = cellKey(empId, date);
    setSelectedCells((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (next.has(key) && additive) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onCellPointerDown = (
    e: PointerEvent<HTMLTableCellElement>,
    empId: string,
    date: string,
  ) => {
    e.preventDefault();
    dragRef.current = { active: true, empId, date };
    selectCell(empId, date, e.ctrlKey || e.metaKey || e.shiftKey);
  };

  const onCellPointerEnter = (empId: string, date: string) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    // Vertical fill: same day column, drag across employees
    if (date === drag.date && empId !== drag.empId) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        next.add(cellKey(empId, date));
        next.add(cellKey(drag.empId, drag.date));
        return next;
      });
    }
  };

  useEffect(() => {
    const up = () => {
      if (dragRef.current) dragRef.current.active = false;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const targetsForBulk = useMemo(() => {
    const out: Array<{ employeeId: string; date: string }> = [];
    if (selectedCells.size > 0) {
      for (const key of selectedCells) {
        const [employeeId, date] = key.split('|');
        if (employeeId && date) out.push({ employeeId, date });
      }
      return out;
    }
    if (selectedRows.size && selectedDays.length && data) {
      for (const r of data.rows) {
        if (!selectedRows.has(r.employeeId)) continue;
        for (const cell of r.cells) {
          if (selectedDays.includes(cell.day)) {
            out.push({ employeeId: r.employeeId, date: cell.date });
          }
        }
      }
    }
    return out;
  }, [selectedCells, selectedRows, selectedDays, data]);

  const applyStatus = (status: CorrectionStatus) => {
    if (!targetsForBulk.length) {
      setToast('Сначала выберите ячейки или сотрудников и дни');
      return;
    }
    const mins = status === 'late' ? Math.max(1, Number(lateMinutes) || 15) : 0;
    setPending((prev) => {
      const next = { ...prev };
      for (const t of targetsForBulk) {
        next[cellKey(t.employeeId, t.date)] = { status, lateMinutes: mins };
      }
      return next;
    });
    setToast(
      `Черновик: ${targetsForBulk.length} яч. → ${statusMeta(status).label}`,
    );
  };

  const discard = () => {
    setPending({});
    setSelectedCells(new Set());
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
        {
          method: 'POST',
          body: JSON.stringify({ entries }),
        },
      );
      setToast(`Сохранено: ${res.updated} ячеек`);
      await loadMatrix();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="attendance-correction" />

      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <h1>Корректировка табеля</h1>
          <p>
            Выделите ячейки курсором (вертикально по колонке) или сотрудников и
            дни — затем проставьте статус и сохраните
          </p>
        </div>
        <div className={styles.monthNav}>
          <button
            type="button"
            className={styles.monthBtn}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            ‹
          </button>
          <div className={styles.monthLabel}>{fmtMonthLabel(month)}</div>
          <button
            type="button"
            className={styles.monthBtn}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            ›
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void loadMatrix()}
            title="Обновить"
          >
            ↻
          </button>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{data?.stats.employees ?? 0}</div>
          <div className={styles.statLbl}>Сотрудников</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{data?.stats.atWork ?? 0}</div>
          <div className={styles.statLbl}>В работе</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{data?.stats.absent ?? 0}</div>
          <div className={styles.statLbl}>Отсутствуют</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{data?.stats.leave ?? 0}</div>
          <div className={styles.statLbl}>Отпуск</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{data?.stats.dayOff ?? 0}</div>
          <div className={styles.statLbl}>Выходной</div>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.field}>
          <label>Подразделение</label>
          <select
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
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
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ФИО или таб. №"
          />
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div
            className={`${styles.quickGroup} ${hasSelection ? styles.quickGroupActive : ''}`}
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
                  disabled={!hasSelection}
                  title={`${meta.label} (было ${meta.code} в шаблоне)`}
                  onClick={() => applyStatus(st)}
                >
                  {meta.label}
                </button>
              );
            })}
            <input
              className={styles.lateInput}
              type="number"
              min={1}
              max={720}
              value={lateMinutes}
              onChange={(e) => setLateMinutes(Number(e.target.value) || 15)}
              title="Минуты опоздания"
            />
            <span className={styles.muted}>мин</span>
            {SPECIAL_STATUSES.map((st) => {
              const meta = statusMeta(st);
              const cls = st === 'day_off' ? styles.quickDayOff : styles.quickLeave;
              return (
                <button
                  key={st}
                  type="button"
                  className={`${styles.quickBtn} ${cls}`}
                  disabled={!hasSelection}
                  onClick={() => applyStatus(st)}
                >
                  {meta.short} {meta.label}
                </button>
              );
            })}
          </div>
          <span className={styles.muted}>
            {selectedCells.size
              ? `Ячеек: ${selectedCells.size}`
              : selectedDays.length
                ? `Дней: ${selectedDays.length}, сотр.: ${selectedRows.size}`
                : 'Выделение пусто'}
            {pendingCount ? ` · черновик ${pendingCount}` : ''}
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
        {loading && !data ? (
          <div className={styles.loading}>Загрузка…</div>
        ) : error ? (
          <div className={styles.empty}>{error}</div>
        ) : !rows.length ? (
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
                  const ymd = `${month}-${String(d).padStart(2, '0')}`;
                  const sel = selectedDays.includes(d);
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
                      onClick={() => toggleDay(d)}
                      title="Выбрать день для массового заполнения"
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
              {rows.map((r) => {
                const rowOn = selectedRows.has(r.employeeId);
                let total = 0;
                return (
                  <tr
                    key={r.employeeId}
                    className={rowOn ? styles.rowSelected : undefined}
                  >
                    <td className={styles.stickyCheck}>
                      <input
                        type="checkbox"
                        checked={rowOn}
                        onChange={() => toggleRow(r.employeeId)}
                      />
                    </td>
                    <td className={styles.stickyName}>
                      <div className={styles.fio}>{r.fullName}</div>
                      <div className={styles.muted}>{r.tabNumber}</div>
                    </td>
                    <td className={styles.stickyPos}>
                      <span className={styles.muted}>{r.position || '—'}</span>
                    </td>
                    <td className={styles.stickyDiv}>
                      <span className={styles.muted}>{r.division || '—'}</span>
                    </td>
                    <td className={styles.total}>
                      {(() => {
                        for (const c of r.cells) {
                          total += workValue(
                            effectiveCell(r, c, pending).status,
                          );
                        }
                        return fmtTotal(total);
                      })()}
                    </td>
                    {r.cells.map((c) => {
                      const eff = effectiveCell(r, c, pending);
                      const meta = statusMeta(eff.status);
                      const key = cellKey(r.employeeId, c.date);
                      const sel = selectedCells.has(key);
                      const isPend = Boolean(pending[key]);
                      return (
                        <td
                          key={c.date}
                          className={[
                            styles.cell,
                            sel ? styles.cellSelected : '',
                            isPend ? styles.cellPending : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onPointerDown={(e) =>
                            onCellPointerDown(e, r.employeeId, c.date)
                          }
                          onPointerEnter={() =>
                            onCellPointerEnter(r.employeeId, c.date)
                          }
                          title={`${meta.label}${
                            eff.lateMinutes
                              ? ` · ${eff.lateMinutes} мин`
                              : ''
                          }`}
                        >
                          <span
                            className={`${styles.cellBadge} ${styles[meta.cellClass as keyof typeof styles] || ''}`}
                          >
                            {cellShort(eff)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.legend}>
        {[...QUICK_STATUSES, ...SPECIAL_STATUSES, 'not_started' as CorrectionStatus].map(
          (st) => {
            const meta = statusMeta(st);
            return (
              <span key={st} className={styles.legendItem}>
                <span
                  className={`${styles.cellBadge} ${styles[meta.cellClass as keyof typeof styles] || ''}`}
                >
                  {meta.short}
                </span>
                {meta.short} — {meta.label}
                {meta.code ? ` (шаблон ${meta.code})` : ''}
              </span>
            );
          },
        )}
        <span className={styles.muted} style={{ marginLeft: 'auto' }}>
          Опоздание: в ячейке минуты; «Вовремя» сбрасывает опоздание
        </span>
      </div>

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
