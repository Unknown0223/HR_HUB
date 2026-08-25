'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type TabKey =
  | 'main'
  | 'calendar'
  | 'docs'
  | 'locations'
  | 'absences'
  | 'subordinates'
  | 'payroll'
  | 'efficiency'
  | 'education'
  | 'schedule_req'
  | 'accounts'
  | 'documents'
  | 'family'
  | 'certificates'
  | 'career'
  | 'files'
  | 'inventory'
  | 'car'
  | 'identity'
  | 'extra'
  | 'settings';

type Detail = {
  id: string;
  tabNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  employmentType: string;
  externalId?: string | null;
  hiredAt?: string | null;
  dismissedAt?: string | null;
  baseSalary?: string | number | null;
  division?: { name: string; code?: string } | null;
  position?: { name: string; code?: string } | null;
  region?: { name: string; code?: string } | null;
  grade?: { name: string; code?: string } | null;
  person?: {
    pinfl?: string | null;
    passport?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  schedule?: {
    id: string;
    name: string;
    code?: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
    isActive?: boolean;
    settings?: {
      weekPattern?: '6/1' | '5/1' | '5/2';
      [key: string]: unknown;
    } | null;
    shifts?: { weekday: number | null; startTime: string; endTime: string }[];
  } | null;
  faceProfile?: {
    syncStatus: string;
    photoUrl?: string | null;
    lastError?: string | null;
  } | null;
  documents: {
    id: string;
    title: string;
    type: string;
    documentDate: string;
    number?: string | null;
    payload?: Record<string, unknown> | null;
  }[];
  absences: {
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    note?: string | null;
    createdAt?: string;
    meta?: {
      requestKind?: string;
      reviewNote?: string;
      requestDate?: string;
      [key: string]: unknown;
    } | null;
    absenceType: { id?: string; name: string; code?: string };
  }[];
  plannedAccruals?: {
    id: string;
    absenceType: string;
    accrualType: string;
    startDate: string;
    endDate: string;
    accrued: number;
    used: number;
    remaining: number;
  }[];
  requests?: {
    id: string;
    type: string;
    status: string;
    title: string;
    reviewNote?: string | null;
    createdAt: string;
  }[];
  relatives?: {
    id: string;
    fullName: string;
    relation: string;
    birthDate?: string | null;
    phone?: string | null;
  }[];
  days?: {
    id: string;
    workDate: string;
    status: string;
    firstInAt?: string | null;
    lastOutAt?: string | null;
    lateMinutes?: number;
  }[];
  marks?: {
    id: string;
    direction: string;
    occurredAt: string;
    source: string;
  }[];
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  } | null;
  attachedLocations?: {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    attachmentType?: string | null;
    regionName?: string | null;
    locationType?: { name: string } | null;
  }[];
  availableLocations?: {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    attachmentType?: string | null;
    regionName?: string | null;
    locationType?: { name: string } | null;
  }[];
  locations?: {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    locationType?: { name: string } | null;
  }[];
  hireDocumentId?: string | null;
  profileFlags?: {
    excludeFromStats?: boolean;
    systemAccessClosed?: boolean;
    marksBlocked?: boolean;
  };
  vacationLimits?: {
    period: string;
    vacationType: string;
    limitDays: number;
    usedDays: number;
    remainingDays: number;
  }[];
  documentHistory?: {
    hr: {
      id: string;
      startDate: string;
      endDate?: string | null;
      positionLabel: string;
      divisionName?: string | null;
      positionName?: string | null;
      gradeName?: string | null;
      scheduleLabel?: string | null;
      vacationDays?: number | null;
      salary?: string | number | null;
      documentType: string;
      number?: string | null;
      viewKind: string;
    }[];
    vacations: {
      id: string;
      startDate: string;
      endDate: string;
      positionLabel: string;
      divisionName?: string | null;
      positionName?: string | null;
      gradeName?: string | null;
      vacationType: string;
      documentType: string;
      days: number;
      vacationPay?: string | number | null;
    }[];
    trips: {
      id: string;
      startDate: string;
      endDate: string;
      positionLabel: string;
      divisionName?: string | null;
      positionName?: string | null;
      gradeName?: string | null;
      organization: string;
      reason: string;
      fundedBy: string;
    }[];
    sickLeaves: {
      id: string;
      startDate: string;
      endDate: string;
      positionLabel: string;
      divisionName?: string | null;
      positionName?: string | null;
      gradeName?: string | null;
      number?: string | null;
      reason: string;
      coefficient: number | string;
    }[];
    vacationLimits: {
      period: string;
      vacationType: string;
      limitDays: number;
      usedDays: number;
      remainingDays: number;
    }[];
  };
  visitStats?: {
    periodLabel: string;
    totals: {
      onTime: number;
      late: number;
      earlyLeave: number;
      absent: number;
    };
    months: {
      key: string;
      label: string;
      onTime: number;
      late: number;
      earlyLeave: number;
      absent: number;
    }[];
  };
  profileExtras?: {
    nationality?: string | null;
    paymentType?: string | null;
    registeredAddress?: string | null;
  };
};

const PRIMARY_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'main', label: 'Основная информация', icon: '☰' },
  { key: 'calendar', label: 'Календарь', icon: '▦' },
  { key: 'docs', label: 'История документов', icon: '▤' },
  { key: 'locations', label: 'Локации', icon: '⌖' },
  { key: 'absences', label: 'Запросы на отсутствие', icon: '◷' },
];

const MORE_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'subordinates', label: 'Подчиненные' },
  { key: 'payroll', label: 'Оплата труда' },
  { key: 'efficiency', label: 'Эффективность' },
  { key: 'education', label: 'Образование' },
  { key: 'schedule_req', label: 'Запросы на изменение графика' },
  { key: 'accounts', label: 'Расчетные счета' },
  { key: 'documents', label: 'Документы' },
  { key: 'family', label: 'Семья' },
  { key: 'certificates', label: 'Справки' },
  { key: 'career', label: 'Трудовая деятельность' },
  { key: 'files', label: 'Файлы' },
  { key: 'inventory', label: 'Инвентарь' },
  { key: 'car', label: 'Автомобиль' },
  { key: 'identity', label: 'Идентификация' },
  { key: 'extra', label: 'Дополнительная информация' },
  { key: 'settings', label: 'Настройки' },
];

const DOC_LABELS: Record<string, string> = {
  hire: 'Приказ о работе',
  transfer: 'Приказ о переводе',
  dismiss: 'Приказ об увольнении',
  name_change: 'Смена ФИО',
  wage_change: 'Изменение оклада',
  other: 'Документ',
};

const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function fullName(parts: {
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
}) {
  return [parts.lastName, parts.firstName, parts.middleName]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function genderRu(g?: string | null) {
  if (!g) return '—';
  const v = g.toLowerCase();
  if (v.startsWith('m') || v === 'male' || v === 'муж') return 'Мужской';
  if (v.startsWith('f') || v === 'female' || v === 'жен') return 'Женский';
  return g;
}

function statusRu(status: string) {
  if (status === 'active') return 'Работает';
  if (status === 'dismissed') return 'Уволен';
  return status;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function absenceStatusRu(status: string, endDate?: string) {
  if (status === 'pending' || status === 'draft') return 'В ожидании';
  if (status === 'rejected') return 'Отклонен';
  if (status === 'cancelled') return 'Отменен';
  if (status === 'approved') {
    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) {
        return 'Завершен';
      }
    }
    return 'Подтвержден';
  }
  return status;
}

function absenceRequestKind(
  a: {
    startDate: string;
    endDate: string;
    meta?: { requestKind?: string } | null;
  },
): 'part_day' | 'full_day' | 'multi_day' {
  const k = a.meta?.requestKind;
  if (k === 'part_day' || k === 'full_day' || k === 'multi_day') return k;
  const start = a.startDate.slice(0, 10);
  const end = a.endDate.slice(0, 10);
  return start === end ? 'full_day' : 'multi_day';
}

