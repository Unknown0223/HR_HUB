'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox, type PhotoLightboxApi } from '@/components/PhotoLightbox';
import styles from './page.module.css';

type AttRow = {
  employeeId: string;
  fullName: string;
  lastName?: string;
  firstName?: string;
  middleName?: string | null;
  tabNumber: string;
  photoUrl?: string | null;
  firstIn: string | null;
  lastOut: string | null;
  status: string;
  note?: string;
  email?: string | null;
  phone?: string | null;
};

type Birthday = {
  employeeId: string;
  fullName: string;
  tabNumber: string;
  birthDate: string;
  day: number;
  month: number;
  daysUntil: number;
  position?: string;
  photoUrl?: string | null;
};

type Stats = {
  date: string;
  headcount: number;
  dismissed: number;
  gph: number;
  divisions: number;
  attendance: {
    on_time: number;
    late: number;
    absent: number;
    not_started: number;
    leave: number;
    day_off: number;
    present: number;
    marksToday: number;
    pctOnTime: number;
    pctLate: number;
    pctAbsent: number;
    pctNotStarted?: number;
  };
  lists: {
    onTime: AttRow[];
    lateOrEarly: AttRow[];
    absent?: AttRow[];
    notStarted?: AttRow[];
    dayOff?: AttRow[];
    leave?: AttRow[];
  };
  birthdays?: Birthday[];
  devices: { online: number; total: number };
  workflow: {
    pendingRequests: number;
    pendingAbsences: number;
    openProblems: number;
  };
};

type Opt = { id: string; name: string };
type PieKind = 'all' | 'on_time' | 'late' | 'absent' | 'not_started';

type FilterSnapshot = {
  period: string;
  divisionIds: string[];
  positionIds: string[];
  scheduleIds: string[];
  gradeIds: string[];
  locationIds: string[];
};

type FilterTemplate = {
  id: string;
  name: string;
  filters: FilterSnapshot;
  createdAt: string;
};

const FILTER_TEMPLATE_KEY = 'hrhub.dashboard.filter_templates.v1';

function loadFilterTemplates(): FilterTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FILTER_TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FilterTemplate[];
    return Array.isArray(parsed) ? parsed.filter((t) => t?.id && t?.name && t?.filters) : [];
  } catch {
    return [];
  }
}

function saveFilterTemplates(items: FilterTemplate[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FILTER_TEMPLATE_KEY, JSON.stringify(items));
}

const PIE = [
  { kind: 'on_time' as const, label: 'Вовремя', color: '#06d6a0' },
  { kind: 'late' as const, label: 'Опоздали', color: '#ffd166' },
  { kind: 'absent' as const, label: 'Не пришли', color: '#ef476f' },
  { kind: 'not_started' as const, label: 'Рабочий день не начался', color: '#5e6278' },
];

const TABLE_STATUSES: { id: string; label: string }[] = [
  { id: 'not_started', label: 'Рабочий день не начался' },
  { id: 'leave', label: 'Отсутствие по причине' },
  { id: 'late', label: 'Опоздание' },
  { id: 'on_time', label: 'Вовремя' },
  { id: 'absent', label: 'Отсутствие' },
  { id: 'day_off', label: 'Выходной' },
  { id: 'holiday', label: 'Праздник' },
  { id: 'extra_off', label: 'Доп. выходной' },
  { id: 'non_working', label: 'Нерабочий день' },
  { id: 'no_pass', label: 'Нет подписки' },
  { id: 'no_schedule', label: 'График не задан' },
  { id: 'absent_request', label: 'Не пришел с запросом' },
];

const EXTRA_PARAMS: { id: string; label: string }[] = [
  { id: 'login', label: 'Логин' },
  { id: 'telegram', label: 'Телеграм' },
  { id: 'fingerprints', label: 'Отпечатки' },
  { id: 'code', label: 'Код' },
  { id: 'distance', label: 'Общее расстояние (км)' },
  { id: 'accessLevel', label: 'Уровень доступа' },
  { id: 'workStatus', label: 'Статус на работе' },
  { id: 'arrivalLocation', label: 'Локация прихода' },
  { id: 'tabNumber', label: 'Табельный номер' },
  { id: 'email', label: 'E-mail' },
  { id: 'firstName', label: 'Имя' },
];

const ALL_STATUS_IDS = () => new Set(TABLE_STATUSES.map((s) => s.id));

