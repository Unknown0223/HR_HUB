'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import {
  initialsAvatarSrc,
  PhotoThumb,
  usePhotoLightbox,
} from '@/components/PhotoLightbox';
import {
  ATTENDANCE_DEFAULT_COLUMNS,
  ATTENDANCE_DEFAULT_SEARCH,
  ATTENDANCE_SEARCH_FIELDS,
  EMPLOYEE_FIELDS,
  EMPLOYEE_FIELD_LABELS,
  columnFields,
  type EmployeeFieldKey,
  type SortDir,
  type SortRule,
} from '@/lib/employee-fields';
import { applySortRules, cellValue } from '@/lib/dashboard-fields';
import type { AttRowLike } from '@/lib/dashboard-row';
import css from './page.module.css';

/* ================= Real API contracts ================= */

type AttRow = AttRowLike;

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

type ViewMode = 'chart' | 'list';
type QuickFilterId = 'all' | 'on_time' | 'late' | 'absent' | 'not_started';
type ChipId =
  | 'on_time'
  | 'late'
  | 'early_leave'
  | 'absent'
  | 'not_started'
  | 'day_off'
  | 'excused';

type FilterState = {
  date: string;
  divisionIds: string[];
  positionIds: string[];
  scheduleIds: string[];
  gradeIds: string[];
  locationIds: string[];
};

/** Persisted sidebar templates (real app shape). */
type FilterTemplate = {
  id: string;
  name: string;
  filters: {
    period: string;
    divisionIds: string[];
    positionIds: string[];
    scheduleIds: string[];
    gradeIds: string[];
    locationIds: string[];
  };
  createdAt: string;
};

type ExtraKey =
  | 'login'
  | 'telegram'
  | 'fingerprints'
  | 'code'
  | 'distance'
  | 'accessLevel'
  | 'workStatus'
  | 'arrivalLocation'
  | 'tabNumber'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'phone'
  | 'inn'
  | 'inps'
  | 'pinfl'
  | 'position'
  | 'division'
  | 'grade'
  | 'region'
  | 'schedule'
  | 'manager'
  | 'hiredAt'
  | 'birthDate'
  | 'gender'
  | 'addressResidence'
  | 'addressPostal'
  | 'bankAccount'
  | 'employmentType'
  | 'site'
  | 'fax';

type GridState = {
  fio: string;
  statuses: string[];
  params: Partial<Record<ExtraKey, string>>;
  added: ExtraKey[];
};

/** Persisted grid templates (real app shape). */
type GridTplStored = {
  id: string;
  name: string;
  nameQ: string;
  statuses: string[];
  extras: string[];
  extraValues: Record<string, string>;
};

const FILTER_TPL_KEY = 'hrhub.dashboard.filter_templates.v1';
const GRID_TPL_KEY = 'hrhub.dashboard.grid-filter-templates';
const TABLE_COLS_KEY = 'hrhub.dashboard.table_columns.v1';
const TABLE_SEARCH_KEY = 'hrhub.dashboard.table_search.v1';
const TABLE_SORT_KEY = 'hrhub.dashboard.table_sort.v1';

const EMPTY_GRID: GridState = { fio: '', statuses: [], params: {}, added: [] };

const DEFAULT_SORT: SortRule[] = [{ key: 'fullName', dir: 'asc' }];

const BUCKET_LEGEND: { id: Exclude<QuickFilterId, 'all'>; label: string }[] = [
  { id: 'on_time', label: 'Вовремя' },
  { id: 'late', label: 'Опоздали' },
  { id: 'absent', label: 'Не пришли' },
  { id: 'not_started', label: 'Рабочий день не начался' },
];

const STATUS_LABELS: Record<string, string> = {
  on_time: 'Вовремя',
  late: 'Опоздал',
  early_leave: 'Раньше ушел',
  absent: 'Не пришел',
  not_started: 'Рабочий день не начался',
  day_off: 'Выходной',
  excused: 'Отсутствие по причине',
  leave: 'Отсутствие по причине',
  holiday: 'Праздник',
  extra_off: 'Доп. выходной',
  non_working: 'Нерабочий день',
  no_pass: 'Нет подписки',
  no_schedule: 'График не задан',
  absent_request: 'Не пришел с запросом',
};