function absDaySpan(startDate: string, endDate: string) {
  const s = new Date(startDate.slice(0, 10));
  const e = new Date(endDate.slice(0, 10));
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

type AbsenceTypeOpt = { id: string; name: string; code: string; paid?: boolean };

type AbsFilterDraft = {
  requestDateFrom: string;
  requestDateTo: string;
  absenceTypeIds: string[];
  requestKinds: ('part_day' | 'full_day' | 'multi_day')[];
  statuses: ('pending' | 'approved' | 'completed' | 'incoming' | 'rejected')[];
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
};

const EMPTY_ABS_FILTER: AbsFilterDraft = {
  requestDateFrom: '',
  requestDateTo: '',
  absenceTypeIds: [],
  requestKinds: [],
  statuses: [],
  startFrom: '',
  startTo: '',
  endFrom: '',
  endTo: '',
};

const DEFAULT_ABS_FILTER_ROWS = [
  'requestDate',
  'absenceType',
  'requestKind',
  'status',
  'start',
  'end',
] as const;

type AbsFilterRowKey = (typeof DEFAULT_ABS_FILTER_ROWS)[number] | 'accrualType' | 'createdAt';

function inDateRange(iso: string, from: string, to: string) {
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function matchAbsFilter(
  a: Detail['absences'][number],
  f: AbsFilterDraft,
): boolean {
  const requestDate = (a.meta?.requestDate as string) || a.createdAt || a.startDate;
  if (!inDateRange(String(requestDate), f.requestDateFrom, f.requestDateTo)) return false;
  if (f.absenceTypeIds.length && a.absenceType.id) {
    if (!f.absenceTypeIds.includes(a.absenceType.id)) return false;
  } else if (f.absenceTypeIds.length) {
    // types selected but absence has no id — match by name via loaded types is skipped
  }
  if (f.requestKinds.length) {
    if (!f.requestKinds.includes(absenceRequestKind(a))) return false;
  }
  if (f.statuses.length) {
    const label = absenceStatusRu(a.status, a.endDate);
    const ok = f.statuses.some((s) => {
      if (s === 'pending') return a.status === 'pending' || a.status === 'draft';
      if (s === 'rejected') return a.status === 'rejected';
      if (s === 'approved') return a.status === 'approved' && label === 'Подтвержден';
      if (s === 'completed') return label === 'Завершен';
      if (s === 'incoming') return a.status === 'pending' || a.status === 'draft';
      return false;
    });
    if (!ok) return false;
  }
  if (!inDateRange(a.startDate, f.startFrom, f.startTo)) return false;
  if (!inDateRange(a.endDate, f.endFrom, f.endTo)) return false;
  return true;
}

function fmtMoney(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat('ru-RU').format(n);
}

function scheduleLabel(row: Detail) {
  const s = row.schedule;
  if (!s) return '—';
  const base = `${s.startTime} - ${s.endTime}`;
  const fromSettings = s.settings?.weekPattern;
  const m = s.name.match(/(\d)\s*\/\s*(\d)/);
  const pattern = fromSettings ?? (m ? `${m[1]}/${m[2]}` : '6/1');
  return `${base} (${pattern}) (NEW)`;
}

function parsePassport(raw?: string | null) {
  const p = (raw ?? '').trim();
  if (!p) return { series: '', number: '' };
  const m = p.match(/^([A-Za-zА-Яа-яЁё]{1,3})\s*[-]?\s*(.+)$/);
  if (m) return { series: m[1].toUpperCase(), number: m[2].replace(/\s/g, '') };
  return { series: '', number: p };
}

function isWeekendPattern(
  date: Date,
  schedule?: Detail['schedule'] | string | null,
) {
  const day = date.getUTCDay();
  const settingsPattern =
    typeof schedule === 'object' && schedule?.settings?.weekPattern
      ? schedule.settings.weekPattern
      : null;
  const name =
    typeof schedule === 'string'
      ? schedule
      : schedule?.name ?? '';
  const n = name.replace(/\s/g, '');
  const pattern =
    settingsPattern ??
    (/\b5\/[12]\b/.test(n) || n.includes('(5/1)') || n.includes('(5/2)')
      ? '5/1'
      : '6/1');
  if (pattern === '6/1') return day === 0;
  return day === 0 || day === 6;
}

function SideIcon({ name }: { name: 'passport' | 'phone' | 'user' | 'cal' | 'pin' | 'pay' | 'tag' }) {
  if (name === 'phone') {
    return (
      <span className={styles.sideIcon} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
        </svg>
      </span>
    );
  }
  if (name === 'user') {
    return (
      <span className={styles.sideIcon} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </span>
    );
  }
  if (name === 'cal') {
    return (
      <span className={styles.sideIcon} aria-hidden>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </span>
    );
  }
  if (name === 'pin') {
    return (
      <span className={styles.sideIcon} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </span>
    );
  }
  if (name === 'pay') {
    return (
      <span className={styles.sideIcon} aria-hidden>
        <svg viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      </span>
    );
  }
  if (name === 'tag') {
    return (
      <span className={styles.sideIcon} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <path d="M7 7h.01" />
        </svg>
      </span>
    );
  }
  return (
    <span className={styles.sideIcon} aria-hidden>
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h6M7 12h10M7 16h8" />
      </svg>
    </span>
  );
}

function EmptyRow({ cols, text = 'нет данных' }: { cols: number; text?: string }) {
  return (
    <tr>
      <td className={styles.empty} colSpan={cols}>
        {text}
      </td>
    </tr>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const moreRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [row, setRow] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [faceMsg, setFaceMsg] = useState('');
  const [externalIdDraft, setExternalIdDraft] = useState('');
  const [tab, setTab] = useState<TabKey>('calendar');
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [docSub, setDocSub] = useState<'hr' | 'vac' | 'trip' | 'sick'>('hr');
  const [docQuery, setDocQuery] = useState('');
  const [docPage, setDocPage] = useState(1);
  const [locSub, setLocSub] = useState<'attached' | 'available'>('attached');
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1));
  });
  const [marksSub, setMarksSub] = useState<'calendar' | 'marks'>('calendar');
  const [passportOpen, setPassportOpen] = useState(false);
  const [passportValid, setPassportValid] = useState(true);
  const [locQuery, setLocQuery] = useState('');
  const [locPage, setLocPage] = useState(1);
  const [locSelected, setLocSelected] = useState<string[]>([]);
  const [locSortAsc, setLocSortAsc] = useState(true);
  const [absFilterOpen, setAbsFilterOpen] = useState(false);
  const [absAddOpen, setAbsAddOpen] = useState(false);
  const [absTypes, setAbsTypes] = useState<AbsenceTypeOpt[]>([]);
  const [absQueryPending, setAbsQueryPending] = useState('');
  const [absQueryDecided, setAbsQueryDecided] = useState('');
  const [absQueryAccrual, setAbsQueryAccrual] = useState('');
  const [absMenuOpen, setAbsMenuOpen] = useState<'pending' | 'decided' | 'accrual' | null>(
    null,
  );
  const [absSelected, setAbsSelected] = useState<string[]>([]);
  const [absFilterRows, setAbsFilterRows] = useState<AbsFilterRowKey[]>([
    ...DEFAULT_ABS_FILTER_ROWS,
  ]);
  const [absFilterDraft, setAbsFilterDraft] = useState<AbsFilterDraft>(EMPTY_ABS_FILTER);
  const [absFilterApplied, setAbsFilterApplied] = useState<AbsFilterDraft>(EMPTY_ABS_FILTER);
  const [absAddParamOpen, setAbsAddParamOpen] = useState(false);
  const [absForm, setAbsForm] = useState({
    absenceTypeId: '',
    startDate: '',
    endDate: '',
    note: '',
    requestKind: 'full_day' as 'part_day' | 'full_day' | 'multi_day',
  });
  const [absBusyId, setAbsBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await apiFetch<Detail>(`/api/employees/${id}`);
      setRow(data);
      setExternalIdDraft(data.externalId ?? '');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
      if (!actionMenuRef.current?.contains(e.target as Node)) {
        setActionMenuOpen(false);
        setReportsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function patchFlags(patch: {
    excludeFromStats?: boolean;
    systemAccessClosed?: boolean;
    marksBlocked?: boolean;
  }) {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Detail>(`/api/employees/${id}/flags`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setRow(data);
      setActionMenuOpen(false);
      setReportsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const dayByDate = useMemo(() => {
    const map = new Map<string, NonNullable<Detail['days']>[number]>();
    for (const d of row?.days ?? []) {
      map.set(d.workDate.slice(0, 10), d);
    }
    return map;
  }, [row?.days]);

  /** Approved vacation days shown as «Отпуск» on the calendar (Verifix). */
  const leaveDateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const a of row?.absences ?? []) {
      if (a.status !== 'approved') continue;
      const code = (a.absenceType?.code || '').toUpperCase();
      const name = (a.absenceType?.name || '').toLowerCase();
      const isVac =
        code.includes('VAC') ||
        code.includes('OTP') ||
        name.includes('татил') ||
        name.includes('отпуск') ||
        name.includes("ta'til");
      if (!isVac) continue;
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      const cur = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
      );
      const last = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
      );
      while (cur.getTime() <= last.getTime()) {
        set.add(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    return set;
  }, [row?.absences]);

  const calendarCells = useMemo(() => {
    const y = calMonth.getUTCFullYear();
    const m = calMonth.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1));
    const startPad = (first.getUTCDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(Date.UTC(y, m, 1 - (startPad - i)));
      cells.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(Date.UTC(y, m, day)), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({
        date: new Date(
          Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 1),
        ),
        inMonth: false,
      });
    }
    return cells;
  }, [calMonth]);

  const pendingAbsences = useMemo(() => {
    const q = absQueryPending.trim().toLowerCase();
    const f = absFilterApplied;
    return (row?.absences ?? []).filter((a) => {
      if (!['pending', 'draft'].includes(a.status)) return false;
      if (!matchAbsFilter(a, f)) return false;
      if (!q) return true;
      const hay = `${a.absenceType.name} ${a.note ?? ''} ${a.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [row?.absences, absQueryPending, absFilterApplied]);

  const decidedAbsences = useMemo(() => {
    const q = absQueryDecided.trim().toLowerCase();
    const f = absFilterApplied;
    return (row?.absences ?? []).filter((a) => {
      if (!['approved', 'rejected', 'cancelled'].includes(a.status)) return false;
      if (!matchAbsFilter(a, f)) return false;
      if (!q) return true;
      const hay = `${a.absenceType.name} ${a.note ?? ''} ${a.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [row?.absences, absQueryDecided, absFilterApplied]);

  const plannedAccruals = useMemo(() => {
    const q = absQueryAccrual.trim().toLowerCase();
    return (row?.plannedAccruals ?? []).filter((r) => {
      if (!q) return true;
      return `${r.absenceType} ${r.accrualType}`.toLowerCase().includes(q);
    });
  }, [row?.plannedAccruals, absQueryAccrual]);

  const scheduleReqs = (row?.requests ?? []).filter((r) => r.type === 'schedule_change');
  const attached = row?.attachedLocations ?? [];
  const available = row?.availableLocations ?? [];

  async function patchLocations(body: {
    attach?: { locationId: string; attachmentType?: 'auto' | 'manual' }[];
    detach?: string[];
  }) {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Detail>(`/api/employees/${id}/locations`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setRow(data);
      setLocSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка локаций');
    } finally {
      setBusy(false);
    }
  }

  async function loadAbsenceTypes() {
    try {
      const list = await apiFetch<AbsenceTypeOpt[]>('/api/hr/absence-types');
      setAbsTypes(list);
      if (!absForm.absenceTypeId && list[0]) {
        setAbsForm((f) => ({ ...f, absenceTypeId: list[0].id }));
      }
    } catch {
      /* ignore */
    }
  }

  async function createAbsence() {
    if (!absForm.absenceTypeId || !absForm.startDate || !absForm.endDate) {
      setError('Заполните вид отсутствия и даты');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/hr/absences', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: id,
          absenceTypeId: absForm.absenceTypeId,
          startDate: absForm.startDate,
          endDate: absForm.endDate,
          note: absForm.note || undefined,
          meta: { requestKind: absForm.requestKind },
        }),
      });
      setAbsAddOpen(false);
      setAbsForm({
        absenceTypeId: absTypes[0]?.id ?? '',
        startDate: '',
        endDate: '',
        note: '',
        requestKind: 'full_day',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания запроса');
    } finally {
      setBusy(false);
    }
  }

  async function patchAbsenceStatus(
    absenceId: string,
    status: 'approved' | 'rejected',
  ) {
    setAbsBusyId(absenceId);
    setError('');
    try {
      const reviewNote =
        status === 'rejected'
          ? window.prompt('Примечание руководителя (необязательно)') || undefined
          : undefined;
      await apiFetch(`/api/hr/absences/${absenceId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reviewNote,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка статуса');
    } finally {
      setAbsBusyId(null);
    }
  }

  function exportAbsExcel(
    rows: Detail['absences'],
    filename: string,
  ) {
    const header = [
      'Дата запроса',
      'Вид отсутствия',
      'Время',
      'Примечание',
      'Примечание руководителем',
      'Состояние',
    ];
    const lines = rows.map((a) => {
      const reqDate = (a.meta?.requestDate as string) || a.createdAt || a.startDate;
      const review = (a.meta?.reviewNote as string) || '';
      return [
        fmtDate(String(reqDate)),
        a.absenceType.name,
        `${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}`,
        a.note || '',
        review,
        absenceStatusRu(a.status, a.endDate),
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(';');
    });
    const bom = '\uFEFF';
    const blob = new Blob([bom + [header.join(';'), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setAbsMenuOpen(null);
  }

  async function dismiss() {
    if (!confirm('Уволить сотрудника?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function onFaceFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setFaceMsg('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiFetch(`/api/employees/${id}/face`, { method: 'POST', body: fd });
      setFaceMsg('Фото загружено — синхронизация с терминалом…');
      await load();
      try {
        const res = await apiFetch<{
          results: { name: string; ok: boolean; error?: string }[];
        }>(`/api/employees/${id}/face/sync`, { method: 'POST' });
        const ok = res.results.filter((r) => r.ok).length;
        const fail = res.results.filter((r) => !r.ok).length;
        setFaceMsg(`Фото + sync: ${ok} OK, ${fail} ошибок`);
        await load();
      } catch (syncErr) {
        setFaceMsg(
          syncErr instanceof Error
            ? `Фото загружено, ошибка sync: ${syncErr.message}`
            : 'Фото загружено, ошибка sync',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  }

  async function saveExternalId() {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ externalId: externalIdDraft || null }),
      });
      await load();
      setFaceMsg('Face ID сохранён');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function syncFace() {
    setBusy(true);
    setFaceMsg('');
    setError('');
    try {
      const res = await apiFetch<{
        results: { name: string; ok: boolean; error?: string }[];
      }>(`/api/employees/${id}/face/sync`, { method: 'POST' });
      const ok = res.results.filter((r) => r.ok).length;
      const fail = res.results.filter((r) => !r.ok).length;
      setFaceMsg(`Sync: ${ok} успешно, ${fail} ошибок`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка sync');
    } finally {
      setBusy(false);
    }
  }

  const moreActive = MORE_ITEMS.some((m) => m.key === tab);
  const moreLabel =
    MORE_ITEMS.find((m) => m.key === tab)?.label ?? 'Дополнительно';

  if (!row && !error) return <p className={styles.muted}>Загрузка…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <Link className={styles.back} href="/employees">
            ←
          </Link>
          <h1 className={styles.title}>Сотрудник</h1>
        </div>
        <div className={styles.sectionActions}>
          {row?.status === 'active' ? (
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={dismiss}>
              Уволить
            </button>
          ) : null}
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              router.refresh();
              load();
            }}
          >
            Обновить
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {row ? (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.sideTop} ref={actionMenuRef}>
              <Link className={styles.sideBack} href="/employees" aria-label="Назад">
                ‹
              </Link>
              <button
                type="button"
                className={styles.menuBtn}
                aria-label="Действия"
                onClick={() => {
                  setActionMenuOpen((v) => !v);
                  setReportsOpen(false);
                }}
              >
                ⋯
              </button>
              {actionMenuOpen ? (
                <div className={styles.menuPop}>
                  <button
                    type="button"
                    className={styles.menuItem}
                    disabled={busy}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    Изменить фото
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    disabled={busy}
                    onClick={() =>
                      patchFlags({
                        excludeFromStats: !row.profileFlags?.excludeFromStats,
                      })
                    }
                  >
                    {row.profileFlags?.excludeFromStats
                      ? 'Включить в статистику'
                      : 'Исключить из статистики'}
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    disabled={busy}
                    onClick={() =>
                      patchFlags({
                        systemAccessClosed: !row.profileFlags?.systemAccessClosed,
                      })
                    }
                  >
                    {row.profileFlags?.systemAccessClosed
                      ? 'Открыть доступ к системе'
                      : 'Закрыть доступ к системе'}
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    disabled={busy}
                    onClick={() =>
                      patchFlags({
                        marksBlocked: !row.profileFlags?.marksBlocked,
                      })
                    }
                  >
                    {row.profileFlags?.marksBlocked
                      ? 'Разблокировать отметки'
                      : 'Блокировать отметки'}
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => setReportsOpen((v) => !v)}
                  >
                    Отчеты ▸
                  </button>
                  {reportsOpen ? (
                    <div className={styles.menuSub}>
                      <span className={styles.menuSubLabel}>Отчеты</span>
                      {(
                        [
                          ['attendance', 'По посещениям'],
                          ['discipline', 'По дисциплине'],
                          ['time-types', 'По видам времени'],
                          ['accrual', 'Книга начисления'],
                        ] as const
                      ).map(([kind, label]) => (
                        <Link
                          key={kind}
                          className={styles.menuItem}
                          href={`/employees/${row.id}/reports/${kind}`}
                          onClick={() => setActionMenuOpen(false)}
                        >
                          {label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {row.status === 'active' ? (
                    <button
                      type="button"
                      className={styles.menuDanger}
                      disabled={busy}
                      onClick={() => {
                        setActionMenuOpen(false);
                        dismiss();
                      }}
                    >
                      Уволить сотрудника
                    </button>
                  ) : null}
                </div>
              ) : null}
              <input
                ref={photoInputRef}
                className={styles.hiddenFile}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  void onFaceFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </div>
            <div className={styles.avatarWrap}>
              {row.faceProfile?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.avatar}
                  src={row.faceProfile.photoUrl}
                  alt={fullName(row)}
                />
              ) : (
                <div className={`${styles.avatar} ${styles.avatarEmpty}`}>
                  {(row.firstName?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <div className={styles.nameRow}>
              <h2 className={styles.fullName}>{fullName(row)}</h2>
              {row.faceProfile?.photoUrl ? (
                <span className={styles.verified} title="Идентификация">
                  ✓
                </span>
              ) : null}
            </div>
            <p className={styles.roleLine}>
              {[row.position?.code || row.position?.name, row.division?.name]
                .filter(Boolean)
                .join(' , ') || '—'}
            </p>
            <div className={styles.statusWrap}>
              <span className={styles.statusPill}>{statusRu(row.status)}</span>
            </div>
            {(row.profileFlags?.excludeFromStats ||
              row.profileFlags?.systemAccessClosed ||
              row.profileFlags?.marksBlocked) && (
              <div className={styles.flagRow}>
                {row.profileFlags?.excludeFromStats ? (
                  <span className={styles.flagChip}>Вне статистики</span>
                ) : null}
                {row.profileFlags?.systemAccessClosed ? (
                  <span className={styles.flagChip}>Доступ закрыт</span>
                ) : null}
                {row.profileFlags?.marksBlocked ? (
                  <span className={styles.flagChip}>Отметки блок.</span>
                ) : null}
              </div>
            )}
            <ul className={styles.sideList}>
              <li
                className={`${styles.sideItem} ${styles.sideItemClickable}`}
                onClick={() => setPassportOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setPassportOpen(true);
                }}
                role="button"
                tabIndex={0}
              >
                <SideIcon name="passport" />
                <div>
                  <span className={styles.sideLabel}>Паспортные данные</span>
                  <span className={styles.sideValue}>
                    {row.person?.passport ?? '—'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <SideIcon name="phone" />
                <div>
                  <span className={styles.sideLabel}>Номер телефона</span>
                  <span className={styles.sideValue}>
                    {row.phone || row.person?.phone || '—'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <SideIcon name="user" />
                <div>
                  <span className={styles.sideLabel}>Руководитель</span>
                  <span className={styles.sideValue}>
                    {row.manager ? fullName(row.manager) : '—'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <SideIcon name="cal" />
                <div>
                  <span className={styles.sideLabel}>График работы</span>
                  {row.schedule?.id ? (
                    <Link
                      className={`${styles.sideValue} ${styles.sideLink}`}
                      href={`/employees/${row.id}/schedule`}
                    >
                      {scheduleLabel(row)}
                    </Link>
                  ) : (
                    <span className={styles.sideValue}>{scheduleLabel(row)}</span>
                  )}
                </div>
              </li>
              <li className={styles.sideItem}>
                <SideIcon name="pin" />
                <div>
                  <span className={styles.sideLabel}>Локации</span>
                  {attached.length ? (
                    <button
                      type="button"
                      className={`${styles.sideValue} ${styles.sideLink}`}
                      onClick={() => {
                        setTab('locations');
                        setLocSub('attached');
                        setMoreOpen(false);
                      }}
                    >
                      {`${attached
                        .slice(0, 3)
                        .map((l) => l.name)
                        .join(', ')}${attached.length > 3 ? '…' : ''}`}
                    </button>
                  ) : (
                    <span className={styles.sideValue}>—</span>
                  )}
                </div>
              </li>
              <li className={styles.sideItem}>
                <SideIcon name="pay" />
                <div>
                  <span className={styles.sideLabel}>Зарплата</span>
                  <span className={styles.sideValue}>
                    {fmtMoney(row.baseSalary)}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <SideIcon name="tag" />
                <div>
                  <span className={styles.sideLabel}>Тип оплаты труда</span>
                  <span className={styles.sideValue}>
                    {row.profileExtras?.paymentType ?? '—'}
                  </span>
                </div>
              </li>
            </ul>
          </aside>

          <section className={styles.main}>
            <div className={styles.tabs}>
              {PRIMARY_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
                  onClick={() => {
                    setTab(t.key);
                    setMoreOpen(false);
                  }}
                >
                  <span className={styles.tabIcon} aria-hidden>
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              ))}
              <div className={styles.moreWrap} ref={moreRef}>
                <button
                  type="button"
                  className={`${styles.moreBtn} ${moreActive ? styles.moreBtnActive : ''}`}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  {moreActive ? moreLabel : 'Дополнительно'} ▾
                </button>
                {moreOpen ? (
                  <div className={styles.moreMenu}>
                    {MORE_ITEMS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        className={`${styles.moreItem} ${
                          tab === m.key ? styles.moreItemActive : ''
                        }`}
                        onClick={() => {
                          setTab(m.key);
                          setMoreOpen(false);
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.panelBody}>
              {tab === 'main' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Персональные данные</h3>
                      <div className={styles.sectionActions}>
                        <button type="button" className={styles.btnGhost}>
                          История изменений
                        </button>
                        <button type="button" className={styles.btnGhost}>
                          Изменить
                        </button>
                      </div>
                    </div>
                    <div className={styles.fieldGrid}>
                      <div className={styles.field}>
                        <label>Имя</label>
                        <div className={styles.fieldValue}>{row.firstName}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Фамилия</label>
                        <div className={styles.fieldValue}>{row.lastName}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Отчество</label>
                        <div className={styles.fieldValue}>
                          {row.middleName || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Национальность</label>
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.nationality ?? '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Дата рождения</label>
                        <div className={styles.fieldValue}>
                          {fmtDate(row.person?.birthDate)}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Пол</label>
                        <div className={styles.fieldValue}>
                          {genderRu(row.person?.gender)}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>ПИНФЛ</label>
                        <div className={styles.fieldValue}>
                          {row.person?.pinfl || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>ИНПС</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                      <div className={styles.field}>
                        <label>ИНН</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Контакты и адреса</h3>
                      <div className={styles.sectionActions}>
                        <button type="button" className={styles.btnGhost}>
                          История изменений
                        </button>
                        <button type="button" className={styles.btnGhost}>
                          Изменить
                        </button>
                      </div>
                    </div>
                    <div className={styles.fieldGrid}>
                      <div className={styles.field}>
                        <label>Номер телефона</label>
                        <div className={styles.fieldValue}>
                          {row.phone || row.person?.phone || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>E-mail</label>
                        <div className={styles.fieldValue}>
                          {row.email || row.person?.email || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Дополнительный номер телефона</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                      <div className={styles.field}>
                        <label>Корпоративный E-mail</label>
                        <div className={styles.fieldValue}>{row.email || '—'}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Регион</label>
                        <div className={styles.fieldValue}>
                          {row.region?.name || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Адрес</label>
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.registeredAddress ||
                            row.region?.name ||
                            '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Адрес по прописке</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <div className={styles.statsRow}>
                      <h3 className={styles.sectionTitle}>Статистика посещений</h3>
                      <span className={styles.muted}>
                        {row.visitStats?.periodLabel ?? 'Последние 12 месяцев'}
                      </span>
                    </div>
                    <div className={styles.statsBox}>
                      {(() => {
                        const months = row.visitStats?.months ?? [];
                        const totals = row.visitStats?.totals;
                        const hasData =
                          !!totals &&
                          totals.onTime +
                            totals.late +
                            totals.earlyLeave +
                            totals.absent >
                            0;
                        if (!hasData) {
                          return (
                            <div style={{ textAlign: 'center' }}>
                              <div className={styles.statsEmptyIcon}>📊</div>
                              <div>Нет данных для отображения</div>
                            </div>
                          );
                        }
                        const max = Math.max(
                          1,
                          ...months.map(
                            (m) =>
                              m.onTime + m.late + m.earlyLeave + m.absent,
                          ),
                        );
                        return (
                          <div className={styles.statsChart}>
                            <div className={styles.statsBars}>
                              {months.map((m) => {
                                const total =
                                  m.onTime +
                                  m.late +
                                  m.earlyLeave +
                                  m.absent;
                                const h = Math.max(
                                  4,
                                  Math.round((total / max) * 110),
                                );
                                const pct = (n: number) =>
                                  total ? `${(n / total) * 100}%` : '0%';
                                return (
                                  <div key={m.key} className={styles.statsBarCol}>
                                    <div
                                      className={styles.statsBarStack}
                                      style={{ height: h }}
                                      title={`${m.label}: вовремя ${m.onTime}, опозд. ${m.late}`}
                                    >
                                      <div
                                        className={`${styles.statsSeg} ${styles.statsSegOn}`}
                                        style={{ height: pct(m.onTime) }}
                                      />
                                      <div
                                        className={`${styles.statsSeg} ${styles.statsSegLate}`}
                                        style={{ height: pct(m.late) }}
                                      />
                                      <div
                                        className={`${styles.statsSeg} ${styles.statsSegEarly}`}
                                        style={{ height: pct(m.earlyLeave) }}
                                      />
                                      <div
                                        className={`${styles.statsSeg} ${styles.statsSegAbsent}`}
                                        style={{ height: pct(m.absent) }}
                                      />
                                    </div>
                                    <div className={styles.statsBarLabel}>
                                      {m.label.split(' ')[0]?.slice(0, 3)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={styles.statsLegend} style={{ marginTop: 10 }}>
                      <span className={styles.statsLegendItem}>
                        <span className={`${styles.statsDot} ${styles.dotOn}`} />
                        Вовремя
                      </span>
                      <span className={styles.statsLegendItem}>
                        <span className={`${styles.statsDot} ${styles.dotLate}`} />
                        Опоздание
                      </span>
                      <span className={styles.statsLegendItem}>
                        <span className={`${styles.statsDot} ${styles.dotEarly}`} />
                        Ранний уход
                      </span>
                      <span className={styles.statsLegendItem}>
                        <span className={`${styles.statsDot} ${styles.dotAbsent}`} />
                        Отсутствие
                      </span>
                    </div>
                    <div className={styles.tableWrap} style={{ marginTop: 12 }}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>№</th>
                            <th>Месяц</th>
                            <th>Вовремя</th>
                            <th>Опоздания</th>
                            <th>Ранние уходы</th>
                            <th>Отсутствия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.visitStats?.months ?? []).every(
                            (m) =>
                              m.onTime +
                                m.late +
                                m.earlyLeave +
                                m.absent ===
                              0,
                          ) ? (
                            <EmptyRow cols={6} text="Нет данных" />
                          ) : (
                            (row.visitStats?.months ?? [])
                              .filter(
                                (m) =>
                                  m.onTime +
                                    m.late +
                                    m.earlyLeave +
                                    m.absent >
                                  0,
                              )
                              .map((m, i) => (
                                <tr key={m.key}>
                                  <td>{i + 1}</td>
                                  <td>{m.label}</td>
                                  <td>{m.onTime}</td>
                                  <td>{m.late}</td>
                                  <td>{m.earlyLeave}</td>
                                  <td>{m.absent}</td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}

              {tab === 'calendar' ? (
                <>
                  <div className={styles.subTabs}>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        marksSub === 'calendar' ? styles.subTabActive : ''
                      }`}
                      onClick={() => setMarksSub('calendar')}
                    >
                      Календарь
                    </button>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        marksSub === 'marks' ? styles.subTabActive : ''
                      }`}
                      onClick={() => setMarksSub('marks')}
                    >
                      Отметки
                    </button>
                  </div>

                  {marksSub === 'calendar' ? (
                    <>
                      <div className={styles.calHead}>
                        <h3 className={styles.calTitle}>
                          {MONTHS_RU[calMonth.getUTCMonth()]}{' '}
                          {calMonth.getUTCFullYear()} г.
                        </h3>
                        <div className={styles.calNav}>
                          <button
                            type="button"
                            className={styles.calNavBtn}
                            onClick={() =>
                              setCalMonth(
                                new Date(
                                  Date.UTC(
                                    calMonth.getUTCFullYear(),
                                    calMonth.getUTCMonth() - 1,
                                    1,
                                  ),
                                ),
                              )
                            }
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className={styles.calNavBtn}
                            onClick={() =>
                              setCalMonth(
                                new Date(
                                  Date.UTC(
                                    calMonth.getUTCFullYear(),
                                    calMonth.getUTCMonth() + 1,
                                    1,
                                  ),
                                ),
                              )
                            }
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => {
                              const n = new Date();
                              setCalMonth(
                                new Date(
                                  Date.UTC(n.getFullYear(), n.getMonth(), 1),
                                ),
                              );
                            }}
                          >
                            Сегодня
                          </button>
                        </div>
                      </div>
                      <div className={styles.calGrid}>
                        {DOW.map((d) => (
                          <div key={d} className={styles.calDow}>
                            {d}
                          </div>
                        ))}
                        {calendarCells.map(({ date, inMonth }) => {
                          const key = date.toISOString().slice(0, 10);
                          const day = dayByDate.get(key);
                          const off = isWeekendPattern(date, row.schedule);
                          const todayKey = new Date().toISOString().slice(0, 10);
                          const isToday = inMonth && key === todayKey;
                          let bar: ReactNode = null;
                          if (inMonth) {
                            if (leaveDateKeys.has(key)) {
                              bar = (
                                <span className={`${styles.calBar} ${styles.calLeave}`}>
                                  Отпуск
                                </span>
                              );
                            } else if (day?.status === 'day_off' || off) {
                              bar = (
                                <span className={`${styles.calBar} ${styles.calOff}`}>
                                  Выходной
                                </span>
                              );
                            } else {
                              bar = (
                                <span className={`${styles.calBar} ${styles.calWork}`}>
                                  {row.schedule
                                    ? `${row.schedule.startTime} - ${row.schedule.endTime}`
                                    : '09:00 - 18:00'}
                                </span>
                              );
                            }
                          }
                          return (
                            <div
                              key={key + String(inMonth)}
                              className={`${styles.calCell} ${
                                inMonth ? '' : styles.calCellMuted
                              }`}
                            >
                              <div
                                className={`${styles.calDayNum} ${
                                  isToday ? styles.calDayNumToday : ''
                                }`}
                              >
                                {date.getUTCDate()}
                                {isToday ? ' Сегодня' : ''}
                              </div>
                              {bar}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Время</th>
                            <th>Направление</th>
                            <th>Источник</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.marks ?? []).length === 0 ? (
                            <EmptyRow cols={3} />
                          ) : (
                            (row.marks ?? []).map((m) => (
                              <tr key={m.id}>
                                <td>{new Date(m.occurredAt).toLocaleString('ru-RU')}</td>
                                <td>{m.direction}</td>
                                <td>
                                  <span className={styles.badge}>{m.source}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}

              {tab === 'docs' ? (
                <>
                  <h3 className={styles.blockTitle}>Основное место работы</h3>
                  <div className={styles.subTabs}>
                    {(
                      [
                        ['hr', 'Кадровые документы'],
                        ['vac', 'Отпуска'],
                        ['trip', 'Командировки'],
                        ['sick', 'Больничные листы'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className={`${styles.subTab} ${
                          docSub === k ? styles.subTabActive : ''
                        }`}
                        onClick={() => {
                          setDocSub(k);
                          setDocPage(1);
                          setDocQuery('');
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const dh = row.documentHistory;
                    const q = docQuery.trim().toLowerCase();
                    const match = (...vals: (string | number | null | undefined)[]) =>
                      !q ||
                      vals.some((v) =>
                        String(v ?? '')
                          .toLowerCase()
                          .includes(q),
                      );
                    let rows: ReactNode[] = [];
                    let cols = 10;

                    if (docSub === 'hr') {
                      cols = 10;
                      const list = (dh?.hr ?? []).filter((d) =>
                        match(
                          d.documentType,
                          d.positionLabel,
                          d.divisionName,
                          d.positionName,
                          d.number,
                        ),
                      );
                      rows =
                        list.length === 0
                          ? [<EmptyRow key="e" cols={cols} />]
                          : list.map((d) => (
                              <tr key={d.id}>
                                <td>
                                  <div className={styles.dateCell}>
                                    <span>{fmtDate(d.startDate)}</span>
                                    <Link
                                      className={styles.viewBtn}
                                      href={`/employees/${row.id}/documents/${d.viewKind}`}
                                    >
                                      Просмотреть
                                    </Link>
                                  </div>
                                </td>
                                <td>{d.endDate ? fmtDate(d.endDate) : '—'}</td>
                                <td>{d.positionLabel || '—'}</td>
                                <td>{d.divisionName || '—'}</td>
                                <td>{d.positionName || '—'}</td>
                                <td>{d.gradeName || '—'}</td>
                                <td>{d.scheduleLabel || scheduleLabel(row)}</td>
                                <td>{d.vacationDays ?? '—'}</td>
                                <td>{fmtMoney(d.salary)}</td>
                                <td>
                                  <span className={styles.badge}>
                                    {d.documentType}
                                  </span>
                                </td>
                              </tr>
                            ));
                    } else if (docSub === 'vac') {
                      cols = 10;
                      const list = (dh?.vacations ?? []).filter((d) =>
                        match(d.vacationType, d.documentType, d.positionLabel),
                      );
                      rows =
                        list.length === 0
                          ? [<EmptyRow key="e" cols={cols} />]
                          : list.map((d) => (
                              <tr key={d.id}>
                                <td>{fmtDate(d.startDate)}</td>
                                <td>{fmtDate(d.endDate)}</td>
                                <td>{d.positionLabel || '—'}</td>
                                <td>{d.divisionName || '—'}</td>
                                <td>{d.positionName || '—'}</td>
                                <td>{d.gradeName || '—'}</td>
                                <td>{d.vacationType}</td>
                                <td>
                                  <span className={styles.badge}>
                                    {d.documentType}
                                  </span>
                                </td>
                                <td>{d.days}</td>
                                <td>{fmtMoney(d.vacationPay)}</td>
                              </tr>
                            ));
                    } else if (docSub === 'trip') {
                      cols = 9;
                      const list = (dh?.trips ?? []).filter((d) =>
                        match(d.organization, d.reason, d.fundedBy),
                      );
                      rows =
                        list.length === 0
                          ? [<EmptyRow key="e" cols={cols} text="Нет данных" />]
                          : list.map((d) => (
                              <tr key={d.id}>
                                <td>{fmtDate(d.startDate)}</td>
                                <td>{fmtDate(d.endDate)}</td>
                                <td>{d.positionLabel || '—'}</td>
                                <td>{d.divisionName || '—'}</td>
                                <td>{d.positionName || '—'}</td>
                                <td>{d.gradeName || '—'}</td>
                                <td>{d.organization}</td>
                                <td>{d.reason}</td>
                                <td>{d.fundedBy}</td>
                              </tr>
                            ));
                    } else {
                      cols = 9;
                      const list = (dh?.sickLeaves ?? []).filter((d) =>
                        match(d.reason, d.number, d.positionLabel),
                      );
                      rows =
                        list.length === 0
                          ? [<EmptyRow key="e" cols={cols} text="Нет данных" />]
                          : list.map((d) => (
                              <tr key={d.id}>
                                <td>{fmtDate(d.startDate)}</td>
                                <td>{fmtDate(d.endDate)}</td>
                                <td>{d.positionLabel || '—'}</td>
                                <td>{d.divisionName || '—'}</td>
                                <td>{d.positionName || '—'}</td>
                                <td>{d.gradeName || '—'}</td>
                                <td>{d.number || '—'}</td>
                                <td>{d.reason}</td>
                                <td>{d.coefficient}</td>
                              </tr>
                            ));
                    }

                    const pageSize = 20;
                    const total = rows.length === 1 && !dh ? 0 : rows.filter((r) => (r as { key?: string })?.key !== 'e').length;
                    // paginate only real data rows
                    const dataRows = rows[0] && (rows[0] as { key?: string }).key === 'e' ? rows : rows;
                    const isEmpty =
                      dataRows.length === 1 &&
                      String((dataRows[0] as { key?: string })?.key) === 'e';
                    const pageCount = isEmpty
                      ? 1
                      : Math.max(1, Math.ceil(dataRows.length / pageSize));
                    const page = Math.min(docPage, pageCount);
                    const slice = isEmpty
                      ? dataRows
                      : dataRows.slice((page - 1) * pageSize, page * pageSize);
                    const countLabel = isEmpty
                      ? '0 / 0'
                      : `${(page - 1) * pageSize + 1}-${Math.min(
                          page * pageSize,
                          dataRows.length,
                        )} / ${dataRows.length}`;

                    return (
                      <>
                        <div className={styles.locToolbar}>
                          <input
                            className={styles.locSearch}
                            value={docQuery}
                            onChange={(e) => {
                              setDocQuery(e.target.value);
                              setDocPage(1);
                            }}
                            placeholder="Поиск"
                          />
                          <button
                            type="button"
                            className={styles.locToolBtn}
                            title="Обновить"
                            onClick={() => void load()}
                          >
                            ↻
                          </button>
                          <button
                            type="button"
                            className={styles.locToolBtn}
                            title="Фильтр"
                          >
                            ▤
                          </button>
                          <div className={styles.locPager}>
                            <span>{countLabel}</span>
                            <button
                              type="button"
                              className={styles.locToolBtn}
                              disabled={page <= 1}
                              onClick={() =>
                                setDocPage((p) => Math.max(1, p - 1))
                              }
                            >
                              ‹
                            </button>
                            <span>{page}</span>
                            <button
                              type="button"
                              className={styles.locToolBtn}
                              disabled={page >= pageCount}
                              onClick={() =>
                                setDocPage((p) => Math.min(pageCount, p + 1))
                              }
                            >
                              ›
                            </button>
                          </div>
                        </div>
                        <div className={styles.tableWrap}>
                          <table className={`${styles.table} ${styles.locTable}`}>
                            <thead>
                              <tr>
                                <th>Дата начала</th>
                                <th>Дата окончания</th>
                                <th>Позиция</th>
                                <th>Подразделение</th>
                                <th>Должность</th>
                                <th>Разряд</th>
                                {docSub === 'hr' ? (
                                  <>
                                    <th>График работы</th>
                                    <th>Кол-во отпускных дней</th>
                                    <th>Оклад</th>
                                    <th>Тип документа</th>
                                  </>
                                ) : null}
                                {docSub === 'vac' ? (
                                  <>
                                    <th>Тип отпуска</th>
                                    <th>Тип документа</th>
                                    <th>Кол-во дней отпуска</th>
                                    <th>Отпускные</th>
                                  </>
                                ) : null}
                                {docSub === 'trip' ? (
                                  <>
                                    <th>Организация</th>
                                    <th>Причина командировки</th>
                                    <th>За счет средств</th>
                                  </>
                                ) : null}
                                {docSub === 'sick' ? (
                                  <>
                                    <th>Номер</th>
                                    <th>Причина ухода на больничный</th>
                                    <th>Коэффициент</th>
                                  </>
                                ) : null}
                              </tr>
                            </thead>
                            <tbody>{slice}</tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}

                  {docSub === 'vac' ? (
                    <div className={styles.section} style={{ marginTop: '1.25rem' }}>
                      <h3 className={styles.blockTitle}>Лимит отпуска</h3>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Период</th>
                              <th>Тип отпуска</th>
                              <th>Лимит дней</th>
                              <th>Использовано дней</th>
                              <th>Осталось дней</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              row.documentHistory?.vacationLimits ??
                              row.vacationLimits ??
                              []
                            ).length === 0 ? (
                              <EmptyRow cols={5} />
                            ) : (
                              (
                                row.documentHistory?.vacationLimits ??
                                row.vacationLimits ??
                                []
                              ).map((v) => (
                                <tr key={`${v.period}-${v.vacationType}`}>
                                  <td>{v.period}</td>
                                  <td>{v.vacationType}</td>
                                  <td>{v.limitDays}</td>
                                  <td>{v.usedDays}</td>
                                  <td>{v.remainingDays}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {tab === 'locations' ? (
                <>
                  <div className={styles.locHead}>
                    <h3 className={styles.locTitle}>Локации</h3>
                    <div className={styles.locActions}>
                      {locSub === 'available' ? (
                        <button
                          type="button"
                          className={styles.btn}
                          disabled={busy || locSelected.length === 0}
                          onClick={() =>
                            void patchLocations({
                              attach: locSelected.map((locationId) => ({
                                locationId,
                                attachmentType: 'auto' as const,
                              })),
                            })
                          }
                        >
                          Прикрепить
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.btnGhost}
                          disabled={busy || locSelected.length === 0}
                          onClick={() =>
                            void patchLocations({ detach: locSelected })
                          }
                        >
                          Открепить
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={styles.subTabs}>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        locSub === 'attached' ? styles.subTabActive : ''
                      }`}
                      onClick={() => {
                        setLocSub('attached');
                        setLocPage(1);
                        setLocSelected([]);
                      }}
                    >
                      Прикрепленные
                    </button>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        locSub === 'available' ? styles.subTabActive : ''
                      }`}
                      onClick={() => {
                        setLocSub('available');
                        setLocPage(1);
                        setLocSelected([]);
                      }}
                    >
                      Доступные
                    </button>
                  </div>
                  {(() => {
                    const source = locSub === 'attached' ? attached : available;
                    const q = locQuery.trim().toLowerCase();
                    let filtered = q
                      ? source.filter(
                          (l) =>
                            l.name.toLowerCase().includes(q) ||
                            (l.address ?? '').toLowerCase().includes(q) ||
                            (l.locationType?.name ?? '')
                              .toLowerCase()
                              .includes(q) ||
                            l.code.toLowerCase().includes(q),
                        )
                      : [...source];
                    filtered = filtered.sort((a, b) => {
                      const cmp = a.name.localeCompare(b.name, 'ru');
                      return locSortAsc ? cmp : -cmp;
                    });
                    const pageSize = 20;
                    const pages = Math.max(
                      1,
                      Math.ceil(filtered.length / pageSize),
                    );
                    const page = Math.min(locPage, pages);
                    const slice = filtered.slice(
                      (page - 1) * pageSize,
                      page * pageSize,
                    );
                    const allOnPageSelected =
                      slice.length > 0 &&
                      slice.every((l) => locSelected.includes(l.id));
                    return (
                      <>
                        <div className={styles.locToolbar}>
                          <input
                            className={styles.locSearch}
                            value={locQuery}
                            onChange={(e) => {
                              setLocQuery(e.target.value);
                              setLocPage(1);
                            }}
                            placeholder="Поиск"
                          />
                          <button
                            type="button"
                            className={styles.locToolBtn}
                            title="Обновить"
                            onClick={() => void load()}
                          >
                            ↻
                          </button>
                          <button
                            type="button"
                            className={styles.locToolBtn}
                            title="Фильтр"
                          >
                            ▤
                          </button>
                          <button
                            type="button"
                            className={styles.locToolBtn}
                            title="Колонки"
                          >
                            ⚙
                          </button>
                          <div className={styles.locPager}>
                            <span>
                              {filtered.length
                                ? `${(page - 1) * pageSize + 1}-${Math.min(
                                    page * pageSize,
                                    filtered.length,
                                  )} / ${filtered.length}`
                                : '0 / 0'}
                            </span>
                            <button
                              type="button"
                              className={styles.locToolBtn}
                              disabled={page <= 1}
                              onClick={() =>
                                setLocPage((p) => Math.max(1, p - 1))
                              }
                            >
                              ‹
                            </button>
                            <span>{page}</span>
                            <button
                              type="button"
                              className={styles.locToolBtn}
                              disabled={page >= pages}
                              onClick={() =>
                                setLocPage((p) => Math.min(pages, p + 1))
                              }
                            >
                              ›
                            </button>
                          </div>
                        </div>
                        <div className={styles.tableWrap}>
                          <table
                            className={`${styles.table} ${styles.locTable}`}
                          >
                            <thead>
                              <tr>
                                <th>
                                  <input
                                    type="checkbox"
                                    aria-label="Выбрать все"
                                    checked={allOnPageSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setLocSelected((prev) => [
                                          ...new Set([
                                            ...prev,
                                            ...slice.map((l) => l.id),
                                          ]),
                                        ]);
                                      } else {
                                        const drop = new Set(
                                          slice.map((l) => l.id),
                                        );
                                        setLocSelected((prev) =>
                                          prev.filter((x) => !drop.has(x)),
                                        );
                                      }
                                    }}
                                  />
                                </th>
                                <th>
                                  <button
                                    type="button"
                                    className={styles.thSort}
                                    onClick={() => setLocSortAsc((v) => !v)}
                                  >
                                    Название {locSortAsc ? '↑' : '↓'}
                                  </button>
                                </th>
                                <th>Регион</th>
                                <th>Тип локации</th>
                                <th>Адрес</th>
                                <th>Тип прикрепления</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {slice.length === 0 ? (
                                <EmptyRow cols={7} />
                              ) : (
                                slice.map((l) => (
                                  <tr key={l.id}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        aria-label={l.name}
                                        checked={locSelected.includes(l.id)}
                                        onChange={(e) => {
                                          setLocSelected((prev) =>
                                            e.target.checked
                                              ? [...prev, l.id]
                                              : prev.filter((x) => x !== l.id),
                                          );
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className={styles.tableLink}
                                        onClick={() => setLocSelected([l.id])}
                                      >
                                        {l.name}
                                      </button>
                                    </td>
                                    <td>{l.regionName || '—'}</td>
                                    <td>{l.locationType?.name ?? '—'}</td>
                                    <td>{l.address || '—'}</td>
                                    <td>
                                      {locSub === 'attached' ? (
                                        <button
                                          type="button"
                                          className={
                                            l.attachmentType === 'manual'
                                              ? styles.badgeManual
                                              : styles.badgeAuto
                                          }
                                          disabled={busy}
                                          title="Сменить тип прикрепления"
                                          onClick={() =>
                                            void patchLocations({
                                              attach: [
                                                {
                                                  locationId: l.id,
                                                  attachmentType:
                                                    l.attachmentType ===
                                                    'manual'
                                                      ? 'auto'
                                                      : 'manual',
                                                },
                                              ],
                                            })
                                          }
                                        >
                                          {l.attachmentType === 'manual'
                                            ? 'Вручную'
                                            : 'Авто'}
                                        </button>
                                      ) : (
                                        <span className={styles.muted}>—</span>
                                      )}
                                    </td>
                                    <td>
                                      {locSub === 'attached' ? (
                                        <button
                                          type="button"
                                          className={styles.viewBtn}
                                          disabled={busy}
                                          onClick={() =>
                                            void patchLocations({
                                              detach: [l.id],
                                            })
                                          }
                                        >
                                          Открепить
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className={styles.viewBtn}
                                          disabled={busy}
                                          onClick={() =>
                                            void patchLocations({
                                              attach: [
                                                {
                                                  locationId: l.id,
                                                  attachmentType: 'auto',
                                                },
                                              ],
                                            })
                                          }
                                        >
                                          Прикрепить
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : null}

              {tab === 'absences' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Не подтвержденные запросы</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        disabled={busy}
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsAddOpen(true);
                        }}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.locToolbar}>
                      <input
                        className={styles.locSearch}
                        placeholder="Поиск"
                        value={absQueryPending}
                        onChange={(e) => setAbsQueryPending(e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.locToolBtn}
                        title="Фильтр"
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsFilterDraft({ ...absFilterApplied });
                          setAbsFilterOpen(true);
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        className={styles.locToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.locToolBtn}
                          title="Ещё"
                          onClick={() =>
                            setAbsMenuOpen((m) => (m === 'pending' ? null : 'pending'))
                          }
                        >
                          ⋮
                        </button>
                        {absMenuOpen === 'pending' ? (
                          <div className={styles.absMenu}>
                            <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                            <button type="button" className={styles.absMenuItem}>
                              По дате запроса
                            </button>
                            <div className={styles.absMenuGroup}>НАСТРОЙКА ТАБЛИЦЫ</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() =>
                                exportAbsExcel(pendingAbsences, 'unconfirmed-requests.csv')
                              }
                            >
                              СКАЧАТЬ В EXCEL
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th style={{ width: 36 }}>
                              <input
                                type="checkbox"
                                checked={
                                  pendingAbsences.length > 0 &&
                                  pendingAbsences.every((a) => absSelected.includes(a.id))
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAbsSelected((s) => [
                                      ...new Set([...s, ...pendingAbsences.map((a) => a.id)]),
                                    ]);
                                  } else {
                                    const drop = new Set(pendingAbsences.map((a) => a.id));
                                    setAbsSelected((s) => s.filter((id) => !drop.has(id)));
                                  }
                                }}
                              />
                            </th>
                            <th>Дата запроса</th>
                            <th>Вид отсутствия</th>
                            <th>Время</th>
                            <th>Примечание</th>
                            <th>Примечание руководителем</th>
                            <th>Состояние</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {pendingAbsences.length === 0 ? (
                            <EmptyRow cols={8} />
                          ) : (
                            pendingAbsences.map((a) => {
                              const reqDate =
                                (a.meta?.requestDate as string) ||
                                a.createdAt ||
                                a.startDate;
                              const review = (a.meta?.reviewNote as string) || '';
                              return (
                                <tr key={a.id}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={absSelected.includes(a.id)}
                                      onChange={(e) => {
                                        setAbsSelected((s) =>
                                          e.target.checked
                                            ? [...s, a.id]
                                            : s.filter((x) => x !== a.id),
                                        );
                                      }}
                                    />
                                  </td>
                                  <td>{fmtDate(String(reqDate))}</td>
                                  <td>{a.absenceType.name}</td>
                                  <td>
                                    {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                                    {absDaySpan(a.startDate, a.endDate) === 1 &&
                                    absenceRequestKind(a) === 'part_day'
                                      ? ' (часть дня)'
                                      : ''}
                                  </td>
                                  <td>{a.note || '—'}</td>
                                  <td>{review || '—'}</td>
                                  <td>
                                    <span className={`${styles.badge} ${styles.badgeWarn}`}>
                                      {absenceStatusRu(a.status, a.endDate)}
                                    </span>
                                  </td>
                                  <td className={styles.absActions}>
                                    <button
                                      type="button"
                                      className={styles.viewBtn}
                                      disabled={absBusyId === a.id || busy}
                                      onClick={() => void patchAbsenceStatus(a.id, 'approved')}
                                    >
                                      Подтвердить
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      disabled={absBusyId === a.id || busy}
                                      onClick={() => void patchAbsenceStatus(a.id, 'rejected')}
                                    >
                                      Отклонить
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h3 className={styles.blockTitle}>
                      Подтвержденные и отклоненные запросы
                    </h3>
                    <div className={styles.locToolbar}>
                      <input
                        className={styles.locSearch}
                        placeholder="Поиск"
                        value={absQueryDecided}
                        onChange={(e) => setAbsQueryDecided(e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.locToolBtn}
                        title="Фильтр"
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsFilterDraft({ ...absFilterApplied });
                          setAbsFilterOpen(true);
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        className={styles.locToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.locToolBtn}
                          onClick={() =>
                            setAbsMenuOpen((m) => (m === 'decided' ? null : 'decided'))
                          }
                        >
                          ⋮
                        </button>
                        {absMenuOpen === 'decided' ? (
                          <div className={styles.absMenu}>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() =>
                                exportAbsExcel(decidedAbsences, 'confirmed-requests.csv')
                              }
                            >
                              СКАЧАТЬ В EXCEL
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th style={{ width: 36 }} />
                            <th>Дата запроса</th>
                            <th>Вид отсутствия</th>
                            <th>Время</th>
                            <th>Примечание</th>
                            <th>Примечание руководителем</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decidedAbsences.length === 0 ? (
                            <EmptyRow cols={7} />
                          ) : (
                            decidedAbsences.map((a) => {
                              const reqDate =
                                (a.meta?.requestDate as string) ||
                                a.createdAt ||
                                a.startDate;
                              const review = (a.meta?.reviewNote as string) || '';
                              const label = absenceStatusRu(a.status, a.endDate);
                              const badgeClass =
                                a.status === 'rejected'
                                  ? styles.badgeDanger
                                  : label === 'Завершен'
                                    ? styles.badgeMuted
                                    : styles.badgeOk;
                              return (
                                <tr key={a.id}>
                                  <td>
                                    <input type="checkbox" readOnly tabIndex={-1} />
                                  </td>
                                  <td>{fmtDate(String(reqDate))}</td>
                                  <td>{a.absenceType.name}</td>
                                  <td>
                                    {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                                  </td>
                                  <td>{a.note || '—'}</td>
                                  <td>{review || '—'}</td>
                                  <td>
                                    <span className={`${styles.badge} ${badgeClass}`}>
                                      {label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h3 className={styles.blockTitle}>Плановые начисления</h3>
                    <div className={styles.locToolbar}>
                      <input
                        className={styles.locSearch}
                        placeholder="Поиск"
                        value={absQueryAccrual}
                        onChange={(e) => setAbsQueryAccrual(e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.locToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Вид отсутствия</th>
                            <th>Вид начисления</th>
                            <th>Начало</th>
                            <th>Конец</th>
                            <th>Начислено</th>
                            <th>Использовано</th>
                            <th>Осталось</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plannedAccruals.length === 0 ? (
                            <EmptyRow cols={7} />
                          ) : (
                            plannedAccruals.map((r) => (
                              <tr key={r.id}>
                                <td>{r.absenceType}</td>
                                <td>{r.accrualType}</td>
                                <td>{fmtDate(r.startDate)}</td>
                                <td>{fmtDate(r.endDate)}</td>
                                <td>{r.accrued}</td>
                                <td>{r.used}</td>
                                <td>{r.remaining}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}

              {tab === 'family' ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>ФИО</th>
                        <th>Родство</th>
                        <th>Дата рождения</th>
                        <th>Телефон</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(row.relatives ?? []).length === 0 ? (
                        <EmptyRow cols={4} />
                      ) : (
                        (row.relatives ?? []).map((r) => (
                          <tr key={r.id}>
                            <td>{r.fullName}</td>
                            <td>{r.relation}</td>
                            <td>{fmtDate(r.birthDate)}</td>
                            <td>{r.phone || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'schedule_req' ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Заголовок</th>
                        <th>Статус</th>
                        <th>Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleReqs.length === 0 ? (
                        <EmptyRow cols={4} />
                      ) : (
                        scheduleReqs.map((r) => (
                          <tr key={r.id}>
                            <td>{fmtDate(r.createdAt)}</td>
                            <td>{r.title}</td>
                            <td>
                              <span className={styles.badge}>{r.status}</span>
                            </td>
                            <td>{r.reviewNote || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'identity' ? (
                <div className={styles.section}>
                  <h3 className={styles.blockTitle}>Идентификация / Face ID</h3>
                  <div className={styles.faceBox}>
                    {row.faceProfile?.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={styles.facePreview}
                        src={row.faceProfile.photoUrl}
                        alt="Face"
                      />
                    ) : (
                      <div className={styles.statsBox} style={{ width: 120, minHeight: 120 }}>
                        Нет фото
                      </div>
                    )}
                    <div className={styles.faceActions}>
                      <label className={styles.muted}>
                        Face ID (employeeNo)
                        <input
                          className={styles.fieldValue}
                          value={externalIdDraft}
                          onChange={(e) => setExternalIdDraft(e.target.value)}
                          placeholder="face-0001"
                          style={{ marginTop: 4 }}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        disabled={busy}
                        onClick={saveExternalId}
                      >
                        Сохранить Face ID
                      </button>
                      <label className={styles.muted}>
                        Загрузить фото
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(e) => onFaceFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={busy || !row.faceProfile?.photoUrl}
                        onClick={syncFace}
                      >
                        Синхронизировать с терминалом
                      </button>
                      <p className={styles.muted}>
                        Sync:{' '}
                        <span className={styles.badge}>
                          {row.faceProfile?.syncStatus ?? 'нет'}
                        </span>
                      </p>
                      {faceMsg ? <p className={styles.muted}>{faceMsg}</p> : null}
                      {row.faceProfile?.lastError ? (
                        <p className={styles.error}>{row.faceProfile.lastError}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'payroll' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Оклад</label>
                    <div className={styles.fieldValue}>{fmtMoney(row.baseSalary)}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Тип оплаты</label>
                    <div className={styles.fieldValue}>
                      {row.profileExtras?.paymentType ?? '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Разряд</label>
                    <div className={styles.fieldValue}>{row.grade?.name ?? '—'}</div>
                  </div>
                </div>
              ) : null}

              {tab === 'settings' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Табельный номер</label>
                    <div className={styles.fieldValue}>{row.tabNumber}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Тип занятости</label>
                    <div className={styles.fieldValue}>{row.employmentType}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Дата приёма</label>
                    <div className={styles.fieldValue}>{fmtDate(row.hiredAt)}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Дата увольнения</label>
                    <div className={styles.fieldValue}>{fmtDate(row.dismissedAt)}</div>
                  </div>
                </div>
              ) : null}

              {[
                'subordinates',
                'efficiency',
                'education',
                'accounts',
                'certificates',
                'career',
                'files',
                'inventory',
                'car',
                'extra',
              ].includes(tab) ? (
                <div className={styles.statsBox}>
                  Раздел «{MORE_ITEMS.find((m) => m.key === tab)?.label}» — структура
                  готова. Данные появятся после заполнения справочников.
                </div>
              ) : null}

              {tab === 'documents' ? (
                <>
                  <div className={styles.docsHead}>
                    <div className={styles.docsTitleRow}>
                      <h3 className={styles.docsTitle}>Документы</h3>
                      <span className={styles.docsBadge}>
                        {row.person?.passport ? 'Нет требований' : 'Нет требований'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.btnAdd}
                      onClick={() => setPassportOpen(true)}
                    >
                      Добавить
                    </button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Тип документа</th>
                          <th>Серия</th>
                          <th>Номер</th>
                          <th>Выдано</th>
                          <th>Дата начала</th>
                          <th>Дата истечения</th>
                          <th>Примечание</th>
                          <th>Состояние</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.person?.passport ? (
                          <tr>
                            <td>
                              <button
                                type="button"
                                className={styles.tableLink}
                                onClick={() => setPassportOpen(true)}
                              >
                                Паспорт (по умолчанию)
                              </button>
                            </td>
                            <td>{parsePassport(row.person.passport).series || '—'}</td>
                            <td>{parsePassport(row.person.passport).number || '—'}</td>
                            <td>—</td>
                            <td>—</td>
                            <td>—</td>
                            <td>—</td>
                            <td>
                              <span className={`${styles.badge} ${styles.badgeNew}`}>
                                Новый
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.viewBtn}
                                onClick={() => setPassportOpen(true)}
                              >
                                Открыть
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <EmptyRow cols={9} />
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {passportOpen && row ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setPassportOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="passport-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 id="passport-modal-title" className={styles.modalTitle}>
                Документ (просмотр)
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Закрыть"
                onClick={() => setPassportOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              {(() => {
                const pp = parsePassport(row.person?.passport);
                return (
                  <>
                    <div className={styles.modalField}>
                      <label>Тип документа</label>
                      <input readOnly value="Паспорт (по умолчанию)" />
                    </div>
                    <div className={styles.modalRow2}>
                      <div className={styles.modalField}>
                        <label>Серия документа</label>
                        <input readOnly value={pp.series} />
                      </div>
                      <div className={styles.modalField}>
                        <label>Номер документа</label>
                        <input readOnly value={pp.number} />
                      </div>
                    </div>
                    <div className={styles.modalField}>
                      <label>Выдано</label>
                      <input readOnly value="" placeholder="" />
                    </div>
                    <div className={styles.modalRow3}>
                      <div className={styles.modalField}>
                        <label>Дата выдачи</label>
                        <input readOnly value="" />
                      </div>
                      <div className={styles.modalField}>
                        <label>Дата начала действия</label>
                        <input readOnly value="" />
                      </div>
                      <div className={styles.modalField}>
                        <label>Дата истечения</label>
                        <input readOnly value="" />
                      </div>
                    </div>
                    <div className={styles.modalField}>
                      <label>Примечание</label>
                      <textarea readOnly value="" />
                    </div>
                    <div className={styles.toggleRow}>
                      <button
                        type="button"
                        className={`${styles.toggle} ${
                          passportValid ? styles.toggleOn : ''
                        }`}
                        aria-pressed={passportValid}
                        onClick={() => setPassportValid((v) => !v)}
                      />
                      <span>Действительный</span>
                    </div>
                    <div>
                      <div className={styles.modalField}>
                        <label>Файлы</label>
                      </div>
                      <div className={styles.filesRow}>
                        <span>Не выбраны</span>
                        <span aria-hidden>📎</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setPassportOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {absAddOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setAbsAddOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="abs-add-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 id="abs-add-title" className={styles.modalTitle}>
                Добавить запрос на отсутствие
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Закрыть"
                onClick={() => setAbsAddOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label>Вид отсутствия</label>
                <select
                  value={absForm.absenceTypeId}
                  onChange={(e) =>
                    setAbsForm((f) => ({ ...f, absenceTypeId: e.target.value }))
                  }
                >
                  {absTypes.length === 0 ? (
                    <option value="">Нет типов</option>
                  ) : (
                    absTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className={styles.modalField}>
                <label>Тип запроса</label>
                <div className={styles.checkRow}>
                  {(
                    [
                      ['part_day', 'Часть дня'],
                      ['full_day', 'Весь день'],
                      ['multi_day', 'Несколько дней'],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className={styles.checkLabel}>
                      <input
                        type="radio"
                        name="absKind"
                        checked={absForm.requestKind === k}
                        onChange={() => setAbsForm((f) => ({ ...f, requestKind: k }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Начало</label>
                  <input
                    type="date"
                    value={absForm.startDate}
                    onChange={(e) =>
                      setAbsForm((f) => ({ ...f, startDate: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Конец</label>
                  <input
                    type="date"
                    value={absForm.endDate}
                    onChange={(e) =>
                      setAbsForm((f) => ({ ...f, endDate: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalField}>
                <label>Примечание</label>
                <textarea
                  value={absForm.note}
                  onChange={(e) => setAbsForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() => void createAbsence()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setAbsAddOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {absFilterOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setAbsFilterOpen(false)}
          role="presentation"
        >
          <div
            className={`${styles.modal} ${styles.filterModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="abs-filter-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 id="abs-filter-title" className={styles.modalTitle}>
                Фильтр
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Закрыть"
                onClick={() => setAbsFilterOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.filterToolbar}>
              <button type="button" className={styles.btnGhost}>
                Шаблон ▾
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setAbsFilterDraft(EMPTY_ABS_FILTER);
                  setAbsFilterRows([...DEFAULT_ABS_FILTER_ROWS]);
                }}
              >
                По умолчанию
              </button>
              <div className={styles.absMenuWrap}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setAbsAddParamOpen((v) => !v)}
                >
                  Добавить параметры ▾
                </button>
                {absAddParamOpen ? (
                  <div className={`${styles.absMenu} ${styles.absMenuRight}`}>
                    {(
                      [
                        ['requestDate', 'Дата запроса'],
                        ['absenceType', 'Вид отсутствия'],
                        ['requestKind', 'Тип запроса'],
                        ['status', 'Состояние'],
                        ['start', 'Начало'],
                        ['end', 'Конец'],
                        ['accrualType', 'Вид начисления'],
                        ['createdAt', 'Дата создания'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={styles.absMenuItem}
                        disabled={absFilterRows.includes(key)}
                        onClick={() => {
                          setAbsFilterRows((r) => [...r, key]);
                          setAbsAddParamOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.modalBody}>
              {absFilterRows.map((rowKey) => (
                <div key={rowKey} className={styles.filterRow}>
                  <span className={styles.filterDrag} aria-hidden>
                    ⠿
                  </span>
                  <span className={styles.filterLabel}>
                    {rowKey === 'requestDate'
                      ? 'Дата запроса'
                      : rowKey === 'absenceType'
                        ? 'Вид отсутствия'
                        : rowKey === 'requestKind'
                          ? 'Тип запроса'
                          : rowKey === 'status'
                            ? 'Состояние'
                            : rowKey === 'start'
                              ? 'Начало'
                              : rowKey === 'end'
                                ? 'Конец'
                                : rowKey === 'accrualType'
                                  ? 'Вид начисления'
                                  : 'Дата создания'}
                  </span>
                  <span className={styles.filterOp}>=</span>
                  <div className={styles.filterValue}>
                    {rowKey === 'requestDate' ||
                    rowKey === 'start' ||
                    rowKey === 'end' ||
                    rowKey === 'createdAt' ? (
                      <div className={styles.dateRange}>
                        <input
                          type="date"
                          value={
                            rowKey === 'requestDate'
                              ? absFilterDraft.requestDateFrom
                              : rowKey === 'start'
                                ? absFilterDraft.startFrom
                                : rowKey === 'end'
                                  ? absFilterDraft.endFrom
                                  : ''
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            setAbsFilterDraft((d) => ({
                              ...d,
                              ...(rowKey === 'requestDate'
                                ? { requestDateFrom: v }
                                : rowKey === 'start'
                                  ? { startFrom: v }
                                  : rowKey === 'end'
                                    ? { endFrom: v }
                                    : {}),
                            }));
                          }}
                          placeholder="Выбрать дату"
                        />
                        <input
                          type="date"
                          value={
                            rowKey === 'requestDate'
                              ? absFilterDraft.requestDateTo
                              : rowKey === 'start'
                                ? absFilterDraft.startTo
                                : rowKey === 'end'
                                  ? absFilterDraft.endTo
                                  : ''
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            setAbsFilterDraft((d) => ({
                              ...d,
                              ...(rowKey === 'requestDate'
                                ? { requestDateTo: v }
                                : rowKey === 'start'
                                  ? { startTo: v }
                                  : rowKey === 'end'
                                    ? { endTo: v }
                                    : {}),
                            }));
                          }}
                          placeholder="Выбрать дату"
                        />
                      </div>
                    ) : null}
                    {rowKey === 'absenceType' ? (
                      <select
                        multiple
                        className={styles.multiSelect}
                        value={absFilterDraft.absenceTypeIds}
                        onChange={(e) => {
                          const ids = Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                          );
                          setAbsFilterDraft((d) => ({ ...d, absenceTypeIds: ids }));
                        }}
                      >
                        {absTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {rowKey === 'requestKind' ? (
                      <div className={styles.checkRow}>
                        {(
                          [
                            ['part_day', 'Часть дня'],
                            ['full_day', 'Весь день'],
                            ['multi_day', 'Несколько дней'],
                          ] as const
                        ).map(([k, label]) => (
                          <label key={k} className={styles.checkLabel}>
                            <input
                              type="checkbox"
                              checked={absFilterDraft.requestKinds.includes(k)}
                              onChange={(e) => {
                                setAbsFilterDraft((d) => ({
                                  ...d,
                                  requestKinds: e.target.checked
                                    ? [...d.requestKinds, k]
                                    : d.requestKinds.filter((x) => x !== k),
                                }));
                              }}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {rowKey === 'status' ? (
                      <div className={styles.checkRow}>
                        {(
                          [
                            ['pending', 'В ожидании'],
                            ['approved', 'Подтвержден'],
                            ['completed', 'Завершен'],
                            ['rejected', 'Отклонен'],
                          ] as const
                        ).map(([k, label]) => (
                          <label key={k} className={styles.checkLabel}>
                            <input
                              type="checkbox"
                              checked={absFilterDraft.statuses.includes(k)}
                              onChange={(e) => {
                                setAbsFilterDraft((d) => ({
                                  ...d,
                                  statuses: e.target.checked
                                    ? [...d.statuses, k]
                                    : d.statuses.filter((x) => x !== k),
                                }));
                              }}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {rowKey === 'accrualType' ? (
                      <input readOnly value="Плановый" />
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={styles.filterRemove}
                    aria-label="Удалить"
                    onClick={() =>
                      setAbsFilterRows((rows) => rows.filter((r) => r !== rowKey))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  setAbsFilterApplied({ ...absFilterDraft });
                  setAbsFilterOpen(false);
                }}
              >
                Применить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => {
                  setAbsFilterDraft(EMPTY_ABS_FILTER);
                  setAbsFilterApplied(EMPTY_ABS_FILTER);
                  setAbsFilterRows([...DEFAULT_ABS_FILTER_ROWS]);
                }}
              >
                Сбросить все
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setAbsFilterOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