function extraField(r: AttRow, id: string) {
  switch (id) {
    case 'login':
    case 'email':
      return r.email || '';
    case 'telegram':
      return r.phone || '';
    case 'code':
    case 'tabNumber':
      return r.tabNumber || '';
    case 'id':
      return r.employeeId;
    case 'firstName':
      return r.firstName || '';
    case 'workStatus':
      return statusMeta(r.status, r.note).label;
    default:
      return '';
  }
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

function statusMeta(status: string, note?: string) {
  if (status === 'on_time' && !note) {
    return { label: 'Вовремя', color: '#06d6a0' };
  }
  if (status === 'late' || (status === 'on_time' && note)) {
    return { label: note?.includes('Ertaroq') ? 'Раньше ушел' : 'Опоздал', color: '#ffd166' };
  }
  if (status === 'absent') {
    return { label: 'Не пришел', color: '#ef476f' };
  }
  if (status === 'not_started') {
    return { label: 'Рабочий день не начался', color: '#5e6278' };
  }
  if (status === 'day_off') {
    return { label: 'Выходной', color: '#a3c4f3' };
  }
  if (status === 'leave') {
    return { label: 'Отсутствие по причине', color: '#ff9999' };
  }
  return { label: status, color: '#778da9' };
}

function nameParts(r: AttRow) {
  const last = (r.lastName || r.fullName.trim().split(/\s+/)[0] || '').toLocaleUpperCase('ru');
  const rest = (
    [r.firstName, r.middleName].filter(Boolean).join(' ') ||
    r.fullName.trim().split(/\s+/).slice(1).join(' ')
  ).toLocaleUpperCase('ru');
  return { last, rest };
}

const VIEW_MODES = [
  { id: 'chart' as const, label: 'Круговая диаграмма' },
  { id: 'list' as const, label: 'Список' },
];
type ViewMode = (typeof VIEW_MODES)[number]['id'];

function PersonCell({
  r,
  rows,
  lightbox,
}: {
  r: AttRow;
  rows: AttRow[];
  lightbox: PhotoLightboxApi;
}) {
  const parts = nameParts(r);
  const src = mediaSrc(r.photoUrl);
  const slides = rows
    .map((x) => ({ src: mediaSrc(x.photoUrl) || '', caption: x.fullName }))
    .filter((s) => s.src);
  const idx = src ? slides.findIndex((s) => s.src === src) : -1;
  return (
    <Link href={`/employees/${r.employeeId}`} className={styles.person}>
      {src ? (
        <PhotoThumb
          className={styles.avatarImg}
          src={src}
          alt=""
          lightbox={lightbox}
          slides={slides}
          index={idx < 0 ? 0 : idx}
        />
      ) : (
        <span className={styles.avatar} aria-hidden>
          {initials(r.fullName)}
        </span>
      )}
      <span className={styles.nameBlock}>
        <span className={styles.nameLast}>{parts.last}</span>
        {parts.rest ? <span className={styles.nameRest}>{parts.rest}</span> : null}
      </span>
    </Link>
  );
}

function AttendanceTable({
  rows,
  emptyDate,
  showStatus,
  lightbox,
}: {
  rows: AttRow[];
  emptyDate: string;
  showStatus: boolean;
  lightbox: PhotoLightboxApi;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>ФИО</th>
            <th className={styles.thCenter}>Приход</th>
            <th className={styles.thCenter}>Уход</th>
            {showStatus ? <th>Состояние</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={showStatus ? 4 : 3} className={styles.empty}>
                Нет данных за {emptyDate}
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const meta = statusMeta(r.status, r.note);
              return (
                <tr key={r.employeeId}>
                  <td>
                    <PersonCell r={r} rows={rows} lightbox={lightbox} />
                  </td>
                  <td className={styles.time}>{r.firstIn ?? '—'}</td>
                  <td className={styles.time}>{r.lastOut ?? '—'}</td>
                  {showStatus ? (
                    <td>
                      <span className={styles.state}>
                        <i className="fa fa-circle" style={{ color: meta.color }} aria-hidden />
                        <span style={{ color: meta.color }}>{meta.label}</span>
                      </span>
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function ViewPicker({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const current = VIEW_MODES.find((m) => m.id === value)?.label ?? '';
  const filtered = VIEW_MODES.filter((m) => m.label.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQ('');
      }
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  return (
    <div className={styles.typeSearch} ref={rootRef}>
      <input
        className={styles.typeInput}
        placeholder="Поиск..."
        value={open ? q : current}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        aria-label="Вид"
        aria-expanded={open}
      />
      <button
        type="button"
        className={styles.typeClear}
        onClick={() => setOpen((v) => !v)}
        aria-label="Открыть вид"
      >
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
      </button>
      {open ? (
        <div className={styles.typeMenu}>
          {filtered.length === 0 ? (
            <div className={styles.typeEmpty}>Нет совпадений</div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className={m.id === value ? styles.typeItemOn : styles.typeItem}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                  setQ('');
                }}
              >
                {m.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function donutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startAngle);
  const p2 = polar(cx, cy, rOuter, endAngle);
  const p3 = polar(cx, cy, rInner, endAngle);
  const p4 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

function DonutChart({
  segments,
  total,
}: {
  segments: { value: number; color: string; label: string }[];
  total: number;
}) {
  const cx = 160;
  const cy = 150;
  const rOuter = 118;
  const rInner = 72;
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  let angle = 0;
  const paths = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = (s.value / sum) * 360;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const mid = start + sweep / 2;
      const labelPos = polar(cx, cy, (rOuter + rInner) / 2 + 28, mid);
      return { ...s, d: donutSlice(cx, cy, rOuter, rInner, start, end - 0.01), labelPos, mid };
    });

  return (
    <svg className={styles.donutSvg} viewBox="0 0 320 300" role="img" aria-label="Статистика посещений">
      {paths.length === 0 ? (
        <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="#ced4da" strokeWidth={rOuter - rInner} />
      ) : (
        paths.map((p) => (
          <g key={p.label} className={styles.donutSeg}>
            <title>
              {p.label}: {p.value}
            </title>
            <path d={p.d} fill={p.color} stroke="#fff" strokeWidth={2} />
            <text
              x={p.labelPos.x}
              y={p.labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className={styles.donutSliceLabel}
            >
              {p.value}
            </text>
          </g>
        ))
      )}
      <circle cx={cx} cy={cy} r={rInner - 2} fill="#fff" />
      <text x={cx} y={cy - 8} textAnchor="middle" className={styles.donutCenterNum}>
        {total}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" className={styles.donutCenterCap}>
        сотрудник(ов)
      </text>
    </svg>
  );
}

function formatPeriodButton(dateIso?: string) {
  if (!dateIso) return 'Выбрать дату';
  const d = new Date(dateIso + 'T12:00:00');
  const month = d.toLocaleDateString('ru-RU', { month: 'long' });
  const text = `${month} ${d.getDate()}, ${d.getFullYear()}`;
  return `${text} - ${text}`;
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => {
    const d = value ? new Date(value + 'T12:00:00') : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [value]);
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  const monthLabel = view.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const first = new Date(year, month, 1);
    // Monday-first
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - startOffset);
    const out: { date: Date; inMonth: boolean; ymd: string }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      out.push({
        date: d,
        inMonth: d.getMonth() === month,
        ymd: toYmd(d),
      });
    }
    return out;
  }, [view]);

  const todayYmd = toYmd(new Date());

  return (
    <div className={styles.periodWrap} ref={rootRef}>
      <button
        type="button"
        className={styles.periodBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={styles.periodBtnLeft}>
          <i className="fa fa-calendar" aria-hidden />
          <span>{formatPeriodButton(value)}</span>
        </span>
        <i className="fa fa-angle-down" aria-hidden />
      </button>

      {open ? (
        <div className={styles.calPopup} role="dialog" aria-label="Выбор периода">
          <div className={styles.calHeader}>
            <button
              type="button"
              className={styles.calNav}
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
              aria-label="Предыдущий месяц"
            >
              <i className="fas fa-chevron-up" aria-hidden />
            </button>
            <div className={styles.calMonth}>{monthLabel}</div>
            <button
              type="button"
              className={styles.calNav}
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
              aria-label="Следующий месяц"
            >
              <i className="fas fa-chevron-down" aria-hidden />
            </button>
          </div>

          <div className={styles.calWeekdays}>
            {weekdays.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className={styles.calGrid}>
            {cells.map((cell) => {
              const isSelected = cell.ymd === value;
              const isToday = cell.ymd === todayYmd;
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  className={[
                    styles.calDay,
                    cell.inMonth ? '' : styles.calDayMuted,
                    isSelected ? styles.calDaySelected : '',
                    isToday && !isSelected ? styles.calDayToday : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onChange(cell.ymd);
                    setOpen(false);
                  }}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className={styles.calFooter}>
            <button
              type="button"
              className={styles.calLink}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Очистить
            </button>
            <button
              type="button"
              className={styles.calLink}
              onClick={() => {
                onChange(todayYmd);
                setOpen(false);
              }}
            >
              Сегодня
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatBirthday(b: Birthday) {
  if (b.daysUntil === 0) return 'сегодня';
  const d = new Date(Date.UTC(2000, b.month - 1, b.day));
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const GRID_TPL_KEY = 'hrhub.dashboard.grid-filter-templates';

type GridTpl = {
  id: string;
  name: string;
  nameQ: string;
  statuses: string[];
  extras: string[];
  extraValues: Record<string, string>;
};

function loadGridTpls(): GridTpl[] {
  try {
    const raw = localStorage.getItem(GRID_TPL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGridTpls(items: GridTpl[]) {
  localStorage.setItem(GRID_TPL_KEY, JSON.stringify(items));
}

function GridFilterPop({
  open,
  nameQ,
  statuses,
  extras,
  extraValues,
  onNameQ,
  onToggleStatus,
  onToggleExtra,
  onExtraValue,
  onRemoveExtra,
  onApply,
  onShowAll,
  onDefault,
  onResetStatuses,
  onLoadTpl,
  onClose,
}: {
  open: boolean;
  nameQ: string;
  statuses: Set<string>;
  extras: Set<string>;
  extraValues: Record<string, string>;
  onNameQ: (v: string) => void;
  onToggleStatus: (id: string) => void;
  onToggleExtra: (id: string) => void;
  onExtraValue: (id: string, v: string) => void;
  onRemoveExtra: (id: string) => void;
  onApply: () => void;
  onShowAll: () => void;
  onDefault: () => void;
  onResetStatuses: () => void;
  onLoadTpl: (tpl: GridTpl) => void;
  onClose: () => void;
}) {
  const [paramOpen, setParamOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [templates, setTemplates] = useState<GridTpl[]>([]);
  const paramRef = useRef<HTMLDivElement>(null);
  const tplRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setParamOpen(false);
      setTplOpen(false);
      setCreating(false);
      return;
    }
    setTemplates(loadGridTpls());
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (paramOpen) {
        setParamOpen(false);
        return;
      }
      if (tplOpen) {
        setTplOpen(false);
        setCreating(false);
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, paramOpen, tplOpen, onClose]);

  useEffect(() => {
    if (!paramOpen && !tplOpen) return;
    function closeMenus(event: PointerEvent) {
      const target = event.target as Node;
      if (paramOpen && !paramRef.current?.contains(target)) setParamOpen(false);
      if (tplOpen && !tplRef.current?.contains(target)) {
        setTplOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, [paramOpen, tplOpen]);

  if (!open) return null;

  function persist(next: GridTpl[]) {
    setTemplates(next);
    saveGridTpls(next);
  }

  function saveTpl() {
    const name = newName.trim();
    if (!name) return;
    const item: GridTpl = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      nameQ,
      statuses: [...statuses],
      extras: [...extras],
      extraValues: { ...extraValues },
    };
    persist([item, ...templates.filter((t) => t.name.toLowerCase() !== name.toLowerCase())]);
    setCreating(false);
    setNewName('');
    setTplOpen(false);
  }

  return (
    <div
      className={styles.gridFilterOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.gridFilterModal}
        role="dialog"
        aria-modal="true"
        aria-label="Фильтр"
      >
        <div className={styles.gridFilterHead}>
          <span>Фильтр</span>
          <button
            type="button"
            className={styles.gridFilterClose}
            title="Закрыть"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <i className="fas fa-times" aria-hidden />
          </button>
        </div>

        <div className={styles.gridFilterTools}>
          <div className={styles.tplWrap} ref={tplRef}>
            <button
              type="button"
              className={styles.tplBtn}
              onClick={() => {
                setTplOpen((v) => !v);
                setParamOpen(false);
              }}
              aria-expanded={tplOpen}
            >
              Шаблон <i className="fa fa-angle-down" aria-hidden />
            </button>
            {tplOpen ? (
              <div className={styles.tplMenu} role="menu">
                {!creating ? (
                  <button
                    type="button"
                    className={styles.tplMenuItem}
                    onClick={() => {
                      setCreating(true);
                      setNewName('');
                    }}
                  >
                    <i className="fas fa-save" aria-hidden />
                    <span>Новый шаблон</span>
                  </button>
                ) : (
                  <div className={styles.tplCreateBox}>
                    <input
                      type="text"
                      className={styles.tplNameInput}
                      placeholder="Название шаблона"
                      value={newName}
                      maxLength={100}
                      autoFocus
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveTpl();
                        if (e.key === 'Escape') {
                          setCreating(false);
                          setNewName('');
                        }
                      }}
                    />
                    <div className={styles.tplCreateActions}>
                      <button
                        type="button"
                        className={styles.tplSaveBtn}
                        onClick={saveTpl}
                        disabled={!newName.trim()}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className={styles.tplCancelBtn}
                        onClick={() => {
                          setCreating(false);
                          setNewName('');
                        }}
                      >
                        Отменить
                      </button>
                    </div>
                  </div>
                )}
                {templates.length > 0 ? <div className={styles.tplDivider} /> : null}
                {templates.length === 0 && !creating ? (
                  <div className={styles.tplEmpty}>Нет сохранённых шаблонов</div>
                ) : null}
                {templates.map((item) => (
                  <div key={item.id} className={styles.tplMenuRow}>
                    <button
                      type="button"
                      className={styles.tplMenuItem}
                      onClick={() => {
                        onLoadTpl(item);
                        setTplOpen(false);
                      }}
                    >
                      <i className="fas fa-filter" aria-hidden />
                      <span>{item.name}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.tplDeleteBtn}
                      title="Удалить"
                      aria-label={`Удалить ${item.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        persist(templates.filter((t) => t.id !== item.id));
                      }}
                    >
                      <i className="fas fa-times" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.gridFilterToolsRight}>
            <button type="button" className={styles.defaultBtn} onClick={onDefault}>
              <i className="fas fa-undo" aria-hidden /> По умолчанию
            </button>
            <div className={styles.paramWrap} ref={paramRef}>
              <button
                type="button"
                className={styles.paramBtn}
                onClick={() => {
                  setParamOpen((v) => !v);
                  setTplOpen(false);
                }}
              >
                Добавить параметры +
              </button>
              {paramOpen ? (
                <div className={styles.paramMenu}>
                  {EXTRA_PARAMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={extras.has(p.id) ? styles.paramItemOn : styles.paramItem}
                      onClick={() => onToggleExtra(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.gridFilterBody}>
          <div className={styles.filterRow}>
            <span className={styles.filterRowGrip} aria-hidden>
              <i className="fas fa-grip-vertical" />
            </span>
            <div className={styles.filterRowMain}>
              <div className={styles.filterRowLabel}>ФИО</div>
              <label className={styles.fioBox}>
                <i className="fa fa-search" aria-hidden />
                <input
                  value={nameQ}
                  onChange={(e) => onNameQ(e.target.value)}
                  placeholder="Поиск..."
                />
              </label>
            </div>
            <button
              type="button"
              className={styles.filterRowRemove}
              title="Очистить"
              aria-label="Очистить ФИО"
              onClick={() => onNameQ('')}
            >
              <i className="fas fa-times" aria-hidden />
            </button>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterRowGrip} aria-hidden>
              <i className="fas fa-grip-vertical" />
            </span>
            <div className={styles.filterRowMain}>
              <div className={styles.filterRowLabel}>Состояние</div>
              <div className={styles.statusChecks}>
                {TABLE_STATUSES.map((s) => (
                  <label key={s.id} className={styles.statusCheck}>
                    <input
                      type="checkbox"
                      checked={statuses.has(s.id)}
                      onChange={() => onToggleStatus(s.id)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              className={styles.filterRowRemove}
              title="Сбросить"
              aria-label="Сбросить состояние"
              onClick={onResetStatuses}
            >
              <i className="fas fa-times" aria-hidden />
            </button>
          </div>

          {[...extras].map((id) => {
            const meta = EXTRA_PARAMS.find((p) => p.id === id);
            if (!meta) return null;
            return (
              <div key={id} className={styles.filterRow}>
                <span className={styles.filterRowGrip} aria-hidden>
                  <i className="fas fa-grip-vertical" />
                </span>
                <div className={styles.filterRowMain}>
                  <div className={styles.filterRowLabel}>{meta.label}</div>
                  <label className={styles.fioBox}>
                    <i className="fa fa-search" aria-hidden />
                    <input
                      value={extraValues[id] || ''}
                      onChange={(e) => onExtraValue(id, e.target.value)}
                      placeholder="Поиск..."
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className={styles.filterRowRemove}
                  title="Удалить"
                  aria-label={`Удалить ${meta.label}`}
                  onClick={() => onRemoveExtra(id)}
                >
                  <i className="fas fa-times" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>

        <div className={styles.gridFilterFoot}>
          <button type="button" className={styles.filterApply} onClick={onApply}>
            Применить
          </button>
          <button type="button" className={styles.filterGhost} onClick={onShowAll}>
            Показать все
          </button>
          <button type="button" className={styles.filterGhost} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.name.toLowerCase().includes(needle));
  }, [options, q]);

  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  return (
    <div className={styles.formGroup} ref={rootRef}>
      <label>{label}</label>
      <div className={open ? styles.multiBoxOpen : styles.multiBox}>
        <input
          type="text"
          placeholder={selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
          className={styles.multiInput}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
          aria-label={`Поиск: ${label}`}
          aria-expanded={open}
        />
        <button
          type="button"
          className={styles.multiToggle}
          onClick={() => setOpen((value) => !value)}
          aria-label={`${open ? 'Закрыть' : 'Открыть'}: ${label}`}
          aria-expanded={open}
        >
          <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
        </button>
      </div>
      {selected.length > 0 && !open ? (
        <div className={styles.chipRow}>
          {selected.map((id) => {
            const opt = options.find((o) => o.id === id);
            return (
              <button
                key={id}
                type="button"
                className={styles.chip}
                onClick={() => toggle(id)}
                title="Убрать"
              >
                {opt?.name ?? id} <span aria-hidden>×</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className={open ? styles.optionSlideOpen : styles.optionSlide}>
        <div className={styles.optionSlideInner}>
          <div className={styles.optList}>
            {filtered.map((o) => (
              <label key={o.id} className={styles.optItem}>
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                />
                <span>{o.name}</span>
              </label>
            ))}
            {filtered.length === 0 ? (
              <span className={styles.optEmpty}>Нет вариантов</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterTemplateMenu({
  snapshot,
  activeName,
  onApply,
  onActiveNameChange,
}: {
  snapshot: FilterSnapshot;
  activeName: string;
  onApply: (filters: FilterSnapshot) => void;
  onActiveNameChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [templates, setTemplates] = useState<FilterTemplate[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTemplates(loadFilterTemplates());
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
      }
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  function persist(next: FilterTemplate[]) {
    setTemplates(next);
    saveFilterTemplates(next);
  }

  function startCreate(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setCreating(true);
    setNewName('');
  }

  function cancelCreate() {
    setCreating(false);
    setNewName('');
  }

  function saveNew() {
    const name = newName.trim();
    if (!name) return;
    if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    const item: FilterTemplate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      filters: {
        period: snapshot.period,
        divisionIds: [...snapshot.divisionIds],
        positionIds: [...snapshot.positionIds],
        scheduleIds: [...snapshot.scheduleIds],
        gradeIds: [...snapshot.gradeIds],
        locationIds: [...snapshot.locationIds],
      },
      createdAt: new Date().toISOString(),
    };
    persist([item, ...templates]);
    onActiveNameChange(name);
    setCreating(false);
    setNewName('');
    setOpen(false);
  }

  function selectTemplate(item: FilterTemplate) {
    onApply({ ...item.filters });
    onActiveNameChange(item.name);
    setOpen(false);
    setCreating(false);
  }

  function removeTemplate(id: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const target = templates.find((t) => t.id === id);
    const next = templates.filter((t) => t.id !== id);
    persist(next);
    if (target && activeName === target.name) {
      onActiveNameChange('');
    }
  }

  return (
    <div className={styles.tplWrap} ref={rootRef}>
      <button
        type="button"
        className={styles.tplBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {activeName || 'Шаблон'} <i className="fa fa-angle-down" aria-hidden />
      </button>
      {open ? (
        <div className={styles.tplMenu} role="menu">
          {!creating ? (
            <button type="button" className={styles.tplMenuItem} onClick={startCreate}>
              <i className="fas fa-save" aria-hidden />
              <span>Новый шаблон</span>
            </button>
          ) : (
            <div className={styles.tplCreateBox}>
              <input
                type="text"
                className={styles.tplNameInput}
                placeholder="Название шаблона"
                value={newName}
                maxLength={100}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveNew();
                  if (e.key === 'Escape') cancelCreate();
                }}
              />
              <div className={styles.tplCreateActions}>
                <button
                  type="button"
                  className={styles.tplSaveBtn}
                  onClick={saveNew}
                  disabled={!newName.trim()}
                >
                  Сохранить
                </button>
                <button type="button" className={styles.tplCancelBtn} onClick={cancelCreate}>
                  Отменить
                </button>
              </div>
            </div>
          )}

          {templates.length > 0 ? <div className={styles.tplDivider} /> : null}

          {templates.length === 0 && !creating ? (
            <div className={styles.tplEmpty}>Нет сохранённых шаблонов</div>
          ) : null}

          {templates.map((item) => (
            <div
              key={item.id}
              className={
                activeName === item.name ? styles.tplMenuRowActive : styles.tplMenuRow
              }
            >
              <button
                type="button"
                className={styles.tplMenuItem}
                onClick={() => selectTemplate(item)}
              >
                <i className="fas fa-filter" aria-hidden />
                <span>{item.name}</span>
              </button>
              <button
                type="button"
                className={styles.tplDeleteBtn}
                title="Удалить"
                aria-label={`Удалить ${item.name}`}
                onClick={(e) => removeTemplate(item.id, e)}
              >
                <i className="fas fa-times" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const photos = usePhotoLightbox();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterKind, setFilterKind] = useState<PieKind>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [gridFilterOpen, setGridFilterOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftStatuses, setDraftStatuses] = useState<Set<string>>(() => new Set(TABLE_STATUSES.map((s) => s.id)));
  const [appliedName, setAppliedName] = useState('');
  const [appliedStatuses, setAppliedStatuses] = useState<Set<string>>(
    () => new Set(TABLE_STATUSES.map((s) => s.id)),
  );
  const [draftExtras, setDraftExtras] = useState<Set<string>>(new Set());
  const [draftExtraValues, setDraftExtraValues] = useState<Record<string, string>>({});
  const [appliedExtras, setAppliedExtras] = useState<Set<string>>(new Set());
  const [appliedExtraValues, setAppliedExtraValues] = useState<Record<string, string>>({});

  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 10));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [scheduleIds, setScheduleIds] = useState<string[]>([]);
  const [gradeIds, setGradeIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [activeTemplateName, setActiveTemplateName] = useState('');
  const [pendingReload, setPendingReload] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);

  const filterSnapshot = useMemo<FilterSnapshot>(
    () => ({
      period,
      divisionIds,
      positionIds,
      scheduleIds,
      gradeIds,
      locationIds,
    }),
    [period, divisionIds, positionIds, scheduleIds, gradeIds, locationIds],
  );

  function applyTemplateFilters(filters: FilterSnapshot) {
    setPeriod(filters.period || new Date().toISOString().slice(0, 10));
    setDivisionIds(filters.divisionIds ?? []);
    setPositionIds(filters.positionIds ?? []);
    setScheduleIds(filters.scheduleIds ?? []);
    setGradeIds(filters.gradeIds ?? []);
    setLocationIds(filters.locationIds ?? []);
    setPendingReload(true);
  }

  const closeGridFilter = useCallback(() => setGridFilterOpen(false), []);

  const gridFilterActive =
    !!appliedName.trim() ||
    appliedStatuses.size < TABLE_STATUSES.length ||
    [...appliedExtras].some((id) => (appliedExtraValues[id] || '').trim());

  function toggleGridFilter() {
    setDraftName(appliedName);
    setDraftStatuses(new Set(appliedStatuses));
    setDraftExtras(new Set(appliedExtras));
    setDraftExtraValues({ ...appliedExtraValues });
    setGridFilterOpen((v) => !v);
  }

  function applyGridFilter() {
    setAppliedName(draftName);
    setAppliedStatuses(new Set(draftStatuses));
    setAppliedExtras(new Set(draftExtras));
    setAppliedExtraValues({ ...draftExtraValues });
    setSearch(draftName);
    setGridFilterOpen(false);
  }

  function showAllGridFilter() {
    const all = ALL_STATUS_IDS();
    setDraftStatuses(all);
    setDraftName('');
    setDraftExtras(new Set());
    setDraftExtraValues({});
    setAppliedStatuses(all);
    setAppliedName('');
    setAppliedExtras(new Set());
    setAppliedExtraValues({});
    setSearch('');
    setGridFilterOpen(false);
  }

  function defaultGridFilter() {
    setDraftName('');
    setDraftStatuses(ALL_STATUS_IDS());
    setDraftExtras(new Set());
    setDraftExtraValues({});
  }

  useEffect(() => {
    apiFetch<Opt[]>('/api/organization/divisions')
      .then((rows) => setDivisions(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => undefined);
    apiFetch<Opt[]>('/api/organization/positions')
      .then((rows) => setPositions(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => undefined);
    apiFetch<Opt[]>('/api/attendance/schedules')
      .then((rows) => setSchedules(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => undefined);
    apiFetch<Opt[]>('/api/attendance/locations')
      .then((rows) => setLocations(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => undefined);
    apiFetch<{ id: string; name: string }[]>('/api/catalog/grades')
      .then((rows) => setGrades((rows ?? []).map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => undefined);
  }, []);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (period) p.set('date', period);
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (scheduleIds.length) p.set('scheduleIds', scheduleIds.join(','));
    if (gradeIds.length) p.set('gradeIds', gradeIds.join(','));
    if (locationIds.length) p.set('locationIds', locationIds.join(','));
    const qs = p.toString();
    return qs ? `?${qs}` : '';
  }, [period, divisionIds, positionIds, scheduleIds, gradeIds, locationIds]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiFetch<Stats>(`/api/dashboard/stats${buildQuery()}`)
      .then((data) => {
        setStats(data);
        // Do NOT setPeriod(data.date) — UTC ISO dates caused an infinite
        // backward date walk (period → API → period-1 → … → 2015…).
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [buildQuery]);

  // Initial load only — filter changes apply via ОБНОВИТЬ (Verifix UX).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Template tanlanganda filtr state yangilangach avtomatik Обновить
  useEffect(() => {
    if (!pendingReload) return;
    setPendingReload(false);
    load();
  }, [pendingReload, load]);

  const a = stats?.attendance;
  const headcount = stats?.headcount ?? 0;
  const onTimeN = a?.on_time ?? 0;
  const lateN = a?.late ?? 0;
  const absentN = a?.absent ?? 0;
  const notStartedN = a?.not_started ?? 0;

  const pieSegments = useMemo(
    () => [
      { value: onTimeN, color: PIE[0].color, label: PIE[0].label },
      { value: lateN, color: PIE[1].color, label: PIE[1].label },
      { value: absentN, color: PIE[2].color, label: PIE[2].label },
      { value: notStartedN, color: PIE[3].color, label: PIE[3].label },
    ],
    [onTimeN, lateN, absentN, notStartedN],
  );

  const pieTotal = onTimeN + lateN + absentN + notStartedN || headcount;

  const legend = [
    { ...PIE[0], count: onTimeN, pct: pct(onTimeN, pieTotal || headcount) },
    { ...PIE[1], count: lateN, pct: pct(lateN, pieTotal || headcount) },
    { ...PIE[2], count: absentN, pct: pct(absentN, pieTotal || headcount) },
    { ...PIE[3], count: notStartedN, pct: pct(notStartedN, pieTotal || headcount) },
  ];

  const allRows = useMemo(() => {
    const onTime = stats?.lists?.onTime ?? [];
    const late = stats?.lists?.lateOrEarly ?? [];
    const absent = stats?.lists?.absent ?? [];
    const notStarted = stats?.lists?.notStarted ?? [];
    const dayOff = stats?.lists?.dayOff ?? [];
    const leave = stats?.lists?.leave ?? [];
    return [...onTime, ...late, ...absent, ...notStarted, ...dayOff, ...leave].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'ru'),
    );
  }, [stats]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (filterKind === 'on_time') {
      rows = rows.filter((r) => r.status === 'on_time' && !r.note);
    } else if (filterKind === 'late') {
      rows = rows.filter((r) => r.status === 'late' || !!r.note);
    } else if (filterKind === 'absent') {
      rows = rows.filter((r) => r.status === 'absent');
    } else if (filterKind === 'not_started') {
      rows = rows.filter((r) => r.status === 'not_started');
    }
    if (appliedStatuses.size && appliedStatuses.size < TABLE_STATUSES.length) {
      rows = rows.filter((r) => appliedStatuses.has(r.status === 'on_time' && r.note ? 'late' : r.status));
    }
    const q = (appliedName || search).trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.tabNumber.toLowerCase().includes(q),
      );
    }
    for (const id of appliedExtras) {
      const val = (appliedExtraValues[id] || '').trim().toLowerCase();
      if (!val) continue;
      const hasData = rows.some((r) => extraField(r, id).trim());
      if (!hasData) continue;
      rows = rows.filter((r) => extraField(r, id).toLowerCase().includes(val));
    }
    return rows;
  }, [allRows, filterKind, search, appliedName, appliedStatuses, appliedExtras, appliedExtraValues]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageSafe = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const birthdays = stats?.birthdays ?? [];
  const birthdaySlides = birthdays
    .map((b) => ({ src: mediaSrc(b.photoUrl) || '', caption: b.fullName }))
    .filter((s) => s.src);

  useEffect(() => {
    setPage(1);
  }, [filterKind, search, appliedName, appliedStatuses, appliedExtras, appliedExtraValues]);

  return (
    <div className={styles.wrap}>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={sideOpen ? styles.layout : styles.layoutWide}>
        <div className={styles.mainCol}>
          {sideOpen ? null : (
            <button
              type="button"
              className={styles.sideReopen}
              title="Показать фильтр"
              aria-label="Показать фильтр"
              onClick={() => setSideOpen(true)}
            >
              <i className="fas fa-chevron-left" aria-hidden />
            </button>
          )}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h1 className={styles.cardTitle}>Статистика посещений сотрудников</h1>
              <ViewPicker value={viewMode} onChange={setViewMode} />
            </div>

            <div className={styles.cardBody}>
              {viewMode === 'list' ? (
                <>
                  <div className={styles.badges}>
                    <button
                      type="button"
                      className={filterKind === 'all' ? styles.badgeOn : styles.badge}
                      onClick={() => setFilterKind('all')}
                    >
                      Все
                    </button>
                    {legend.map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        className={filterKind === item.kind ? styles.badgeOn : styles.badge}
                        onClick={() => setFilterKind((k) => (k === item.kind ? 'all' : item.kind))}
                      >
                        <span className={styles.badgeDot} style={{ background: item.color }} />
                        {item.count} {item.kind === 'late' ? 'Опоздал' : item.kind === 'absent' ? 'Не пришел' : item.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.tableCol}>
                      <div className={styles.gridController}>
                        <input
                          type="search"
                          className={styles.gridSearch}
                          placeholder="Поиск..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <div className={styles.gridAppend}>
                          <button
                            type="button"
                            data-grid-filter-toggle
                            className={
                              gridFilterOpen || gridFilterActive
                                ? styles.gridIconBtnOn
                                : styles.gridIconBtn
                            }
                            title="Фильтр"
                            aria-label="Фильтр"
                            onClick={toggleGridFilter}
                          >
                            <i className="fa fa-filter" aria-hidden />
                          </button>
                          <button type="button" className={styles.gridIconBtn} title="Закрепить" aria-label="Закрепить">
                            <i className="fa fa-thumbtack" aria-hidden />
                          </button>
                          <span className={styles.gridLimit}>
                            <i className="fas fa-arrow-down" aria-hidden /> {pageSize} / {filteredRows.length}
                          </span>
                          <div className={styles.pageList}>
                            <button
                              type="button"
                              className={styles.pageChev}
                              disabled={pageSafe <= 1}
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              aria-label="Предыдущая"
                            >
                              <i className="fas fa-chevron-left" aria-hidden />
                            </button>
                            {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                              const n = i + 1;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  className={n === pageSafe ? styles.pageNumActive : styles.pageNum}
                                  onClick={() => setPage(n)}
                                >
                                  {n}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              className={styles.pageChev}
                              disabled={pageSafe >= pageCount}
                              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                              aria-label="Следующая"
                            >
                              <i className="fas fa-chevron-right" aria-hidden />
                            </button>
                          </div>
                          <button
                            type="button"
                            className={styles.gridIconBtn}
                            title="Обновить"
                            aria-label="Обновить"
                            onClick={load}
                            disabled={loading}
                          >
                            <i className={`fas fa-redo${loading ? ` ${styles.spin}` : ''}`} aria-hidden />
                          </button>
                          <button type="button" className={styles.gridIconBtn} title="Меню" aria-label="Меню">
                            <i className="fas fa-bars" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <AttendanceTable
                        rows={pageRows}
                        emptyDate={stats?.date ?? 'сегодня'}
                        showStatus={false}
                        lightbox={photos}
                      />
                    </div>
                </>
              ) : (
              <div className={styles.chartRow}>
                <div className={styles.chartCol}>
                  <div className={styles.donutWrap}>
                    <DonutChart segments={pieSegments} total={headcount || pieTotal} />
                  </div>
                  <div className={styles.legend}>
                    {legend.map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        className={
                          filterKind === item.kind ? styles.legendItemActive : styles.legendItem
                        }
                        onClick={() =>
                          setFilterKind((k) => (k === item.kind ? 'all' : item.kind))
                        }
                      >
                        <span className={styles.legendDot} style={{ background: item.color }} />
                        <span className={styles.legendText}>
                          <strong>{item.pct}%</strong>
                          <small>{item.label}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.tableCol}>
                  <div className={styles.gridController}>
                    <input
                      type="search"
                      className={styles.gridSearch}
                      placeholder="Поиск..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className={styles.gridAppend}>
                      <button
                        type="button"
                        data-grid-filter-toggle
                        className={
                          gridFilterOpen || gridFilterActive
                            ? styles.gridIconBtnOn
                            : styles.gridIconBtn
                        }
                        title="Фильтр"
                        aria-label="Фильтр"
                        onClick={toggleGridFilter}
                      >
                        <i className="fa fa-filter" aria-hidden />
                      </button>
                      <button type="button" className={styles.gridIconBtn} title="Закрепить" aria-label="Закрепить">
                        <i className="fa fa-thumbtack" aria-hidden />
                      </button>
                      <span className={styles.gridLimit}>
                        <i className="fas fa-arrow-down" aria-hidden /> {pageSize} / {filteredRows.length}
                      </span>
                      <div className={styles.pageList}>
                        <button
                          type="button"
                          className={styles.pageChev}
                          disabled={pageSafe <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          aria-label="Предыдущая"
                        >
                          <i className="fas fa-chevron-left" aria-hidden />
                        </button>
                        {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                          const n = i + 1;
                          return (
                            <button
                              key={n}
                              type="button"
                              className={n === pageSafe ? styles.pageNumActive : styles.pageNum}
                              onClick={() => setPage(n)}
                            >
                              {n}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className={styles.pageChev}
                          disabled={pageSafe >= pageCount}
                          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                          aria-label="Следующая"
                        >
                          <i className="fas fa-chevron-right" aria-hidden />
                        </button>
                      </div>
                      <button
                        type="button"
                        className={styles.gridIconBtn}
                        title="Обновить"
                        aria-label="Обновить"
                        onClick={load}
                        disabled={loading}
                      >
                        <i className={`fas fa-redo${loading ? ` ${styles.spin}` : ''}`} aria-hidden />
                      </button>
                      <button type="button" className={styles.gridIconBtn} title="Меню" aria-label="Меню">
                        <i className="fas fa-bars" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <AttendanceTable
                    rows={pageRows}
                    emptyDate={stats?.date ?? 'сегодня'}
                    showStatus
                    lightbox={photos}
                  />
                </div>
              </div>
              )}
            </div>
          </section>
        </div>

        {sideOpen ? (
        <aside className={styles.sideCol}>
          <button
            type="button"
            className={styles.sideCollapse}
            title="Скрыть фильтр"
            aria-label="Скрыть фильтр"
            onClick={() => setSideOpen(false)}
          >
            <i className="fas fa-chevron-right" aria-hidden />
          </button>
          <section className={styles.sideCard}>
            <div className={styles.sideCardHeader}>
              <h2 className={styles.sideCardTitle}>Фильтр</h2>
              <div className={styles.filterToolbar}>
                <FilterTemplateMenu
                  snapshot={filterSnapshot}
                  activeName={activeTemplateName}
                  onApply={applyTemplateFilters}
                  onActiveNameChange={setActiveTemplateName}
                />
                <button
                  type="button"
                  className={styles.syncBtn}
                  title="Обновить"
                  aria-label="Обновить"
                  onClick={load}
                >
                  <i className={`fas fa-sync${loading ? ` ${styles.spin}` : ''}`} aria-hidden />
                </button>
              </div>
            </div>
            <div className={styles.filterBody}>
              <div className={styles.formGroup}>
                <label>Период</label>
                <PeriodPicker value={period} onChange={(iso) => setPeriod(iso || toYmd(new Date()))} />
              </div>
              <MultiFilter
                label="Подразделения"
                options={divisions}
                selected={divisionIds}
                onChange={setDivisionIds}
              />
              <MultiFilter
                label="Должности"
                options={positions}
                selected={positionIds}
                onChange={setPositionIds}
              />
              <MultiFilter
                label="Рабочие графики"
                options={schedules}
                selected={scheduleIds}
                onChange={setScheduleIds}
              />
              <MultiFilter
                label="Разряды"
                options={grades}
                selected={gradeIds}
                onChange={setGradeIds}
              />
              <MultiFilter
                label="Локации"
                options={locations}
                selected={locationIds}
                onChange={setLocationIds}
              />
              <button
                type="button"
                className={styles.refreshBtn}
                onClick={load}
                disabled={loading}
              >
                Обновить
              </button>
            </div>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideCardHeader}>
              <h2 className={styles.sideCardTitle}>Дни рождения</h2>
            </div>
            <div className={styles.birthdayBody}>
              {birthdays.length === 0 ? (
                <div className={styles.birthdayEmpty}>
                  <i className="fa fa-gift" aria-hidden />
                  <p>Здесь Вы будете видеть дни рождения коллег</p>
                </div>
              ) : (
                <ul className={styles.birthdayList}>
                  {birthdays.map((b) => (
                    <li key={b.employeeId} className={styles.birthdayItem}>
                      <Link href={`/employees/${b.employeeId}`} className={styles.birthdayLink}>
                        {mediaSrc(b.photoUrl) ? (
                          <PhotoThumb
                            className={styles.birthdayAvatarImg}
                            src={mediaSrc(b.photoUrl) || ''}
                            alt=""
                            lightbox={photos}
                            slides={birthdaySlides}
                            index={Math.max(
                              0,
                              birthdaySlides.findIndex((s) => s.src === mediaSrc(b.photoUrl)),
                            )}
                          />
                        ) : (
                          <span className={styles.birthdayAvatar} aria-hidden>
                            {initials(b.fullName)}
                          </span>
                        )}
                        <span className={styles.birthdayMeta}>
                          <strong>{b.fullName}</strong>
                          {b.position ? <span className={styles.birthdayRole}>{b.position}</span> : null}
                        </span>
                        <span
                          className={
                            b.daysUntil === 0 ? styles.birthdayWhenToday : styles.birthdayWhen
                          }
                        >
                          {formatBirthday(b)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
        ) : null}
      </div>

      <GridFilterPop
        open={gridFilterOpen}
        nameQ={draftName}
        statuses={draftStatuses}
        extras={draftExtras}
        extraValues={draftExtraValues}
        onNameQ={setDraftName}
        onToggleStatus={(id) => {
          const next = new Set(draftStatuses);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setDraftStatuses(next);
        }}
        onToggleExtra={(id) => {
          const next = new Set(draftExtras);
          if (next.has(id)) {
            next.delete(id);
            setDraftExtraValues((prev) => {
              const copy = { ...prev };
              delete copy[id];
              return copy;
            });
          } else {
            next.add(id);
          }
          setDraftExtras(next);
        }}
        onExtraValue={(id, v) => setDraftExtraValues((prev) => ({ ...prev, [id]: v }))}
        onRemoveExtra={(id) => {
          const next = new Set(draftExtras);
          next.delete(id);
          setDraftExtras(next);
          setDraftExtraValues((prev) => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
        }}
        onApply={applyGridFilter}
        onShowAll={showAllGridFilter}
        onDefault={defaultGridFilter}
        onResetStatuses={() => setDraftStatuses(ALL_STATUS_IDS())}
        onLoadTpl={(tpl) => {
          setDraftName(tpl.nameQ);
          setDraftStatuses(new Set(tpl.statuses.length ? tpl.statuses : TABLE_STATUSES.map((s) => s.id)));
          setDraftExtras(new Set(tpl.extras));
          setDraftExtraValues({ ...tpl.extraValues });
        }}
        onClose={closeGridFilter}
      />
      {photos.node}
    </div>
  );
}