const STATUS_CHECKLIST = [
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

const EXTRA_PARAMS: {
  key: ExtraKey;
  label: string;
  type: 'text' | 'number' | 'select' | 'location';
  options?: { v: string; l: string }[];
}[] = [
  { key: 'login', label: EMPLOYEE_FIELD_LABELS.login, type: 'text' },
  { key: 'telegram', label: EMPLOYEE_FIELD_LABELS.telegram, type: 'text' },
  { key: 'fingerprints', label: EMPLOYEE_FIELD_LABELS.fingerprints, type: 'select', options: [{ v: 'yes', l: 'Есть' }, { v: 'no', l: 'Нет' }] },
  { key: 'code', label: EMPLOYEE_FIELD_LABELS.code, type: 'text' },
  { key: 'distance', label: EMPLOYEE_FIELD_LABELS.distanceKm, type: 'number' },
  { key: 'accessLevel', label: EMPLOYEE_FIELD_LABELS.accessLevel, type: 'text' },
  { key: 'workStatus', label: EMPLOYEE_FIELD_LABELS.workStatus, type: 'text' },
  { key: 'arrivalLocation', label: EMPLOYEE_FIELD_LABELS.arrivalLocation, type: 'location' },
  { key: 'tabNumber', label: EMPLOYEE_FIELD_LABELS.tabNumber, type: 'text' },
  { key: 'email', label: EMPLOYEE_FIELD_LABELS.email, type: 'text' },
  { key: 'firstName', label: EMPLOYEE_FIELD_LABELS.firstName, type: 'text' },
  { key: 'lastName', label: EMPLOYEE_FIELD_LABELS.lastName, type: 'text' },
  { key: 'middleName', label: EMPLOYEE_FIELD_LABELS.middleName, type: 'text' },
  { key: 'phone', label: EMPLOYEE_FIELD_LABELS.phone, type: 'text' },
  { key: 'inn', label: EMPLOYEE_FIELD_LABELS.inn, type: 'text' },
  { key: 'inps', label: EMPLOYEE_FIELD_LABELS.inps, type: 'text' },
  { key: 'pinfl', label: EMPLOYEE_FIELD_LABELS.pinfl, type: 'text' },
  { key: 'position', label: EMPLOYEE_FIELD_LABELS.position, type: 'text' },
  { key: 'division', label: EMPLOYEE_FIELD_LABELS.division, type: 'text' },
  { key: 'grade', label: EMPLOYEE_FIELD_LABELS.grade, type: 'text' },
  { key: 'region', label: EMPLOYEE_FIELD_LABELS.region, type: 'text' },
  { key: 'schedule', label: EMPLOYEE_FIELD_LABELS.schedule, type: 'text' },
  { key: 'manager', label: EMPLOYEE_FIELD_LABELS.manager, type: 'text' },
  { key: 'hiredAt', label: EMPLOYEE_FIELD_LABELS.hiredAt, type: 'text' },
  { key: 'birthDate', label: EMPLOYEE_FIELD_LABELS.birthDate, type: 'text' },
  { key: 'gender', label: EMPLOYEE_FIELD_LABELS.gender, type: 'text' },
  { key: 'addressResidence', label: EMPLOYEE_FIELD_LABELS.addressResidence, type: 'text' },
  { key: 'addressPostal', label: EMPLOYEE_FIELD_LABELS.addressPostal, type: 'text' },
  { key: 'bankAccount', label: EMPLOYEE_FIELD_LABELS.bankAccount, type: 'text' },
  { key: 'employmentType', label: EMPLOYEE_FIELD_LABELS.employmentType, type: 'text' },
  { key: 'site', label: EMPLOYEE_FIELD_LABELS.site, type: 'text' },
  { key: 'fax', label: EMPLOYEE_FIELD_LABELS.fax, type: 'text' },
];

const chipClass: Record<ChipId, string> = {
  on_time: css.chipOnTime,
  late: css.chipLate,
  early_leave: css.chipEarlyLeave,
  absent: css.chipAbsent,
  not_started: css.chipNotStarted,
  day_off: css.chipDayOff,
  excused: css.chipExcused,
};

/* ================= Helpers ================= */

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function loadColumns(): EmployeeFieldKey[] {
  const raw = loadJSON<string[]>(TABLE_COLS_KEY, [...ATTENDANCE_DEFAULT_COLUMNS]);
  const allowed = new Set(EMPLOYEE_FIELDS.map((f) => f.key));
  const cols = (Array.isArray(raw) ? raw : []).filter((k): k is EmployeeFieldKey =>
    allowed.has(k as EmployeeFieldKey),
  );
  return cols.length ? cols : [...ATTENDANCE_DEFAULT_COLUMNS];
}

function loadSearchKeys(): EmployeeFieldKey[] {
  const raw = loadJSON<string[]>(TABLE_SEARCH_KEY, [...ATTENDANCE_DEFAULT_SEARCH]);
  const allowed = new Set(ATTENDANCE_SEARCH_FIELDS);
  const keys = (Array.isArray(raw) ? raw : []).filter((k): k is EmployeeFieldKey =>
    allowed.has(k as EmployeeFieldKey),
  );
  return keys.length ? keys : [...ATTENDANCE_DEFAULT_SEARCH];
}

function loadSortRules(): SortRule[] {
  const raw = loadJSON<SortRule[]>(TABLE_SORT_KEY, DEFAULT_SORT);
  if (!Array.isArray(raw) || !raw.length) return DEFAULT_SORT.map((r) => ({ ...r }));
  const allowed = new Set(EMPLOYEE_FIELDS.map((f) => f.key));
  return raw
    .filter((r) => r && allowed.has(r.key) && (r.dir === 'asc' || r.dir === 'desc' || r.dir === 'none'))
    .map((r) => ({ key: r.key, dir: r.dir }));
}

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pluralize(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

function formatRuDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(
    'ru-RU',
    opts ?? { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' },
  ).format(new Date(Date.UTC(y, m - 1, d)));
}

function initialsOf(fullName: string) {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function hueFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 42% 42%)`;
}

function openInitialsPreview(
  open: (slides: { src: string; caption?: string }[], index?: number) => void,
  fullName: string,
  employeeId: string,
) {
  const initials = initialsOf(fullName);
  const color = hueFromId(employeeId);
  open([{ src: initialsAvatarSrc(initials, color), caption: fullName }], 0);
}

function rowChips(r: AttRow): ChipId[] {
  const chips: ChipId[] = [];
  if (r.status === 'on_time' && !r.note) chips.push('on_time');
  else if (r.status === 'late' || (r.status === 'on_time' && r.note)) {
    if (r.note?.includes('Ertaroq')) chips.push('early_leave');
    else chips.push('late');
  } else if (r.status === 'absent') chips.push('absent');
  else if (r.status === 'not_started') chips.push('not_started');
  else if (r.status === 'day_off') chips.push('day_off');
  else if (r.status === 'leave') chips.push('excused');
  else if (r.status === 'on_time') chips.push('on_time');
  else if (r.status === 'late') chips.push('late');
  return chips.length ? chips : [];
}

function rowBucket(r: AttRow): Exclude<QuickFilterId, 'all'> | 'other' {
  if (r.status === 'on_time' && !r.note) return 'on_time';
  if (r.status === 'late' || (r.status === 'on_time' && r.note)) return 'late';
  if (r.status === 'absent') return 'absent';
  if (r.status === 'not_started') return 'not_started';
  return 'other';
}

function filterStatusId(r: AttRow) {
  if (r.status === 'on_time' && r.note) return 'late';
  return r.status;
}

function extraField(r: AttRow, id: ExtraKey) {
  switch (id) {
    case 'distance':
      return r.distanceKm != null ? String(r.distanceKm) : '';
    case 'fingerprints':
      return r.fingerprints ? 'yes' : 'no';
    case 'workStatus':
      return r.workStatus || '';
    case 'login':
      return r.login || '';
    case 'telegram':
      return r.telegram || '';
    case 'code':
      return r.code || '';
    case 'accessLevel':
      return r.accessLevel || '';
    case 'arrivalLocation':
      return r.arrivalLocation || '';
    case 'tabNumber':
      return r.tabNumber || '';
    case 'email':
      return r.email || '';
    case 'firstName':
      return r.firstName || '';
    case 'lastName':
      return r.lastName || '';
    case 'middleName':
      return r.middleName || '';
    case 'phone':
      return r.phone || '';
    case 'inn':
      return r.inn || '';
    case 'inps':
      return r.inps || '';
    case 'pinfl':
      return r.pinfl || '';
    case 'position':
      return r.position || '';
    case 'division':
      return r.division || '';
    case 'grade':
      return r.grade || '';
    case 'region':
      return r.region || '';
    case 'schedule':
      return r.schedule || '';
    case 'manager':
      return r.manager || '';
    case 'hiredAt':
      return r.hiredAt || '';
    case 'birthDate':
      return r.birthDate || '';
    case 'gender':
      return r.gender || '';
    case 'addressResidence':
      return r.addressResidence || '';
    case 'addressPostal':
      return r.addressPostal || '';
    case 'bankAccount':
      return r.bankAccount || '';
    case 'employmentType':
      return r.employmentType || '';
    case 'site':
      return r.site || '';
    case 'fax':
      return r.fax || '';
    default:
      return '';
  }
}

function isGridActive(g: GridState) {
  return (
    g.fio.trim().length > 0 ||
    g.statuses.length > 0 ||
    Object.values(g.params).some((v) => String(v ?? '').trim().length > 0)
  );
}

function matchesGrid(r: AttRow, g: GridState) {
  if (g.fio.trim() && !r.fullName.toLowerCase().includes(g.fio.trim().toLowerCase())) return false;
  if (g.statuses.length && !g.statuses.includes(filterStatusId(r))) return false;
  for (const [key, raw] of Object.entries(g.params)) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (!v) continue;
    const k = key as ExtraKey;
    if (k === 'fingerprints') {
      const has = Boolean(r.fingerprints);
      if (v === 'yes' && !has) return false;
      if (v === 'no' && has) return false;
      continue;
    }
    if (k === 'distance') {
      const max = Number(v);
      if (!Number.isFinite(max)) continue;
      if (r.distanceKm == null || r.distanceKm > max) return false;
      continue;
    }
    const field = extraField(r, k).toLowerCase();
    if (!field.includes(v)) return false;
  }
  return true;
}

function formatBirthday(b: Birthday) {
  if (b.daysUntil === 0) return 'сегодня';
  const d = new Date(Date.UTC(2000, b.month - 1, b.day));
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function gridToStored(name: string, g: GridState): GridTplStored {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    nameQ: g.fio,
    statuses: [...g.statuses],
    extras: [...g.added],
    extraValues: { ...g.params } as Record<string, string>,
  };
}

function storedToGrid(tpl: GridTplStored): GridState {
  return {
    fio: tpl.nameQ || '',
    statuses: Array.isArray(tpl.statuses) ? [...tpl.statuses] : [],
    added: (tpl.extras || []).filter((k): k is ExtraKey =>
      EXTRA_PARAMS.some((p) => p.key === k),
    ),
    params: { ...(tpl.extraValues || {}) } as Partial<Record<ExtraKey, string>>,
  };
}

function filterToStored(name: string, f: FilterState): FilterTemplate {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    filters: {
      period: f.date,
      divisionIds: [...f.divisionIds],
      positionIds: [...f.positionIds],
      scheduleIds: [...f.scheduleIds],
      gradeIds: [...f.gradeIds],
      locationIds: [...f.locationIds],
    },
    createdAt: new Date().toISOString(),
  };
}

function storedToFilter(tpl: FilterTemplate): FilterState {
  const f = tpl.filters;
  return {
    date: f.period || todayLocalISO(),
    divisionIds: f.divisionIds ?? [],
    positionIds: f.positionIds ?? [],
    scheduleIds: f.scheduleIds ?? [],
    gradeIds: f.gradeIds ?? [],
    locationIds: f.locationIds ?? [],
  };
}

/* ================= Icons ================= */

const I = {
  chart: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  sliders: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" />
      <line x1="10" x2="14" y1="8" y2="8" />
      <line x1="18" x2="22" y1="16" y2="16" />
    </svg>
  ),
  pin: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
    </svg>
  ),
  refresh: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  ),
  dots: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
  chevron: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  chevronL: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  chevronR: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  check: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  x: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  ),
  cake: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
      <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
      <path d="M2 21h20" />
      <path d="M7 8v3" />
      <path d="M12 8v3" />
      <path d="M17 8v3" />
      <path d="M7 4h.01" />
      <path d="M12 4h.01" />
      <path d="M17 4h.01" />
    </svg>
  ),
  inbox: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
};

/* ================= Donut ================= */

function DonutChart({
  working,
  counts,
}: {
  working: number;
  counts: { on_time: number; late: number; absent: number; not_started: number };
}) {
  const R = 84;
  const SWc = 2 * Math.PI * R;
  const segClass: Record<string, string> = {
    on_time: css.segOnTime,
    late: css.segLate,
    absent: css.segAbsent,
    not_started: css.segNotStarted,
  };
  let acc = 0;
  const segments = BUCKET_LEGEND.map((b) => {
    const ratio = working > 0 ? counts[b.id] / working : 0;
    const len = ratio * SWc;
    const seg = {
      key: b.id,
      dash: `${Math.max(len - 2, 0)} ${SWc - Math.max(len - 2, 0)}`,
      offset: -acc * SWc,
      cls: segClass[b.id],
    };
    acc += ratio;
    return seg;
  });

  return (
    <div
      className={css.donutWrap}
      role="img"
      aria-label={`Всего по графику: ${working} ${pluralize(working, 'сотрудник', 'сотрудника', 'сотрудников')}`}
    >
      <svg className={css.donutSvg} width="216" height="216" viewBox="0 0 216 216">
        <circle className={css.donutTrack} cx="108" cy="108" r={R} />
        {segments.map((s) => (
          <circle
            key={s.key}
            className={`${css.donutSeg} ${s.cls}`}
            cx="108"
            cy="108"
            r={R}
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <div className={css.donutCenter}>
        <span className={css.donutTotal}>{working}</span>
        <span className={css.donutUnit}>
          {pluralize(working, 'сотрудник', 'сотрудника', 'сотрудников')}
        </span>
        <span className={css.donutCaption}>по графику</span>
      </div>
    </div>
  );
}

/* ================= Calendar ================= */

const RU_MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];
const RU_WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function Calendar({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [vy, vm] = value.split('-').map(Number);
  const [view, setView] = useState<{ y: number; m: number }>({ y: vy, m: vm });

  useEffect(() => {
    const [y2, m2] = value.split('-').map(Number);
    setView({ y: y2, m: m2 });
  }, [value]);

  const today = todayLocalISO();
  const [ty, tm] = today.split('-').map(Number);

  const first = new Date(Date.UTC(view.y, view.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();

  const cells: { iso: string; day: number; out: boolean }[] = [];
  const prevMonthDays = new Date(Date.UTC(view.y, view.m - 1, 0)).getUTCDate();
  for (let i = lead - 1; i >= 0; i -= 1) {
    const dNum = prevMonthDays - i;
    const pm = view.m === 1 ? 12 : view.m - 1;
    const py = view.m === 1 ? view.y - 1 : view.y;
    cells.push({
      iso: `${py}-${String(pm).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`,
      day: dNum,
      out: true,
    });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({
      iso: `${view.y}-${String(view.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      out: false,
    });
  }
  while (cells.length % 7 !== 0) {
    const dNum = cells.length - lead - daysInMonth + 1;
    const nm = view.m === 12 ? 1 : view.m + 1;
    const ny = view.m === 12 ? view.y + 1 : view.y;
    cells.push({
      iso: `${ny}-${String(nm).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`,
      day: dNum,
      out: true,
    });
  }

  return (
    <div className={css.calendar} role="group" aria-label="Период">
      <div className={css.calHead}>
        <span className={css.calMonth}>
          {RU_MONTHS[view.m - 1]} {view.y}
        </span>
        <div className={css.calNav}>
          <button
            type="button"
            className={css.calNavBtn}
            aria-label="Предыдущий месяц"
            onClick={() => setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }))}
          >
            {I.chevronL}
          </button>
          <button
            type="button"
            className={css.calNavBtn}
            aria-label="Следующий месяц"
            onClick={() => setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }))}
          >
            {I.chevronR}
          </button>
        </div>
      </div>
      <div className={css.calQuick}>
        <button type="button" className={css.calQuickBtn} onClick={() => onChange(today)}>
          Очистить
        </button>
        <button type="button" className={css.calQuickBtn} onClick={() => onChange(today)}>
          Сегодня
        </button>
      </div>
      <div className={css.calGrid}>
        {RU_WD.map((d) => (
          <span key={d} className={css.calWd}>
            {d}
          </span>
        ))}
        {cells.map((c) => {
          const isToday = c.iso === today && !c.out && view.y === ty && view.m === tm;
          const isTodayCell = c.iso === today;
          const selected = c.iso === value;
          return (
            <button
              key={c.iso}
              type="button"
              disabled={c.out}
              className={`${css.calDay} ${c.out ? css.calDayOut : ''} ${isToday || isTodayCell ? css.calDayToday : ''} ${
                selected ? css.calDaySelected : ''
              }`}
              onClick={() => onChange(c.iso)}
              aria-pressed={selected}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Multiselect ================= */

function MultiSelect({
  idKey,
  label,
  options,
  selected,
  onChange,
  openId,
  setOpenId,
}: {
  idKey: string;
  label: string;
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const open = openId === idKey;
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className={css.msWrap} data-multiselect>
      <span className={css.tplLabel}>{label}</span>
      <button
        type="button"
        className={`${css.msTrigger} ${open ? css.msTriggerOpen : ''}`}
        onClick={() => setOpenId(open ? null : idKey)}
        aria-expanded={open}
      >
        <span className={css.msTriggerLabel}>{label}</span>
        <span className={css.msRight}>
          {selected.length > 0 && <span className={css.msCount}>Выбрано: {selected.length}</span>}
          {I.chevron}
        </span>
      </button>
      {open && (
        <div className={css.msPanel}>
          <div className={css.msSearch}>
            <input
              autoFocus
              className={css.msSearchInput}
              placeholder="Поиск..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={`Поиск: ${label}`}
            />
          </div>
          <div className={css.msList}>
            {filtered.length === 0 ? (
              <div className={css.msEmpty}>Нет вариантов</div>
            ) : (
              filtered.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`${css.msItem} ${on ? css.msItemSelected : ''}`}
                    onClick={() => toggle(o.id)}
                  >
                    <span className={`${css.msCheckbox} ${on ? css.msCheckboxOn : ''}`}>
                      {on && I.check}
                    </span>
                    {o.name}
                  </button>
                );
              })
            )}
          </div>
          <div className={css.msFoot}>Выбрано: {selected.length}</div>
        </div>
      )}
    </div>
  );
}

function StatusChips({ chips }: { chips: ChipId[] }) {
  if (!chips.length) return <span className={css.timeEmpty}>—</span>;
  return (
    <div className={css.chips}>
      {chips.map((s) => (
        <span key={s} className={`${css.chip} ${chipClass[s]}`} data-status={s}>
          {STATUS_LABELS[s] ?? s}
        </span>
      ))}
    </div>
  );
}

/* ================= Page ================= */

export default function DashboardPage() {
  const photos = usePhotoLightbox();
  const today = todayLocalISO();
  const DEFAULT_FILTERS: FilterState = useMemo(
    () => ({
      date: today,
      divisionIds: [],
      positionIds: [],
      scheduleIds: [],
      gradeIds: [],
      locationIds: [],
    }),
    [today],
  );

  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const [pending, setPending] = useState<FilterState>(DEFAULT_FILTERS);

  const [options, setOptions] = useState<{
    divisions: Opt[];
    positions: Opt[];
    schedules: Opt[];
    grades: Opt[];
    locations: Opt[];
  }>({ divisions: [], positions: [], schedules: [], grades: [], locations: [] });

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [quickFilter, setQuickFilter] = useState<QuickFilterId>('all');
  const [search, setSearch] = useState('');
  const [pinned, setPinned] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [tableSettingsOpen, setTableSettingsOpen] = useState(false);
  const [openDrop, setOpenDrop] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<EmployeeFieldKey[]>([
    ...ATTENDANCE_DEFAULT_COLUMNS,
  ]);
  const [searchFields, setSearchFields] = useState<EmployeeFieldKey[]>([
    ...ATTENDANCE_DEFAULT_SEARCH,
  ]);
  const [sortRules, setSortRules] = useState<SortRule[]>(() =>
    DEFAULT_SORT.map((r) => ({ ...r })),
  );
  const [draftColumns, setDraftColumns] = useState<EmployeeFieldKey[]>([]);
  const [draftSearch, setDraftSearch] = useState<EmployeeFieldKey[]>([]);
  const [draftSort, setDraftSort] = useState<SortRule[]>([]);
  const [confirmDefault, setConfirmDefault] = useState(false);

  const [templates, setTemplates] = useState<FilterTemplate[]>([]);
  const [tplSelected, setTplSelected] = useState('');

  const [gridState, setGridState] = useState<GridState>(EMPTY_GRID);
  const [gridApplied, setGridApplied] = useState<GridState>(EMPTY_GRID);
  const [gridTemplates, setGridTemplates] = useState<GridTplStored[]>([]);
  const [gridTplSelected, setGridTplSelected] = useState('');
  const [paramsPickerOpen, setParamsPickerOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(async (f: FilterState) => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      p.set('date', f.date);
      if (f.divisionIds.length) p.set('divisionIds', f.divisionIds.join(','));
      if (f.positionIds.length) p.set('positionIds', f.positionIds.join(','));
      if (f.scheduleIds.length) p.set('scheduleIds', f.scheduleIds.join(','));
      if (f.gradeIds.length) p.set('gradeIds', f.gradeIds.join(','));
      if (f.locationIds.length) p.set('locationIds', f.locationIds.join(','));
      const data = await apiFetch<Stats>(`/api/dashboard/stats?${p.toString()}`);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOptions = useCallback(async () => {
    try {
      const asOpt = (rows: Array<{ id: string; name?: string; label?: string; code?: string }> | null | undefined) =>
        (rows ?? []).map((r) => ({
          id: r.id,
          name: (r.name || r.label || r.code || '').trim() || r.id,
        }));
      const [divs, poss, schs, grds, locs] = await Promise.all([
        apiFetch<Array<{ id: string; name?: string; label?: string }>>('/api/organization/divisions'),
        apiFetch<Array<{ id: string; name?: string; label?: string }>>('/api/organization/positions'),
        apiFetch<Array<{ id: string; name?: string; label?: string }>>('/api/attendance/schedules'),
        apiFetch<Array<{ id: string; name?: string; label?: string; code?: string }>>('/api/catalog/grades'),
        apiFetch<Array<{ id: string; name?: string; label?: string }>>('/api/attendance/locations'),
      ]);
      setOptions({
        divisions: asOpt(divs),
        positions: asOpt(poss),
        schedules: asOpt(schs),
        grades: asOpt(grds),
        locations: asOpt(locs),
      });
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    const rawTpl = loadJSON<FilterTemplate[]>(FILTER_TPL_KEY, []);
    setTemplates(Array.isArray(rawTpl) ? rawTpl.filter((t) => t?.name && t?.filters) : []);
    const rawGrid = loadJSON<GridTplStored[]>(GRID_TPL_KEY, []);
    setGridTemplates(Array.isArray(rawGrid) ? rawGrid : []);
    setTableColumns(loadColumns());
    setSearchFields(loadSearchKeys());
    setSortRules(loadSortRules());
    fetchOptions();
  }, [fetchOptions]);

  // Initial load + when applied filters change (only via «Обновить» / template)
  useEffect(() => {
    fetchStats(applied);
  }, [applied, fetchStats]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false);
      if (openDrop && !t.closest('[data-multiselect]')) setOpenDrop(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openDrop]);

  useEffect(() => {
    document.body.style.overflow =
      modalOpen || sortOpen || tableSettingsOpen || confirmDefault ? 'hidden' : '';
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (confirmDefault) setConfirmDefault(false);
      else if (sortOpen) setSortOpen(false);
      else if (tableSettingsOpen) setTableSettingsOpen(false);
      else if (modalOpen) setModalOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [modalOpen, sortOpen, tableSettingsOpen, confirmDefault]);

  const statusLabelFn = useCallback((status: string) => STATUS_LABELS[status] || status, []);

  const a = stats?.attendance;
  const counts = {
    on_time: a?.on_time ?? 0,
    late: a?.late ?? 0,
    absent: a?.absent ?? 0,
    not_started: a?.not_started ?? 0,
  };
  const working =
    counts.on_time + counts.late + counts.absent + counts.not_started || stats?.headcount || 0;
  const totalHead = stats?.headcount ?? working;

  const allRows = useMemo(() => {
    const onTime = stats?.lists?.onTime ?? [];
    const late = stats?.lists?.lateOrEarly ?? [];
    const absent = stats?.lists?.absent ?? [];
    const notStarted = stats?.lists?.notStarted ?? [];
    const dayOff = stats?.lists?.dayOff ?? [];
    const leave = stats?.lists?.leave ?? [];
    return [...onTime, ...late, ...absent, ...notStarted, ...dayOff, ...leave];
  }, [stats]);

  const filtered = useMemo(() => {
    let arr = allRows;
    if (quickFilter !== 'all') arr = arr.filter((r) => rowBucket(r) === quickFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) => {
        const keys = searchFields.length ? searchFields : (['fullName'] as EmployeeFieldKey[]);
        return keys.some((k) => cellValue(r, k, statusLabelFn).toLowerCase().includes(q));
      });
    }
    if (isGridActive(gridApplied)) arr = arr.filter((r) => matchesGrid(r, gridApplied));
    return applySortRules(arr, sortRules, statusLabelFn) as AttRow[];
  }, [allRows, quickFilter, search, gridApplied, sortRules, searchFields, statusLabelFn]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, pageCount);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const rangeFrom = filtered.length === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const rangeTo = Math.min(filtered.length, pageSafe * pageSize);

  const pagerNumbers = useMemo(() => {
    const maxBtns = 5;
    let start = Math.max(1, pageSafe - Math.floor(maxBtns / 2));
    const end = Math.min(pageCount, start + maxBtns - 1);
    start = Math.max(1, end - maxBtns + 1);
    const nums: number[] = [];
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [pageSafe, pageCount]);

  const birthdays = stats?.birthdays ?? [];
  const photoSlides = useMemo(
    () =>
      filtered
        .map((r) => ({ src: mediaSrc(r.photoUrl) || '', caption: r.fullName }))
        .filter((s) => s.src),
    [filtered],
  );
  const birthdaySlides = useMemo(
    () =>
      birthdays
        .map((b) => ({ src: mediaSrc(b.photoUrl) || '', caption: b.fullName }))
        .filter((s) => s.src),
    [birthdays],
  );

  const setQuick = (id: QuickFilterId) => {
    setQuickFilter((cur) => (cur === id ? 'all' : id));
    setPage(1);
  };

  const applySidebar = () => {
    setApplied({ ...pending });
    setPage(1);
  };

  const resetTableFilters = () => {
    setQuickFilter('all');
    setSearch('');
    setGridApplied(EMPTY_GRID);
    setGridState(EMPTY_GRID);
    setGridTplSelected('');
    setPage(1);
  };

  const gridIsActive = isGridActive(gridApplied);

  const exportCsv = () => {
    const cols = tableColumns.length ? tableColumns : ATTENDANCE_DEFAULT_COLUMNS;
    const head = cols.map((k) => EMPLOYEE_FIELD_LABELS[k]);
    const lines = filtered.map((r) =>
      cols
        .map((k) => cellValue(r, k, statusLabelFn) || '—')
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(';'),
    );
    const csv = `\uFEFF${[head.join(';'), ...lines].join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement('a');
    aEl.href = url;
    aEl.download = `hrhub_attendance_${applied.date}.csv`;
    document.body.appendChild(aEl);
    aEl.click();
    aEl.remove();
    URL.revokeObjectURL(url);
  };

  const openSortModal = () => {
    const base = columnFields().map((f) => {
      const existing = sortRules.find((r) => r.key === f.key);
      return { key: f.key, dir: (existing?.dir ?? 'none') as SortDir };
    });
    // Keep active rules first in their order
    const active = sortRules.filter((r) => r.dir !== 'none');
    const rest = base.filter((r) => !active.some((a) => a.key === r.key));
    setDraftSort([...active, ...rest]);
    setSortOpen(true);
  };

  const openTableSettings = () => {
    setDraftColumns([...tableColumns]);
    setDraftSearch([...searchFields]);
    setTableSettingsOpen(true);
  };

  const applySort = () => {
    const next = draftSort.filter((r) => r.dir !== 'none');
    const rules = next.length ? next : DEFAULT_SORT.map((r) => ({ ...r }));
    setSortRules(rules);
    saveJSON(TABLE_SORT_KEY, rules);
    setSortOpen(false);
  };

  const applyTableSettings = () => {
    const cols = draftColumns.length ? draftColumns : [...ATTENDANCE_DEFAULT_COLUMNS];
    const search = draftSearch.length ? draftSearch : [...ATTENDANCE_DEFAULT_SEARCH];
    setTableColumns(cols);
    setSearchFields(search);
    saveJSON(TABLE_COLS_KEY, cols);
    saveJSON(TABLE_SEARCH_KEY, search);
    setTableSettingsOpen(false);
  };

  const resetTableDefaults = () => {
    const cols = [...ATTENDANCE_DEFAULT_COLUMNS];
    const search = [...ATTENDANCE_DEFAULT_SEARCH];
    const sort = DEFAULT_SORT.map((r) => ({ ...r }));
    setTableColumns(cols);
    setSearchFields(search);
    setSortRules(sort);
    setDraftColumns(cols);
    setDraftSearch(search);
    saveJSON(TABLE_COLS_KEY, cols);
    saveJSON(TABLE_SEARCH_KEY, search);
    saveJSON(TABLE_SORT_KEY, sort);
    setConfirmDefault(false);
  };

  const visibleColumns = tableColumns.length ? tableColumns : ATTENDANCE_DEFAULT_COLUMNS;
  const unusedColumns = columnFields().filter((f) => !draftColumns.includes(f.key));

  const saveSidebarTemplate = (mode: 'new' | 'overwrite') => {
    if (mode === 'overwrite' && tplSelected) {
      const idx = templates.findIndex((t) => t.name === tplSelected);
      if (idx >= 0) {
        const next = templates.slice();
        next[idx] = { ...next[idx], filters: filterToStored(tplSelected, pending).filters };
        setTemplates(next);
        saveJSON(FILTER_TPL_KEY, next);
      }
      return;
    }
    const name = window.prompt('Название шаблона', 'Мой фильтр');
    if (!name || !name.trim()) return;
    const item = filterToStored(name.trim(), pending);
    const next = [item, ...templates.filter((t) => t.name.toLowerCase() !== item.name.toLowerCase())];
    setTemplates(next);
    saveJSON(FILTER_TPL_KEY, next);
    setTplSelected(item.name);
  };

  const saveGridTemplate = () => {
    const name = window.prompt('Название шаблона фильтра', 'Мой фильтр');
    if (!name || !name.trim()) return;
    const item = gridToStored(name.trim(), gridState);
    const next = [item, ...gridTemplates.filter((t) => t.name.toLowerCase() !== item.name.toLowerCase())];
    setGridTemplates(next);
    saveJSON(GRID_TPL_KEY, next);
    setGridTplSelected(item.name);
  };

  const dateLabel = formatRuDate(applied.date);

  return (
    <div className={css.page}>
      <div className={css.pageHead}>
        <div>
          <h1 className={css.h1}>Статистика посещений сотрудников</h1>
          <p className={css.dateLine}>
            <span className={css.dateLineStrong}>{dateLabel}</span>
            <span className={css.dateDot}>·</span>
            статистика посещений
          </p>
        </div>
        <div className={css.pageHeadRight}>
          <div className={css.sectionLegend} aria-hidden="true">
            <span className={`${css.legendChip} ${css.legendChip1}`}>
              <span className={css.legendChipNum}>1</span>
              Диаграмма
            </span>
            <span className={`${css.legendChip} ${css.legendChip2}`}>
              <span className={css.legendChipNum}>2</span>
              Таблица
            </span>
            <span className={`${css.legendChip} ${css.legendChip3}`}>
              <span className={css.legendChipNum}>3</span>
              Фильтры
            </span>
          </div>
          <div className={css.viewSwitch} role="tablist" aria-label="Режим отображения">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'chart'}
              className={`${css.viewBtn} ${viewMode === 'chart' ? css.viewBtnActive : ''}`}
              onClick={() => setViewMode('chart')}
            >
              {I.chart}
              Диаграмма
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'list'}
              className={`${css.viewBtn} ${viewMode === 'list' ? css.viewBtnActive : ''}`}
              onClick={() => setViewMode('list')}
            >
              {I.list}
              Список
            </button>
          </div>
        </div>
      </div>

      <div className={css.layout}>
        <div className={css.mainCol}>
          <div className={css.viewArea} key={viewMode}>
            {viewMode === 'chart' ? (
              <section className={`${css.card} ${css.chartCard}`} aria-label="Статистика посещаемости">
                <div className={css.sectionHead}>
                  <div className={css.sectionHeadLeft}>
                    <span className={`${css.sectionIcon} ${css.sectionIconChart}`}>{I.chart}</span>
                    <div>
                      <h2 className={css.sectionTitle}>
                        Посещаемость за день
                        <span className={`${css.sectionBadge} ${css.sectionBadge1}`}>01</span>
                      </h2>
                      <p className={css.sectionSub}>Распределение статусов по выбранной выборке</p>
                    </div>
                  </div>
                  <div className={css.livePill}>
                    <span className={css.liveDot} aria-hidden="true" />
                    данные Face ID
                  </div>
                </div>
                <div className={css.chartBody}>
                  <DonutChart working={working} counts={counts} />
                  <ul className={css.legend}>
                    {BUCKET_LEGEND.map((b) => {
                      const n = counts[b.id];
                      const pct = working > 0 ? Math.round((n / working) * 100) : 0;
                      const dotCls =
                        b.id === 'on_time'
                          ? css.dotOnTime
                          : b.id === 'late'
                            ? css.dotLate
                            : b.id === 'absent'
                              ? css.dotAbsent
                              : css.dotNotStarted;
                      const barCls =
                        b.id === 'on_time'
                          ? css.barOnTime
                          : b.id === 'late'
                            ? css.barLate
                            : b.id === 'absent'
                              ? css.barAbsent
                              : css.barNotStarted;
                      return (
                        <li key={b.id}>
                          <button
                            type="button"
                            className={`${css.legendItem} ${quickFilter === b.id ? css.legendItemActive : ''}`}
                            onClick={() => setQuick(b.id)}
                            aria-pressed={quickFilter === b.id}
                          >
                            <div className={css.legendRow}>
                              <span className={`${css.legendDot} ${dotCls}`} aria-hidden="true" />
                              <span className={css.legendLabel}>{b.label}</span>
                              <span className={css.legendCount}>{n}</span>
                              <span className={css.legendPct}>{pct}%</span>
                            </div>
                            <div className={css.legendBarTrack}>
                              <span className={`${css.legendBar} ${barCls}`} style={{ width: `${pct}%` }} />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <p className={css.chartHint}>
                  Нажмите на категорию, чтобы отфильтровать таблицу ниже. Повторное нажатие сбрасывает
                  фильтр.
                </p>
              </section>
            ) : (
              <div className={css.badgeRow} aria-label="Фильтры по статусу">
                <button
                  type="button"
                  className={`${css.badge} ${quickFilter === 'all' ? css.badgeAllActive : ''}`}
                  onClick={() => {
                    setQuickFilter('all');
                    setPage(1);
                  }}
                  aria-pressed={quickFilter === 'all'}
                >
                  <span>Все</span>
                  <span className={css.badgeCount}>{totalHead}</span>
                </button>
                {(
                  [
                    { id: 'on_time' as const, label: 'Вовремя', cls: css.badgeOnTimeActive, n: counts.on_time },
                    { id: 'late' as const, label: 'Опоздал', cls: css.badgeLateActive, n: counts.late },
                    { id: 'absent' as const, label: 'Не пришел', cls: css.badgeAbsentActive, n: counts.absent },
                    {
                      id: 'not_started' as const,
                      label: 'Рабочий день не начался',
                      cls: css.badgeNotStartedActive,
                      n: counts.not_started,
                    },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`${css.badge} ${quickFilter === b.id ? b.cls : ''}`}
                    onClick={() => setQuick(b.id)}
                    aria-pressed={quickFilter === b.id}
                  >
                    <span>{b.label}</span>
                    <span className={css.badgeCount}>{b.n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <section className={`${css.card} ${css.tableCard}`} aria-label="Таблица посещений">
            <div className={`${css.sectionHead} ${css.sectionHeadTable}`}>
              <div className={css.sectionHeadLeft}>
                <span className={`${css.sectionIcon} ${css.sectionIconTable}`}>{I.users}</span>
                <div>
                  <h2 className={css.sectionTitle}>
                    Сотрудники · отметки
                    <span className={`${css.sectionBadge} ${css.sectionBadge2}`}>02</span>
                  </h2>
                  <p className={css.sectionSub}>Приход, уход и состояние за выбранную дату</p>
                </div>
              </div>
              <div className={css.countPill}>
                <span className={css.countPillDot} aria-hidden="true" />
                всего строк: <strong>{filtered.length}</strong>
              </div>
            </div>
            <div className={css.toolbar}>
              <div className={css.searchWrap}>
                <span className={css.searchIcon}>{I.search}</span>
                <input
                  className={css.searchInput}
                  placeholder="Поиск по ФИО…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Поиск по таблице"
                />
              </div>
              <div className={css.toolbarSpacer} />
              <div className={css.toolCluster}>
                <button type="button" className={css.toolBtn} onClick={() => setModalOpen(true)}>
                  {I.sliders}
                  Фильтр
                  {gridIsActive && <span className={css.toolBtnDot} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={`${css.toolBtn} ${pinned ? css.toolBtnActive : ''}`}
                  onClick={() => setPinned((v) => !v)}
                  aria-pressed={pinned}
                  title="Закрепить шапку таблицы"
                >
                  {I.pin}
                  Закрепить
                </button>
                <select
                  className={css.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Строк на странице"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <div className={css.pager} aria-label="Пагинация">
                  <button
                    type="button"
                    className={css.pagerBtn}
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Предыдущая страница"
                  >
                    ‹
                  </button>
                  {pagerNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`${css.pagerBtn} ${n === pageSafe ? css.pagerBtnActive : ''}`}
                      onClick={() => setPage(n)}
                      aria-current={n === pageSafe ? 'page' : undefined}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={css.pagerBtn}
                    disabled={pageSafe >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    aria-label="Следующая страница"
                  >
                    ›
                  </button>
                </div>
                <button
                  type="button"
                  className={`${css.toolBtn} ${loading ? css.refreshSpin : ''}`}
                  onClick={() => fetchStats(applied)}
                  title="Обновить данные"
                >
                  {I.refresh}
                  Обновить
                </button>
                <div className={css.menuAnchor} ref={menuRef}>
                  <button
                    type="button"
                    className={`${css.toolBtn} ${css.toolBtnIconOnly}`}
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-expanded={menuOpen}
                    aria-label="Меню"
                  >
                    {I.dots}
                  </button>
                  {menuOpen && (
                    <div className={css.menuPanel} role="menu">
                      <button
                        type="button"
                        className={css.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          openSortModal();
                        }}
                      >
                        Сортировка
                      </button>
                      <button
                        type="button"
                        className={css.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          openTableSettings();
                        }}
                      >
                        Настройка таблицы
                      </button>
                      <button
                        type="button"
                        className={css.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          exportCsv();
                        }}
                      >
                        {I.download}
                        Скачать в Excel
                      </button>
                      <button
                        type="button"
                        className={css.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          fetchStats(applied);
                        }}
                      >
                        {I.refresh}
                        Обновить данные
                      </button>
                      <button
                        type="button"
                        className={css.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          resetTableFilters();
                        }}
                      >
                        {I.x}
                        Сбросить фильтры таблицы
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && <div className={css.errorBanner}>{error}</div>}

            {loading ? (
              <div className={css.loadingOverlay}>
                <span className={css.spinner} aria-hidden="true" />
                Загрузка статистики посещений…
              </div>
            ) : filtered.length === 0 ? (
              <div className={css.emptyState}>
                <div className={css.emptyIcon}>{I.inbox}</div>
                <div className={css.emptyText}>
                  Нет данных за{' '}
                  {formatRuDate(applied.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div className={css.emptySub}>
                  Измените дату в фильтре справа или сбросьте фильтры таблицы
                </div>
              </div>
            ) : (
              <div className={`${css.tableScroll} ${pinned ? css.tableScrollPinned : ''}`}>
                <table className={css.table}>
                  <thead>
                    <tr>
                      {visibleColumns.map((key) => (
                        <th key={key} className={css.tableTh}>
                          {EMPLOYEE_FIELD_LABELS[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((emp) => {
                      const src = mediaSrc(emp.photoUrl);
                      const idx = src ? photoSlides.findIndex((s) => s.src === src) : -1;
                      const chips = rowChips(emp);
                      const bucket = rowBucket(emp);
                      return (
                        <tr key={emp.employeeId} className={css.tableRow}>
                          {visibleColumns.map((key) => {
                            if (key === 'fullName') {
                              return (
                                <td key={key} className={css.tableTd}>
                                  <div className={css.nameCell}>
                                    {src ? (
                                      <PhotoThumb
                                        className={css.avatarImg}
                                        src={src}
                                        alt={emp.fullName}
                                        lightbox={photos}
                                        slides={photoSlides}
                                        index={idx < 0 ? 0 : idx}
                                        fallback={
                                          <button
                                            type="button"
                                            className={css.avatarBtn}
                                            style={{ background: hueFromId(emp.employeeId) }}
                                            aria-label={`Фото: ${emp.fullName}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openInitialsPreview(
                                                photos.open,
                                                emp.fullName,
                                                emp.employeeId,
                                              );
                                            }}
                                          >
                                            {initialsOf(emp.fullName)}
                                          </button>
                                        }
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        className={css.avatarBtn}
                                        style={{ background: hueFromId(emp.employeeId) }}
                                        aria-label={`Фото: ${emp.fullName}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openInitialsPreview(
                                            photos.open,
                                            emp.fullName,
                                            emp.employeeId,
                                          );
                                        }}
                                      >
                                        {initialsOf(emp.fullName)}
                                      </button>
                                    )}
                                    <div className={css.nameMain}>
                                      <Link
                                        href={`/employees/${emp.employeeId}`}
                                        className={css.nameLink}
                                      >
                                        {emp.fullName}
                                      </Link>
                                      {emp.position ? (
                                        <span className={css.nameSub}>{emp.position}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                              );
                            }
                            if (key === 'dayState') {
                              return (
                                <td key={key} className={css.tableTd}>
                                  <StatusChips chips={chips} />
                                </td>
                              );
                            }
                            if (key === 'arrival') {
                              return (
                                <td key={key} className={`${css.tableTd} ${css.timeCell}`}>
                                  {emp.firstIn ? (
                                    <span className={bucket === 'late' ? css.timeLate : css.timeOk}>
                                      {emp.firstIn}
                                    </span>
                                  ) : (
                                    <span className={css.timeEmpty}>—</span>
                                  )}
                                </td>
                              );
                            }
                            if (key === 'departure') {
                              return (
                                <td key={key} className={`${css.tableTd} ${css.timeCell}`}>
                                  {emp.lastOut ? (
                                    <span
                                      className={
                                        chips.includes('early_leave') ? css.timeLate : css.timeOk
                                      }
                                    >
                                      {emp.lastOut}
                                    </span>
                                  ) : (
                                    <span className={css.timeEmpty}>—</span>
                                  )}
                                </td>
                              );
                            }
                            if (key === 'tabNumber') {
                              return (
                                <td key={key} className={`${css.tableTd} ${css.tabCell}`}>
                                  {emp.tabNumber || '—'}
                                </td>
                              );
                            }
                            const val = cellValue(emp, key, statusLabelFn);
                            return (
                              <td key={key} className={css.tableTd}>
                                {val || '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className={css.tableFooter}>
              <span>
                Показано {rangeFrom}–{rangeTo} из {filtered.length}
              </span>
              <span>
                Режим: {viewMode === 'chart' ? 'Круговая диаграмма' : 'Список'} · Период:{' '}
                {applied.date}
              </span>
            </div>
          </section>
        </div>

        <div className={`${css.sidebarCol} ${collapsed ? css.sidebarColCollapsed : ''}`}>
          {collapsed ? (
            <div className={css.rail}>
              <button type="button" className={css.railBtn} onClick={() => setCollapsed(false)}>
                ‹ Показать фильтр
              </button>
            </div>
          ) : (
            <>
              <section className={css.filterCard} aria-label="Фильтр статистики">
                <div className={css.cardHead}>
                  <div className={css.sectionHeadLeft}>
                    <span className={`${css.sectionIcon} ${css.sectionIconFilter}`}>{I.sliders}</span>
                    <div>
                      <h2 className={css.cardTitle}>
                        Фильтры
                        <span className={`${css.sectionBadge} ${css.sectionBadge3}`}>03</span>
                      </h2>
                      <p className={css.sectionSub}>настройте выборку данных</p>
                    </div>
                  </div>
                  <button type="button" className={css.collapseBtn} onClick={() => setCollapsed(true)}>
                    Скрыть ›
                  </button>
                </div>
                <div className={css.filterBody}>
                  <div>
                    <label className={css.tplLabel} htmlFor="sidebarTemplate">
                      Шаблон
                    </label>
                    <select
                      id="sidebarTemplate"
                      className={css.tplSelect}
                      value={tplSelected}
                      onChange={(e) => {
                        const name = e.target.value;
                        setTplSelected(name);
                        const tpl = templates.find((t) => t.name === name);
                        if (tpl) setPending(storedToFilter(tpl));
                      }}
                    >
                      {templates.length === 0 ? (
                        <option value="">Нет сохранённых</option>
                      ) : (
                        <>
                          <option value="">— Выберите шаблон —</option>
                          {templates.map((t) => (
                            <option key={t.id || t.name} value={t.name}>
                              {t.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <div className={css.tplBtnRow}>
                      <button
                        type="button"
                        className={css.ghostBtnSm}
                        onClick={() => saveSidebarTemplate('new')}
                      >
                        Новый
                      </button>
                      <button
                        type="button"
                        className={css.ghostBtnSm}
                        disabled={!tplSelected}
                        onClick={() => saveSidebarTemplate('overwrite')}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className={css.ghostBtnSm}
                        onClick={() => setPending({ ...applied })}
                      >
                        Отменить
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={css.syncBtn}
                    onClick={() => fetchOptions()}
                    title="Обновить справочники фильтров"
                  >
                    {I.refresh}
                    Обновить
                  </button>

                  <div className={css.filterFieldBlock}>
                    <div className={css.filterSectionLabel}>Период</div>
                    <Calendar
                      value={pending.date}
                      onChange={(iso) => setPending((p) => ({ ...p, date: iso }))}
                    />
                  </div>

                  <MultiSelect
                    idKey="divisionIds"
                    label="Подразделения"
                    options={options.divisions}
                    selected={pending.divisionIds}
                    onChange={(ids) => setPending((p) => ({ ...p, divisionIds: ids }))}
                    openId={openDrop}
                    setOpenId={setOpenDrop}
                  />
                  <MultiSelect
                    idKey="positionIds"
                    label="Должности"
                    options={options.positions}
                    selected={pending.positionIds}
                    onChange={(ids) => setPending((p) => ({ ...p, positionIds: ids }))}
                    openId={openDrop}
                    setOpenId={setOpenDrop}
                  />
                  <MultiSelect
                    idKey="scheduleIds"
                    label="Рабочие графики"
                    options={options.schedules}
                    selected={pending.scheduleIds}
                    onChange={(ids) => setPending((p) => ({ ...p, scheduleIds: ids }))}
                    openId={openDrop}
                    setOpenId={setOpenDrop}
                  />
                  <MultiSelect
                    idKey="gradeIds"
                    label="Разряды"
                    options={options.grades}
                    selected={pending.gradeIds}
                    onChange={(ids) => setPending((p) => ({ ...p, gradeIds: ids }))}
                    openId={openDrop}
                    setOpenId={setOpenDrop}
                  />
                  <MultiSelect
                    idKey="locationIds"
                    label="Локации"
                    options={options.locations}
                    selected={pending.locationIds}
                    onChange={(ids) => setPending((p) => ({ ...p, locationIds: ids }))}
                    openId={openDrop}
                    setOpenId={setOpenDrop}
                  />

                  <div className={css.filterFieldBlock}>
                    <button type="button" className={css.applyBtn} onClick={applySidebar}>
                      {I.refresh}
                      Обновить
                    </button>
                    <p className={css.applyNote}>Фильтры применяются по нажатию «Обновить»</p>
                  </div>
                </div>
              </section>

              <section className={css.filterCard} aria-label="Дни рождения" id="birthdays">
                <div className={css.cardHead}>
                  <h2 className={css.cardTitle}>Дни рождения</h2>
                </div>
                {birthdays.length === 0 ? (
                  <div className={css.birthEmpty}>
                    <div className={css.birthEmptyIcon}>{I.cake}</div>
                    <div className={css.birthEmptyText}>
                      Здесь Вы будете видеть дни рождения коллег
                    </div>
                  </div>
                ) : (
                  <ul className={css.birthList}>
                    {birthdays.map((b) => {
                      const src = mediaSrc(b.photoUrl);
                      const idx = src ? birthdaySlides.findIndex((s) => s.src === src) : -1;
                      return (
                        <li key={b.employeeId} className={css.birthRow}>
                          {src ? (
                            <PhotoThumb
                              className={css.birthAvatarImg}
                              src={src}
                              alt={b.fullName}
                              lightbox={photos}
                              slides={birthdaySlides}
                              index={idx < 0 ? 0 : idx}
                              fallback={
                                <button
                                  type="button"
                                  className={css.birthAvatar}
                                  style={{ background: hueFromId(b.employeeId) }}
                                  aria-label={`Фото: ${b.fullName}`}
                                  onClick={() =>
                                    openInitialsPreview(
                                      photos.open,
                                      b.fullName,
                                      b.employeeId,
                                    )
                                  }
                                >
                                  {initialsOf(b.fullName)}
                                </button>
                              }
                            />
                          ) : (
                            <button
                              type="button"
                              className={css.birthAvatar}
                              style={{ background: hueFromId(b.employeeId) }}
                              aria-label={`Фото: ${b.fullName}`}
                              onClick={() =>
                                openInitialsPreview(photos.open, b.fullName, b.employeeId)
                              }
                            >
                              {initialsOf(b.fullName)}
                            </button>
                          )}
                          <span className={css.birthMain}>
                            <Link href={`/employees/${b.employeeId}`} className={css.birthName}>
                              {b.fullName}
                            </Link>
                            <span className={css.birthPos}>{b.position ?? '—'}</span>
                          </span>
                          <span
                            className={`${css.birthDate} ${b.daysUntil === 0 ? css.birthDateToday : ''}`}
                          >
                            {formatBirthday(b)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div
          className={css.overlay}
          onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className={css.modal} role="dialog" aria-modal="true" aria-label="Фильтр таблицы">
            <div className={css.modalHead}>
              <h2 className={css.modalTitle}>Фильтр</h2>
              <button
                type="button"
                className={css.modalClose}
                onClick={() => setModalOpen(false)}
                aria-label="Закрыть"
              >
                {I.x}
              </button>
            </div>

            <div className={css.modalBody}>
              <div className={css.modalTplRow}>
                <div className={css.modalTplGrow}>
                  <label className={css.mFieldLabel} htmlFor="gridTemplate">
                    Шаблон
                  </label>
                  <select
                    id="gridTemplate"
                    className={css.mSelect}
                    value={gridTplSelected}
                    onChange={(e) => {
                      const name = e.target.value;
                      setGridTplSelected(name);
                      const tpl = gridTemplates.find((t) => t.name === name);
                      if (tpl) setGridState(storedToGrid(tpl));
                    }}
                  >
                    <option value="">По умолчанию</option>
                    {gridTemplates.map((t) => (
                      <option key={t.id || t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className={css.ghostBtnSm}
                  style={{ flex: '0 0 auto', padding: '0 12px', height: 36 }}
                  onClick={saveGridTemplate}
                >
                  Новый шаблон
                </button>
                <button
                  type="button"
                  className={css.ghostBtnSm}
                  style={{ flex: '0 0 auto', padding: '0 12px', height: 36 }}
                  onClick={() => {
                    setGridState(EMPTY_GRID);
                    setGridTplSelected('');
                  }}
                >
                  По умолчанию
                </button>
              </div>

              <button
                type="button"
                className={css.linkBtn}
                onClick={() => setParamsPickerOpen((v) => !v)}
                aria-expanded={paramsPickerOpen}
              >
                Добавить параметры +
              </button>

              {paramsPickerOpen && (
                <div className={css.paramsPicker}>
                  {EXTRA_PARAMS.map((p) => (
                    <label key={p.key} className={css.checkRow}>
                      <input
                        type="checkbox"
                        checked={gridState.added.includes(p.key)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setGridState((g) => {
                            const added = on
                              ? [...g.added, p.key]
                              : g.added.filter((k) => k !== p.key);
                            const params = { ...g.params };
                            if (!on) delete params[p.key];
                            return { ...g, added, params };
                          });
                        }}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              )}

              <div>
                <label className={css.mFieldLabel} htmlFor="fio">
                  ФИО
                </label>
                <input
                  id="fio"
                  className={css.mInput}
                  placeholder="Фамилия, имя или отчество"
                  value={gridState.fio}
                  onChange={(e) => setGridState((g) => ({ ...g, fio: e.target.value }))}
                />
              </div>

              <div className={css.mSection}>
                <p className={css.mSectionTitle}>Состояние</p>
                <div className={css.statusGrid}>
                  {STATUS_CHECKLIST.map((s) => (
                    <label key={s.id} className={css.checkRow} htmlFor={s.id}>
                      <input
                        type="checkbox"
                        id={s.id}
                        checked={gridState.statuses.includes(s.id)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setGridState((g) => ({
                            ...g,
                            statuses: on
                              ? [...g.statuses, s.id]
                              : g.statuses.filter((x) => x !== s.id),
                          }));
                        }}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>

              {gridState.added.length > 0 && (
                <div className={css.mSection}>
                  <p className={css.mSectionTitle}>Дополнительные параметры</p>
                  <div className={css.extraGrid}>
                    {gridState.added.map((key) => {
                      const def = EXTRA_PARAMS.find((p) => p.key === key)!;
                      const value = gridState.params[key] ?? '';
                      return (
                        <div key={key}>
                          <label className={css.mFieldLabel} htmlFor={key}>
                            {def.label}
                          </label>
                          {def.type === 'select' || def.type === 'location' ? (
                            <select
                              id={key}
                              className={css.mSelect}
                              value={value}
                              onChange={(e) =>
                                setGridState((g) => ({
                                  ...g,
                                  params: { ...g.params, [key]: e.target.value },
                                }))
                              }
                            >
                              <option value="">Любой</option>
                              {(def.type === 'location'
                                ? options.locations.map((l) => ({ v: l.name, l: l.name }))
                                : (def.options ?? [])
                              ).map((o) => (
                                <option key={o.v} value={o.v}>
                                  {o.l}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              id={key}
                              className={css.mInput}
                              type={def.type === 'number' ? 'number' : 'text'}
                              min={def.type === 'number' ? 0 : undefined}
                              placeholder={def.label}
                              value={value}
                              onChange={(e) =>
                                setGridState((g) => ({
                                  ...g,
                                  params: { ...g.params, [key]: e.target.value },
                                }))
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className={css.modalFoot}>
              <button
                type="button"
                className={css.showAllBtn}
                onClick={() => {
                  setGridState(EMPTY_GRID);
                  setGridApplied(EMPTY_GRID);
                  setGridTplSelected('');
                  setPage(1);
                  setModalOpen(false);
                }}
              >
                Показать все
              </button>
              <button
                type="button"
                className={css.applyPrimary}
                onClick={() => {
                  setGridApplied({ ...gridState });
                  setPage(1);
                  setModalOpen(false);
                }}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {sortOpen && (
        <div className={css.overlay} onClick={() => setSortOpen(false)}>
          <div
            className={`${css.modal} ${css.modalWide}`}
            role="dialog"
            aria-modal="true"
            aria-label="Сортировка"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={css.modalHead}>
              <h2 className={css.modalTitle}>Сортировка</h2>
              <div className={css.modalHeadActions}>
                <button
                  type="button"
                  className={css.ghostBtnSm}
                  onClick={() => {
                    setDraftSort(
                      columnFields().map((f) => ({
                        key: f.key,
                        dir: (f.key === 'fullName' ? 'asc' : 'none') as SortDir,
                      })),
                    );
                  }}
                >
                  По умолчанию
                </button>
                <button
                  type="button"
                  className={css.modalClose}
                  onClick={() => setSortOpen(false)}
                  aria-label="Закрыть"
                >
                  {I.x}
                </button>
              </div>
            </div>
            <div className={css.modalBody}>
              <ul className={css.sortList}>
                {draftSort.map((rule, idx) => (
                  <li key={rule.key} className={css.sortRow}>
                    <span className={css.sortLabel}>{EMPLOYEE_FIELD_LABELS[rule.key]}</span>
                    <select
                      className={css.mSelect}
                      value={rule.dir}
                      onChange={(e) => {
                        const dir = e.target.value as SortDir;
                        setDraftSort((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, dir } : r)),
                        );
                      }}
                    >
                      <option value="none">нет действий</option>
                      <option value="asc">по возрастанию</option>
                      <option value="desc">по убыванию</option>
                    </select>
                    <span className={css.sortHandle} aria-hidden="true">
                      ⋮⋮
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={css.modalFoot}>
              <button type="button" className={css.showAllBtn} onClick={() => setSortOpen(false)}>
                Отменить
              </button>
              <button type="button" className={css.applyPrimary} onClick={applySort}>
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {tableSettingsOpen && (
        <div className={css.overlay} onClick={() => setTableSettingsOpen(false)}>
          <div
            className={`${css.modal} ${css.modalWide}`}
            role="dialog"
            aria-modal="true"
            aria-label="Настройка таблицы"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={css.modalHead}>
              <h2 className={css.modalTitle}>Настройка таблицы: Статистика посещений сотрудников</h2>
              <button
                type="button"
                className={css.modalClose}
                onClick={() => setTableSettingsOpen(false)}
                aria-label="Закрыть"
              >
                {I.x}
              </button>
            </div>
            <div className={css.modalBody}>
              <div className={css.settingsActions}>
                <button type="button" className={css.applyPrimary} onClick={applyTableSettings}>
                  Сохранить
                </button>
                <button
                  type="button"
                  className={css.ghostBtnSm}
                  onClick={() => setConfirmDefault(true)}
                >
                  По умолчанию
                </button>
                <button
                  type="button"
                  className={css.ghostBtnSm}
                  onClick={() => setTableSettingsOpen(false)}
                >
                  Закрыть
                </button>
              </div>

              <h3 className={css.settingsSectionTitle}>Настройка полей</h3>
              <div className={css.fieldChips}>
                {draftColumns.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`${css.fieldChip} ${css.fieldChipActive}`}
                    onClick={() =>
                      setDraftColumns((cols) => cols.filter((k) => k !== key))
                    }
                    title="Убрать из таблицы"
                  >
                    {EMPLOYEE_FIELD_LABELS[key]}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>

              <h3 className={css.settingsSectionTitle}>Дополнительные поля</h3>
              <div className={css.fieldChips}>
                {unusedColumns.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`${css.fieldChip} ${css.fieldChipExtra}`}
                    onClick={() => setDraftColumns((cols) => [...cols, f.key])}
                    title="Добавить в таблицу"
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <h3 className={css.settingsSectionTitle}>Настройка поиска</h3>
              <div className={css.searchToggles}>
                {ATTENDANCE_SEARCH_FIELDS.map((key) => (
                  <label key={key} className={css.searchToggleRow}>
                    <span>{EMPLOYEE_FIELD_LABELS[key]}</span>
                    <input
                      type="checkbox"
                      checked={draftSearch.includes(key)}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setDraftSearch((keys) =>
                          on ? [...keys, key] : keys.filter((k) => k !== key),
                        );
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDefault && (
        <div className={css.overlay} onClick={() => setConfirmDefault(false)}>
          <div
            className={css.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Установить по умолчанию"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <div className={css.modalHead}>
              <h2 className={css.modalTitle}>Установить по умолчанию?</h2>
            </div>
            <div className={css.modalFoot}>
              <button
                type="button"
                className={css.showAllBtn}
                onClick={() => setConfirmDefault(false)}
              >
                Нет
              </button>
              <button type="button" className={css.applyPrimary} onClick={resetTableDefaults}>
                Да
              </button>
            </div>
          </div>
        </div>
      )}

      {photos.node}
    </div>
  );
}
