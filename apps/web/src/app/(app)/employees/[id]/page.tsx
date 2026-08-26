'use client';
import { confirm } from '@/lib/dialogs';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import { FormModal } from '@/components/FormModal';
import fmStyles from '@/components/form-modal.module.css';
import styles from './page.module.css';
import { UserSettingsPanel } from './UserSettingsPanel';
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
  division?: { id?: string; name: string; code?: string } | null;
  position?: { id?: string; name: string; code?: string } | null;
  region?: { id?: string; name: string; code?: string } | null;
  grade?: { id?: string; name: string; code?: string } | null;
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
  subordinates?: {
    id: string;
    tabNumber: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    status: string;
    position?: { name: string } | null;
    division?: { name: string } | null;
  }[];
  efficiency?: {
    average: number;
    periodMonths: number;
    rows: {
      month: string;
      monthLabel: string;
      type: string;
      positionName: string;
      divisionName: string;
      fact: number;
      amount: number | null;
    }[];
    chart: { month: string; primary: number; secondary: number }[];
  };
  payrollSummary?: {
    baseSalary: number;
    accrued: number;
    paid: number;
    remaining: number;
    accruals: { name: string; amount: number }[];
    deductions: { name: string; amount: number }[];
    yearSeries: { month: number; toPay: number; paid: number }[];
  };
  education?: {
    id: string;
    educationType: string;
    institution: string;
    specialty: string;
    startDate?: string | null;
    endDate?: string | null;
  }[];
  languages?: { id: string; name: string; level: string }[];
  bankAccounts?: {
    id: string;
    bankName: string;
    name: string;
    accountNumber: string;
    mfo: string;
    cardNumber?: string | null;
    isPrimary: boolean;
    isActive: boolean;
  }[];
  bankCards?: {
    id: string;
    accountId?: string | null;
    cardNumber: string;
    accountNumber: string;
    bankCode: string;
    expiresAt?: string | null;
    state: string;
    status: string;
  }[];
  personDocuments?: {
    id: string;
    docType: string;
    series: string;
    docNumber: string;
    issuer: string;
    issuedAt?: string | null;
    startsAt?: string | null;
    expiresAt?: string | null;
    note: string;
    isValid: boolean;
    fileNames: string[];
  }[];
  requests?: {
    id: string;
    type: string;
    status: string;
    title: string;
    reviewNote?: string | null;
    createdAt: string;
    payload?: {
      note?: string;
      scheduleId?: string;
      scheduleName?: string;
      startDate?: string;
      endDate?: string;
      beginDate?: string;
      from?: string;
      to?: string;
      [key: string]: unknown;
    } | null;
  }[];
  relatives?: {
    id: string;
    fullName: string;
    relation: string;
    birthDate?: string | null;
    phone?: string | null;
    gender?: string | null;
    workplace?: string | null;
    dependent?: boolean;
    isHidden?: boolean;
  }[];
  certificates?: {
    id: string;
    certType: string;
    certNumber: string;
    certDate?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    title: string;
  }[];
  tenures?: {
    id: string;
    tenureType: string;
    stillWorking: boolean;
    countedFrom?: string | null;
  }[];
  workplaces?: {
    id: string;
    organization: string;
    position: string;
    orgAddress?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
  }[];
  awards?: {
    id: string;
    awardType: string;
    docTitle?: string | null;
    docNumber?: string | null;
    awardDate?: string | null;
  }[];
  employeeFiles?: {
    id: string;
    name: string;
    note?: string | null;
    fileName: string;
    fileUrl?: string | null;
    contentType?: string | null;
    fileSize?: number | null;
  }[];
  inventoryItems?: {
    id: string;
    inventoryType: string;
    inventoryNumber: string;
    model: string;
    manufacturer: string;
    operationAt?: string | null;
    purchaseDate?: string | null;
    locationName?: string | null;
    userName?: string | null;
    responsibleName?: string | null;
    status: string;
    note?: string | null;
  }[];
  cars?: {
    id: string;
    name: string;
    plateNumber: string;
    code: string;
    isActive: boolean;
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
    markType?: 'mark' | 'in' | 'out' | 'break_out' | 'break_in';
    markTypeLabel?: string;
    locationName?: string | null;
    deviceType?: string | null;
    identificationType?: string | null;
    note?: string | null;
    isValid?: boolean;
    photoUrl?: string | null;
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
    rangeLabel?: string;
    period?: string;
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
    paymentNote?: string | null;
    registeredAddress?: string | null;
    inps?: string | null;
    inn?: string | null;
    note?: string | null;
    phoneExtra?: string | null;
    emailCorp?: string | null;
    street?: string | null;
    house?: string | null;
    apartment?: string | null;
    address?: string | null;
    maritalStatus?: string | null;
    pin?: string | null;
    pinCode?: string | null;
    rfidNumber?: string | null;
    fingerprints?: number[];
    altFirstName?: string | null;
    altLastName?: string | null;
    altMiddleName?: string | null;
    citizenship?: string | null;
    extraCode?: string | null;
    notKeyEmployee?: boolean;
    userSettings?: Record<string, unknown> | null;
  };
  markBlocks?: {
    id: string;
    startDate: string;
    endDate?: string | null;
    note?: string | null;
  }[];
};
const PRIMARY_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'main', label: 'Основная информация', icon: '☰' },
  { key: 'calendar', label: 'Календарь', icon: '▦' },
  { key: 'docs', label: 'История документов', icon: '▤' },
  { key: 'locations', label: 'Локации', icon: '⌖' },
  { key: 'absences', label: 'Запросы на отсутствие', icon: '◷' },
];
const MORE_ITEMS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'subordinates', label: 'Подчиненные', icon: '👥' },
  { key: 'payroll', label: 'Оплата труда', icon: '₽' },
  { key: 'efficiency', label: 'Эффективность', icon: '◔' },
  { key: 'education', label: 'Образование', icon: '🎓' },
  { key: 'schedule_req', label: 'Запросы на изменение графика', icon: '◷' },
  { key: 'accounts', label: 'Расчетные счета', icon: '🏦' },
  { key: 'documents', label: 'Документы', icon: '📄' },
  { key: 'family', label: 'Семья', icon: '👪' },
  { key: 'certificates', label: 'Справки', icon: '🧾' },
  { key: 'career', label: 'Трудовая деятельность', icon: '⧉' },
  { key: 'files', label: 'Файлы', icon: '📎' },
  { key: 'inventory', label: 'Инвентарь', icon: '📦' },
  { key: 'car', label: 'Автомобиль', icon: '🚗' },
  { key: 'identity', label: 'Идентификация', icon: '🪪' },
  { key: 'extra', label: 'Дополнительная информация', icon: 'ℹ' },
  { key: 'settings', label: 'Настройки', icon: '⚙' },
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
  if (status === 'leave') return 'В отпуске';
  return status;
}
function employmentTypeRu(t: string) {
  if (t === 'staff') return 'Штат';
  if (t === 'gph') return 'ГПХ';
  return t;
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
function scheduleReqStatusRu(status: string) {
  if (status === 'pending' || status === 'draft') return 'В ожидании';
  if (status === 'approved') return 'Утверждено';
  if (status === 'rejected') return 'Отклонено';
  if (status === 'cancelled') return 'Отменено';
  return status;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
}

function toDatetimeLocalValue(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function markTypeMeta(m: {
  markType?: string;
  markTypeLabel?: string;
  direction?: string;
}) {
  const key =
    m.markType ||
    (m.direction === 'IN' ? 'in' : m.direction === 'OUT' ? 'out' : 'mark');
  if (key === 'in') return { key: 'in', label: m.markTypeLabel || 'Приход', tone: 'in' as const };
  if (key === 'out') return { key: 'out', label: m.markTypeLabel || 'Уход', tone: 'out' as const };
  if (key === 'estimated_out')
    return {
      key: 'estimated_out',
      label: m.markTypeLabel || 'Такминий уход',
      tone: 'mark' as const,
    };
  if (key === 'break_out')
    return { key: 'break_out', label: m.markTypeLabel || 'Перерыв уход', tone: 'break' as const };
  if (key === 'break_in')
    return { key: 'break_in', label: m.markTypeLabel || 'Перерыв приход', tone: 'break' as const };
  return { key: 'mark', label: m.markTypeLabel || 'Отметка', tone: 'mark' as const };
}

function scheduleReqPayload(r: {
  payload?: Record<string, unknown> | null;
  title?: string;
}) {
  const p = (r.payload ?? {}) as Record<string, unknown>;
  const start =
    (p.startDate as string) ||
    (p.beginDate as string) ||
    (p.from as string) ||
    null;
  const end =
    (p.endDate as string) || (p.to as string) || start || null;
  const note = (p.note as string) || r.title || '';
  const scheduleName = (p.scheduleName as string) || '';
  return { start, end, note, scheduleName, scheduleId: (p.scheduleId as string) || '' };
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
function countActiveAbsFilters(f: AbsFilterDraft): number {
  let n = 0;
  if (f.requestDateFrom || f.requestDateTo) n += 1;
  if (f.absenceTypeIds.length) n += 1;
  if (f.requestKinds.length) n += 1;
  if (f.statuses.length) n += 1;
  if (f.startFrom || f.startTo) n += 1;
  if (f.endFrom || f.endTo) n += 1;
  return n;
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

function parseHm(hm: string) {
  const [h, m] = hm.split(':').map((x) => Number(x) || 0);
  return h * 60 + m;
}

function fmtHmFromIso(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

function plannedWorkMinutes(schedule?: Detail['schedule'] | null) {
  const start = schedule?.startTime || '09:00';
  const end = schedule?.endTime || '18:00';
  let mins = parseHm(end) - parseHm(start);
  if (mins <= 0) mins += 24 * 60;
  // Verifix odatda tushlikni hisobga oladi (~1 soat) — 09-18 → 8 soat net
  if (mins >= 8 * 60) mins -= 60;
  return mins;
}

function workedMinutes(day?: {
  firstInAt?: string | null;
  lastOutAt?: string | null;
}) {
  if (!day?.firstInAt || !day?.lastOutAt) return 0;
  const a = new Date(day.firstInAt).getTime();
  const b = new Date(day.lastOutAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
}

function deficitLabel(planned: number, worked: number) {
  const d = planned - worked;
  if (d < 15) return null;
  const h = Math.floor(d / 60);
  const m = d % 60;
  if (h > 0 && m > 0) return `- ${h} ч ${m} мин`;
  if (h > 0) return `- ${h} ч`;
  return `- ${m} мин`;
}

function formatDurationRu(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
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
function EmptyRow({
  cols,
  text = 'Нет данных',
  withIcon = false,
}: {
  cols: number;
  text?: string;
  withIcon?: boolean;
}) {
  return (
    <tr>
      <td className={styles.empty} colSpan={cols}>
        <span className={styles.emptyInner}>
          {withIcon ? (
            <span className={styles.emptyIcon} aria-hidden>
              i
            </span>
          ) : null}
          {text}
        </span>
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
  const [markQuery, setMarkQuery] = useState('');
  const [markPage, setMarkPage] = useState(1);
  const [markPageSize, setMarkPageSize] = useState(50);
  const [markPageSizeOpen, setMarkPageSizeOpen] = useState(false);
  const [markMenuOpen, setMarkMenuOpen] = useState(false);
  const [markSortAsc, setMarkSortAsc] = useState(false);
  const [markFilterOpen, setMarkFilterOpen] = useState(false);
  const [markFilterTypes, setMarkFilterTypes] = useState<string[]>([]);
  const [markFilterFrom, setMarkFilterFrom] = useState('');
  const [markFilterTo, setMarkFilterTo] = useState('');
  const [markSelected, setMarkSelected] = useState<string[]>([]);
  const [markAddOpen, setMarkAddOpen] = useState(false);
  const [dayModalKey, setDayModalKey] = useState<string | null>(null);
  const [dayModalTab, setDayModalTab] = useState<'stats' | 'marks'>('stats');
  const [dayMarksFilter, setDayMarksFilter] = useState<'all' | 'used'>('used');
  const [dayMarkBusy, setDayMarkBusy] = useState<string | null>(null);
  const photos = usePhotoLightbox();
  const [personalOpen, setPersonalOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<'personal' | 'contacts' | null>(
    null,
  );
  const [historyData, setHistoryData] = useState<{
    title: string;
    createdBy: string;
    createdAt: string;
    changedBy: string;
    changedAt: string;
    rows: {
      field: string;
      event: string;
      occurredAt: string;
      value: string;
      userName: string;
    }[];
  } | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [visitPeriod, setVisitPeriod] = useState<
    'last12' | 'current_year' | 'last_year'
  >('last12');
  const [visitPeriodOpen, setVisitPeriodOpen] = useState(false);
  const [personalForm, setPersonalForm] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
    nationality: 'Узбек',
    birthDate: '',
    gender: 'male',
    pinfl: '',
    inps: '',
    inn: '',
    note: '',
  });
  const [contactsForm, setContactsForm] = useState({
    phone: '',
    phoneExtra: '',
    email: '',
    emailCorp: '',
    regionId: '',
    street: '',
    house: '',
    apartment: '',
    address: '',
    registeredAddress: '',
  });
  const [regions, setRegions] = useState<{ id: string; name: string; code: string }[]>(
    [],
  );
  const [nationalityOpts, setNationalityOpts] = useState<
    { code: string; name: string }[]
  >([]);
  const [orgForm, setOrgForm] = useState({
    tabNumber: '',
    divisionId: '',
    positionId: '',
    scheduleId: '',
    gradeId: '',
    regionId: '',
    employmentType: 'staff',
    status: 'active',
    hiredAt: '',
    baseSalary: '',
  });
  const [orgLookups, setOrgLookups] = useState<{
    divisions: { id: string; name: string }[];
    positions: { id: string; name: string }[];
    schedules: { id: string; name: string }[];
    grades: { id: string; name: string }[];
  }>({ divisions: [], positions: [], schedules: [], grades: [] });
  const [markForm, setMarkForm] = useState({
    locationId: '',
    occurredAt: '',
    markType: 'mark',
    note: '',
    isValid: true,
  });
  const [docOpen, setDocOpen] = useState(false);
  const [docEditId, setDocEditId] = useState<string | null>(null);
  const [docTypeOpts, setDocTypeOpts] = useState<{ code: string; name: string }[]>([]);
  const [docTypeQuery, setDocTypeQuery] = useState('');
  const [docTypeListOpen, setDocTypeListOpen] = useState(false);
  const docTypeComboRef = useRef<HTMLDivElement>(null);
  const kinshipComboRef = useRef<HTMLDivElement>(null);
  const maritalComboRef = useRef<HTMLDivElement>(null);
  const certTypeComboRef = useRef<HTMLDivElement>(null);
  const tenureTypeComboRef = useRef<HTMLDivElement>(null);
  const awardTypeComboRef = useRef<HTMLDivElement>(null);
  const [relOpen, setRelOpen] = useState(false);
  const [relEditId, setRelEditId] = useState<string | null>(null);
  const [kinshipOpts, setKinshipOpts] = useState<{ code: string; name: string }[]>([]);
  const [kinshipQuery, setKinshipQuery] = useState('');
  const [kinshipListOpen, setKinshipListOpen] = useState(false);
  const [maritalOpen, setMaritalOpen] = useState(false);
  const [maritalOpts, setMaritalOpts] = useState<{ code: string; name: string }[]>([]);
  const [maritalQuery, setMaritalQuery] = useState('');
  const [maritalListOpen, setMaritalListOpen] = useState(false);
  const [relForm, setRelForm] = useState({
    fullName: '',
    relation: '',
    gender: 'male',
    phone: '',
    birthDate: '',
    workplace: '',
    dependent: false,
    isHidden: false,
  });
  const [certOpen, setCertOpen] = useState(false);
  const [certEditId, setCertEditId] = useState<string | null>(null);
  const [certTypeOpts, setCertTypeOpts] = useState<{ code: string; name: string }[]>([]);
  const [certTypeQuery, setCertTypeQuery] = useState('');
  const [certTypeListOpen, setCertTypeListOpen] = useState(false);
  const [certForm, setCertForm] = useState({
    certType: '',
    certNumber: '',
    certDate: '',
    validFrom: '',
    validUntil: '',
    title: '',
  });
  const [tenureOpen, setTenureOpen] = useState(false);
  const [tenureEditId, setTenureEditId] = useState<string | null>(null);
  const [tenureTypeOpts, setTenureTypeOpts] = useState<{ code: string; name: string }[]>([]);
  const [tenureTypeQuery, setTenureTypeQuery] = useState('');
  const [tenureTypeListOpen, setTenureTypeListOpen] = useState(false);
  const [tenureForm, setTenureForm] = useState({
    tenureType: '',
    stillWorking: false,
    countedFrom: '',
  });
  const [workOpen, setWorkOpen] = useState(false);
  const [workEditId, setWorkEditId] = useState<string | null>(null);
  const [workForm, setWorkForm] = useState({
    organization: '',
    position: '',
    orgAddress: '',
    startDate: '',
    endDate: '',
    description: '',
  });
  const [awardOpen, setAwardOpen] = useState(false);
  const [awardEditId, setAwardEditId] = useState<string | null>(null);
  const [awardTypeOpts, setAwardTypeOpts] = useState<{ code: string; name: string }[]>([]);
  const [awardTypeQuery, setAwardTypeQuery] = useState('');
  const [awardTypeListOpen, setAwardTypeListOpen] = useState(false);
  const [awardForm, setAwardForm] = useState({
    awardType: '',
    docTitle: '',
    docNumber: '',
    awardDate: '',
  });
  const [empFileOpen, setEmpFileOpen] = useState(false);
  const [empFileEditId, setEmpFileEditId] = useState<string | null>(null);
  const [empFileDrag, setEmpFileDrag] = useState(false);
  const [empFileForm, setEmpFileForm] = useState({
    name: '',
    note: '',
    file: null as File | null,
  });
  const [invOpen, setInvOpen] = useState(false);
  const [invEditId, setInvEditId] = useState<string | null>(null);
  const [invFilterOpen, setInvFilterOpen] = useState(false);
  const [invSearch, setInvSearch] = useState('');
  const [invTypeOpts, setInvTypeOpts] = useState<{ code: string; name: string }[]>([]);
  const [invTypeQuery, setInvTypeQuery] = useState('');
  const [invTypeListOpen, setInvTypeListOpen] = useState(false);
  const invTypeComboRef = useRef<HTMLDivElement>(null);
  const [invForm, setInvForm] = useState({
    inventoryType: '',
    model: '',
    manufacturer: '',
    operationAt: '',
    purchaseDate: '',
    locationName: '',
    userName: '',
    responsibleName: '',
    status: 'Получен',
    note: '',
  });
  const [invFilterDraft, setInvFilterDraft] = useState({
    userName: '',
    responsibleName: '',
    purchaseFrom: '',
    purchaseTo: '',
    statusReceived: true,
  });
  const [invFilterApplied, setInvFilterApplied] = useState({
    userName: '',
    responsibleName: '',
    purchaseFrom: '',
    purchaseTo: '',
    statusReceived: false,
  });
  const [carOpen, setCarOpen] = useState(false);
  const [carEditId, setCarEditId] = useState<string | null>(null);
  const [carSearch, setCarSearch] = useState('');
  const [carForm, setCarForm] = useState({
    name: '',
    plateNumber: '',
    code: '',
    isActive: true,
  });
  const [identForm, setIdentForm] = useState({
    pin: '',
    pinCode: '',
    rfidNumber: '',
    fingerprints: [] as number[],
  });
  const [fpOpen, setFpOpen] = useState(false);
  const [fpSelected, setFpSelected] = useState<number | null>(null);
  const [fpDraft, setFpDraft] = useState<number[]>([]);
  const [fpStep, setFpStep] = useState(1);
  const [fpDrag, setFpDrag] = useState(false);
  const [extraForm, setExtraForm] = useState({
    altFirstName: '',
    altLastName: '',
    altMiddleName: '',
    citizenship: '',
    extraCode: '',
    notKeyEmployee: false,
  });
  const [citizenshipOpts, setCitizenshipOpts] = useState<
    { code: string; name: string }[]
  >([]);
  const [citizenshipQuery, setCitizenshipQuery] = useState('');
  const [citizenshipListOpen, setCitizenshipListOpen] = useState(false);
  const citizenshipComboRef = useRef<HTMLDivElement>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockEditId, setBlockEditId] = useState<string | null>(null);
  const [blockSearch, setBlockSearch] = useState('');
  const [blockFilterOpen, setBlockFilterOpen] = useState(false);
  const [blockFilterDraft, setBlockFilterDraft] = useState({
    from: '',
    to: '',
    note: '',
  });
  const [blockFilterApplied, setBlockFilterApplied] = useState({
    from: '',
    to: '',
    note: '',
  });
  const [blockForm, setBlockForm] = useState({
    startDate: '',
    endDate: '',
    note: '',
  });
  const [tabSettingsOpen, setTabSettingsOpen] = useState(false);
  const [tabArrangeOpen, setTabArrangeOpen] = useState(false);
  const [resetTabsOpen, setResetTabsOpen] = useState(false);
  const tabSettingsRef = useRef<HTMLDivElement>(null);
  const [salaryVisible, setSalaryVisible] = useState(true);
  const [primaryTabOrder, setPrimaryTabOrder] = useState<TabKey[]>(
    PRIMARY_TABS.map((t) => t.key),
  );
  const [docForm, setDocForm] = useState({
    docType: 'PASSPORT',
    series: '',
    docNumber: '',
    issuer: '',
    issuedAt: '',
    startsAt: '',
    expiresAt: '',
    note: '',
    isValid: true,
    fileNames: [] as string[],
  });
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
  const [absTypeSearch, setAbsTypeSearch] = useState('');
  const [absPageSize, setAbsPageSize] = useState(50);
  const [absPagePending, setAbsPagePending] = useState(1);
  const [absPageDecided, setAbsPageDecided] = useState(1);
  const [absPageSizeOpen, setAbsPageSizeOpen] = useState(false);
  const [absSortAsc, setAbsSortAsc] = useState(false);
  const absFilterActiveCount = countActiveAbsFilters(absFilterApplied);
  const [absForm, setAbsForm] = useState({
    absenceTypeId: '',
    startDate: '',
    endDate: '',
    note: '',
    requestKind: 'full_day' as 'part_day' | 'full_day' | 'multi_day',
  });
  const [absBusyId, setAbsBusyId] = useState<string | null>(null);
  const [subQuery, setSubQuery] = useState('');
  const [payMonth, setPayMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [effPeriod, setEffPeriod] = useState('12');
  const [schedQueryPending, setSchedQueryPending] = useState('');
  const [schedQueryDecided, setSchedQueryDecided] = useState('');
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedReviewId, setSchedReviewId] = useState<string | null>(null);
  const [schedReviewNote, setSchedReviewNote] = useState('');
  const [schedPagePending, setSchedPagePending] = useState(1);
  const [schedPageDecided, setSchedPageDecided] = useState(1);
  const [schedPageSize, setSchedPageSize] = useState(50);
  const [schedPageSizeOpen, setSchedPageSizeOpen] = useState(false);
  const [schedMenuOpen, setSchedMenuOpen] = useState<'pending' | 'decided' | null>(null);
  const [schedSortAsc, setSchedSortAsc] = useState(false);
  const [schedFilterOpen, setSchedFilterOpen] = useState(false);
  const [schedFilterStatus, setSchedFilterStatus] = useState<string[]>([]);
  const [schedSelectedPending, setSchedSelectedPending] = useState<string[]>([]);
  const [schedSelectedDecided, setSchedSelectedDecided] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<
    { id: string; name: string; startTime?: string | null; endTime?: string | null }[]
  >([]);
  const [eduOpen, setEduOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [bankOpts, setBankOpts] = useState<{ code: string; name: string }[]>([]);
  const [accForm, setAccForm] = useState({
    bankName: '',
    name: '',
    accountNumber: '',
    mfo: '',
    cardNumber: '',
    isPrimary: false,
  });
  const [cardForm, setCardForm] = useState({
    cardNumber: '',
    accountId: '',
    accountNumber: '',
    bankCode: '',
    expiresAt: '',
    state: 'active',
    status: 'active',
  });
  const [eduForm, setEduForm] = useState({
    educationType: 'Высшее',
    institution: '',
    specialty: '',
    startDate: '',
    endDate: '',
  });
  const [langForm, setLangForm] = useState({ name: '', level: 'Средний' });
  const [schedForm, setSchedForm] = useState({
    title: '',
    note: '',
    startDate: '',
    endDate: '',
    scheduleId: '',
  });
  async function load() {
    try {
      const data = await apiFetch<Detail>(`/api/employees/${id}`);
      setRow(data);
      setExternalIdDraft(data.externalId ?? '');
      syncIdentForm(data);
      setExtraForm({
        altFirstName: data.profileExtras?.altFirstName || '',
        altLastName: data.profileExtras?.altLastName || '',
        altMiddleName: data.profileExtras?.altMiddleName || '',
        citizenship: data.profileExtras?.citizenship || '',
        extraCode: data.profileExtras?.extraCode || '',
        notKeyEmployee: !!data.profileExtras?.notKeyEmployee,
      });
      setCitizenshipQuery(data.profileExtras?.citizenship || '');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function loadVisitStats(period: 'last12' | 'current_year' | 'last_year') {
    if (!id) return;
    try {
      const stats = await apiFetch<NonNullable<Detail['visitStats']>>(
        `/api/employees/${id}/visit-stats?period=${period}`,
      );
      setRow((prev) => (prev ? { ...prev, visitStats: stats } : prev));
      setVisitPeriod(period);
      setVisitPeriodOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка статистики');
    }
  }

  async function openHistory(section: 'personal' | 'contacts') {
    setHistoryOpen(section);
    setHistoryQuery('');
    setHistoryData(null);
    try {
      const data = await apiFetch<{
        title: string;
        createdBy: string;
        createdAt: string;
        changedBy: string;
        changedAt: string;
        rows: {
          field: string;
          event: string;
          occurredAt: string;
          value: string;
          userName: string;
        }[];
      }>(`/api/employees/${id}/change-history?section=${section}`);
      setHistoryData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка истории');
      setHistoryOpen(null);
    }
  }

  async function openPersonalEdit() {
    if (!row) return;
    const bd = row.person?.birthDate
      ? new Date(row.person.birthDate).toISOString().slice(0, 10)
      : '';
    setPersonalForm({
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      middleName: row.middleName || '',
      nationality: row.profileExtras?.nationality || 'Узбек',
      birthDate: bd,
      gender: row.person?.gender === 'female' ? 'female' : 'male',
      pinfl: row.person?.pinfl || '',
      inps: row.profileExtras?.inps || '',
      inn: row.profileExtras?.inn || '',
      note: row.profileExtras?.note || '',
    });
    try {
      const dicts = await apiFetch<
        Array<{
          code: string;
          items?: Array<{ code: string; name: string; isActive?: boolean }>;
        }>
      >('/api/settings/dictionaries?kind=extra');
      const dict = dicts.find((d) => d.code === 'nationality');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      setNationalityOpts(
        opts.length
          ? opts
          : [
              { code: 'UZB', name: 'Узбек' },
              { code: 'KAZ', name: 'казах' },
              { code: 'TJK', name: 'таджик' },
              { code: 'RUS', name: 'русский' },
            ],
      );
    } catch {
      setNationalityOpts([
        { code: 'UZB', name: 'Узбек' },
        { code: 'KAZ', name: 'казах' },
        { code: 'TJK', name: 'таджик' },
        { code: 'RUS', name: 'русский' },
      ]);
    }
    setPersonalOpen(true);
  }

  async function openOrgEdit() {
    if (!row) return;
    setOrgForm({
      tabNumber: row.tabNumber || '',
      divisionId: row.division?.id || '',
      positionId: row.position?.id || '',
      scheduleId: row.schedule?.id || '',
      gradeId: row.grade?.id || '',
      regionId: row.region?.id || '',
      employmentType: row.employmentType === 'gph' ? 'gph' : 'staff',
      status: row.status || 'active',
      hiredAt: row.hiredAt ? new Date(row.hiredAt).toISOString().slice(0, 10) : '',
      baseSalary:
        row.baseSalary != null && row.baseSalary !== ''
          ? String(row.baseSalary)
          : '',
    });
    try {
      const [lookups, dicts] = await Promise.all([
        apiFetch<{
          divisions?: { id: string; name: string }[];
          positions?: { id: string; name: string }[];
          schedules?: { id: string; name: string }[];
          grades?: { id: string; name: string }[];
        }>('/api/catalog/lookups'),
        apiFetch<
          {
            id: string;
            code: string;
            items?: { id: string; name: string; code: string }[];
          }[]
        >('/api/settings/dictionaries?kind=admin'),
      ]);
      setOrgLookups({
        divisions: lookups.divisions || [],
        positions: lookups.positions || [],
        schedules: lookups.schedules || [],
        grades: lookups.grades || [],
      });
      const regionDict =
        dicts.find((d) => d.code === 'regions' || d.code === 'region') || null;
      setRegions(regionDict?.items || []);
    } catch {
      setOrgLookups({
        divisions: row.division?.id
          ? [{ id: row.division.id, name: row.division.name }]
          : [],
        positions: row.position?.id
          ? [{ id: row.position.id, name: row.position.name }]
          : [],
        schedules: row.schedule?.id
          ? [{ id: row.schedule.id, name: row.schedule.name }]
          : [],
        grades: row.grade?.id ? [{ id: row.grade.id, name: row.grade.name }] : [],
      });
    }
    setOrgOpen(true);
  }

  async function saveOrg() {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          tabNumber: orgForm.tabNumber.trim() || undefined,
          divisionId: orgForm.divisionId || '',
          positionId: orgForm.positionId || '',
          scheduleId: orgForm.scheduleId || '',
          gradeId: orgForm.gradeId || '',
          regionId: orgForm.regionId || '',
          employmentType: orgForm.employmentType,
          status: orgForm.status,
          hiredAt: orgForm.hiredAt || '',
          baseSalary: orgForm.baseSalary.trim(),
        }),
      });
      await load();
      setOrgOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function openContactsEdit() {
    if (!row) return;
    setContactsForm({
      phone: row.phone || row.person?.phone || '',
      phoneExtra: row.profileExtras?.phoneExtra || '',
      email: row.email || row.person?.email || '',
      emailCorp: row.profileExtras?.emailCorp || row.email || '',
      regionId: row.region?.id || '',
      street: row.profileExtras?.street || '',
      house: row.profileExtras?.house || '',
      apartment: row.profileExtras?.apartment || '',
      address: row.profileExtras?.address || '',
      registeredAddress: row.profileExtras?.registeredAddress || '',
    });
    try {
      const dicts = await apiFetch<
        {
          id: string;
          code: string;
          items?: { id: string; name: string; code: string }[];
        }[]
      >('/api/settings/dictionaries?kind=admin');
      const regionDict =
        dicts.find((d) => d.code === 'regions' || d.code === 'region') ||
        dicts.find((d) => (d.items?.length ?? 0) > 0);
      setRegions(regionDict?.items || []);
    } catch {
      setRegions(
        row.region?.id
          ? [
              {
                id: row.region.id,
                name: row.region.name,
                code: row.region.code || '',
              },
            ]
          : [],
      );
    }
    setContactsOpen(true);
  }

  async function savePersonal() {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Detail>(`/api/employees/${id}/personal`, {
        method: 'PATCH',
        body: JSON.stringify(personalForm),
      });
      setRow(data);
      setPersonalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function saveContacts() {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Detail>(`/api/employees/${id}/contacts`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...contactsForm,
          regionId: contactsForm.regionId || null,
        }),
      });
      setRow(data);
      setContactsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    void loadDocTypes();
    void loadKinshipDict();
    void loadMaritalDict();
    void loadCertTypes();
    void loadTenureTypes();
    void loadAwardTypes();
    void loadInvTypes();
    void loadCitizenshipOpts();
  }, [id]);

  useEffect(() => {
    try {
      const sal = localStorage.getItem('hrhub.emp.salaryVisible');
      if (sal != null) setSalaryVisible(sal === '1');
      const ord = localStorage.getItem('hrhub.emp.primaryTabs');
      if (ord) {
        const parsed = JSON.parse(ord) as TabKey[];
        if (Array.isArray(parsed) && parsed.length) {
          const known = PRIMARY_TABS.map((t) => t.key);
          const next = parsed.filter((k) => known.includes(k));
          for (const k of known) if (!next.includes(k)) next.push(k);
          setPrimaryTabOrder(next);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
      if (!actionMenuRef.current?.contains(e.target as Node)) {
        setActionMenuOpen(false);
        setReportsOpen(false);
      }
      if (!docTypeComboRef.current?.contains(e.target as Node)) {
        setDocTypeListOpen(false);
      }
      if (!kinshipComboRef.current?.contains(e.target as Node)) {
        setKinshipListOpen(false);
      }
      if (!maritalComboRef.current?.contains(e.target as Node)) {
        setMaritalListOpen(false);
      }
      if (!certTypeComboRef.current?.contains(e.target as Node)) {
        setCertTypeListOpen(false);
      }
      if (!tenureTypeComboRef.current?.contains(e.target as Node)) {
        setTenureTypeListOpen(false);
      }
      if (!awardTypeComboRef.current?.contains(e.target as Node)) {
        setAwardTypeListOpen(false);
      }
      if (!invTypeComboRef.current?.contains(e.target as Node)) {
        setInvTypeListOpen(false);
      }
      if (!citizenshipComboRef.current?.contains(e.target as Node)) {
        setCitizenshipListOpen(false);
      }
      if (!tabSettingsRef.current?.contains(e.target as Node)) {
        setTabSettingsOpen(false);
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
    const list = (row?.absences ?? []).filter((a) => {
      if (!['pending', 'draft'].includes(a.status)) return false;
      if (!matchAbsFilter(a, f)) return false;
      if (!q) return true;
      const hay = `${a.absenceType.name} ${a.note ?? ''} ${a.status}`.toLowerCase();
      return hay.includes(q);
    });
    list.sort((a, b) => {
      const da = String(a.meta?.requestDate || a.createdAt || a.startDate);
      const db = String(b.meta?.requestDate || b.createdAt || b.startDate);
      return absSortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
    return list;
  }, [row?.absences, absQueryPending, absFilterApplied, absSortAsc]);
  const decidedAbsences = useMemo(() => {
    const q = absQueryDecided.trim().toLowerCase();
    const f = absFilterApplied;
    const list = (row?.absences ?? []).filter((a) => {
      if (!['approved', 'rejected', 'cancelled'].includes(a.status)) return false;
      if (!matchAbsFilter(a, f)) return false;
      if (!q) return true;
      const hay = `${a.absenceType.name} ${a.note ?? ''} ${a.status}`.toLowerCase();
      return hay.includes(q);
    });
    list.sort((a, b) => {
      const da = String(a.meta?.requestDate || a.createdAt || a.startDate);
      const db = String(b.meta?.requestDate || b.createdAt || b.startDate);
      return absSortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
    return list;
  }, [row?.absences, absQueryDecided, absFilterApplied, absSortAsc]);
  const plannedAccruals = useMemo(() => {
    const q = absQueryAccrual.trim().toLowerCase();
    return (row?.plannedAccruals ?? []).filter((r) => {
      if (!q) return true;
      return `${r.absenceType} ${r.accrualType}`.toLowerCase().includes(q);
    });
  }, [row?.plannedAccruals, absQueryAccrual]);
  const pendingPageCount = Math.max(1, Math.ceil(pendingAbsences.length / absPageSize) || 1);
  const decidedPageCount = Math.max(1, Math.ceil(decidedAbsences.length / absPageSize) || 1);
  const pendingPageRows = pendingAbsences.slice(
    (absPagePending - 1) * absPageSize,
    absPagePending * absPageSize,
  );
  const decidedPageRows = decidedAbsences.slice(
    (absPageDecided - 1) * absPageSize,
    absPageDecided * absPageSize,
  );
  const filteredAbsTypes = absTypes.filter((t) =>
    t.name.toLowerCase().includes(absTypeSearch.trim().toLowerCase()),
  );
  const scheduleReqs = (row?.requests ?? []).filter((r) => r.type === 'schedule_change');
  const pendingSchedReqs = scheduleReqs.filter((r) =>
    ['pending', 'draft'].includes(r.status),
  );
  const decidedSchedReqs = scheduleReqs.filter((r) =>
    ['approved', 'rejected', 'cancelled'].includes(r.status),
  );
  const filterSchedList = (
    list: NonNullable<Detail['requests']>,
    query: string,
  ) => {
    const q = query.trim().toLowerCase();
    return list
      .filter((r) => {
        if (schedFilterStatus.length && !schedFilterStatus.includes(r.status)) {
          return false;
        }
        if (!q) return true;
        const p = scheduleReqPayload(r);
        return `${r.title} ${r.reviewNote ?? ''} ${r.status} ${p.note} ${p.scheduleName}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return schedSortAsc ? ta - tb : tb - ta;
      });
  };
  const filteredPendingSched = filterSchedList(pendingSchedReqs, schedQueryPending);
  const filteredDecidedSched = filterSchedList(decidedSchedReqs, schedQueryDecided);
  const schedPendingPageCount = Math.max(
    1,
    Math.ceil(filteredPendingSched.length / schedPageSize) || 1,
  );
  const schedDecidedPageCount = Math.max(
    1,
    Math.ceil(filteredDecidedSched.length / schedPageSize) || 1,
  );
  const pendingSchedPageRows = filteredPendingSched.slice(
    (schedPagePending - 1) * schedPageSize,
    schedPagePending * schedPageSize,
  );
  const decidedSchedPageRows = filteredDecidedSched.slice(
    (schedPageDecided - 1) * schedPageSize,
    schedPageDecided * schedPageSize,
  );
  const payroll = row?.payrollSummary;
  const basePay = Number(payroll?.baseSalary ?? row?.baseSalary ?? 0) || 0;
  const accruedPay = Number(payroll?.accrued ?? 0) || 0;
  const paidPay = Number(payroll?.paid ?? 0) || 0;
  const remainPay =
    payroll?.remaining != null
      ? Number(payroll.remaining)
      : Math.max(0, accruedPay - paidPay);
  const payYear = Number(payMonth.slice(0, 4)) || new Date().getFullYear();
  const payMonthIdx = Number(payMonth.slice(5, 7)) || 1;
  const payMonthLabel = `${MONTHS_RU[payMonthIdx - 1] ?? ''} ${payYear}`;
  const yearSeries = payroll?.yearSeries ?? [];
  const chartMonths = (
    yearSeries.length
      ? yearSeries.filter((s) => s.month >= Math.max(1, payMonthIdx - 5) && s.month <= payMonthIdx)
      : Array.from({ length: 6 }, (_, i) => {
          const d = new Date(payYear, payMonthIdx - 1 - (5 - i), 1);
          const val = basePay > 0 ? accruedPay * (0.7 + i * 0.06) : 0;
          return {
            month: d.getMonth() + 1,
            toPay: Math.round(val),
            paid: 0,
          };
        })
  ).map((c) => ({
    label: MONTHS_RU[(c.month ?? 1) - 1]?.slice(0, 3) ?? '',
    toPay: Number(c.toPay) || 0,
    paid: Number(c.paid) || 0,
  }));
  const maxChart = Math.max(1, ...chartMonths.map((c) => Math.max(c.toPay, c.paid)));
  const subRows = (row?.subordinates ?? []).filter((s) => {
    const q = subQuery.trim().toLowerCase();
    if (!q) return true;
    const fio = `${s.lastName} ${s.firstName} ${s.middleName ?? ''} ${s.tabNumber}`.toLowerCase();
    return fio.includes(q);
  });
  const filteredMarks = useMemo(() => {
    const list = [...(row?.marks ?? [])];
    const q = markQuery.trim().toLowerCase();
    return list
      .filter((m) => {
        const meta = markTypeMeta(m);
        if (markFilterTypes.length && !markFilterTypes.includes(meta.key)) return false;
        if (markFilterFrom) {
          if (new Date(m.occurredAt) < new Date(markFilterFrom)) return false;
        }
        if (markFilterTo) {
          const end = new Date(markFilterTo);
          end.setHours(23, 59, 59, 999);
          if (new Date(m.occurredAt) > end) return false;
        }
        if (!q) return true;
        return `${fmtDateTime(m.occurredAt)} ${m.locationName ?? ''} ${m.deviceType ?? ''} ${meta.label} ${m.identificationType ?? ''} ${m.note ?? ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const ta = new Date(a.occurredAt).getTime();
        const tb = new Date(b.occurredAt).getTime();
        return markSortAsc ? ta - tb : tb - ta;
      });
  }, [
    row?.marks,
    markQuery,
    markFilterTypes,
    markFilterFrom,
    markFilterTo,
    markSortAsc,
  ]);
  const markPageCount = Math.max(1, Math.ceil(filteredMarks.length / markPageSize) || 1);
  const markPageRows = filteredMarks.slice(
    (markPage - 1) * markPageSize,
    markPage * markPageSize,
  );
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

  async function saveEducation() {
    if (!id || !eduForm.institution.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/hr/documents', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: id,
          type: 'other',
          title: `Образование: ${eduForm.educationType}`,
          documentDate: new Date().toISOString().slice(0, 10),
          payload: { kind: 'education', ...eduForm },
        }),
      });
      setEduOpen(false);
      setEduForm({
        educationType: 'Высшее',
        institution: '',
        specialty: '',
        startDate: '',
        endDate: '',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения образования');
    } finally {
      setBusy(false);
    }
  }

  async function saveLanguage() {
    if (!id || !langForm.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/hr/documents', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: id,
          type: 'other',
          title: `Язык: ${langForm.name}`,
          documentDate: new Date().toISOString().slice(0, 10),
          payload: { kind: 'language', ...langForm },
        }),
      });
      setLangOpen(false);
      setLangForm({ name: '', level: 'Средний' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения языка');
    } finally {
      setBusy(false);
    }
  }

  async function loadBanksDict() {
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=admin');
      const banks = dicts.find((d) => d.code === 'banks');
      setBankOpts(
        (banks?.items || [])
          .filter((i) => i.isActive !== false)
          .map((i) => ({ code: i.code, name: i.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      );
    } catch {
      setBankOpts([]);
    }
  }

  async function openAccModal() {
    await loadBanksDict();
    setAccForm({ bankName: '', name: '', accountNumber: '', mfo: '', cardNumber: '', isPrimary: false });
    setAccOpen(true);
  }

  async function saveBankAccount() {
    if (!id || !accForm.accountNumber.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}/bank-accounts`, {
        method: 'POST',
        body: JSON.stringify({
          bankName: accForm.bankName,
          name: accForm.name,
          accountNumber: accForm.accountNumber,
          mfo: accForm.mfo,
          cardNumber: accForm.cardNumber || undefined,
          isPrimary: accForm.isPrimary,
        }),
      });
      setAccOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения счета');
    } finally {
      setBusy(false);
    }
  }

  async function setPrimaryAccount(accountId: string) {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/bank-accounts/${accountId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function deleteBankAccount(accountId: string) {
    if (!id || !window.confirm('Удалить расчетный счет?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/bank-accounts/${accountId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function openCardModal() {
    setCardForm({
      cardNumber: '',
      accountId: '',
      accountNumber: '',
      bankCode: '',
      expiresAt: '',
      state: 'active',
      status: 'active',
    });
    setCardOpen(true);
  }

  async function saveBankCard() {
    if (!id || !cardForm.cardNumber.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}/bank-cards`, {
        method: 'POST',
        body: JSON.stringify({
          cardNumber: cardForm.cardNumber,
          accountId: cardForm.accountId || undefined,
          accountNumber: cardForm.accountNumber || undefined,
          bankCode: cardForm.bankCode || undefined,
          expiresAt: cardForm.expiresAt || undefined,
          state: cardForm.state,
          status: cardForm.status,
        }),
      });
      setCardOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения карты');
    } finally {
      setBusy(false);
    }
  }

  async function deleteBankCard(cardId: string) {
    if (!id || !window.confirm('Удалить банковскую карту?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/bank-cards/${cardId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function loadDocTypes() {
    const fallback = [
      { code: 'PASSPORT', name: 'Паспорт' },
      { code: 'ID', name: 'ID-карта' },
      { code: 'DIPLOMA', name: 'Диплом' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=core');
      const dict = dicts.find((d) => d.code === 'doc_types');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setDocTypeOpts(resolved);
      return resolved;
    } catch {
      setDocTypeOpts(fallback);
      return fallback;
    }
  }

  function docTypeLabel(code: string) {
    return docTypeOpts.find((t) => t.code === code)?.name || code;
  }

  const filteredDocTypes = useMemo(() => {
    const q = docTypeQuery.trim().toLowerCase();
    if (!q) return docTypeOpts;
    return docTypeOpts.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [docTypeOpts, docTypeQuery]);

  function pickDocType(code: string, name: string) {
    setDocForm((f) => ({ ...f, docType: code }));
    setDocTypeQuery(name);
    setDocTypeListOpen(false);
  }

  function appendDocFileNames(files: FileList | null) {
    if (!files?.length) return;
    const names = Array.from(files).map((f) => f.name);
    setDocForm((f) => ({ ...f, fileNames: [...f.fileNames, ...names] }));
  }

  async function openDocModal(edit?: NonNullable<Detail['personDocuments']>[number] | 'passport') {
    const opts = await loadDocTypes();
    if (edit === 'passport') {
      const pp = parsePassport(row?.person?.passport);
      setDocEditId(null);
      setDocForm({
        docType: 'PASSPORT',
        series: pp.series,
        docNumber: pp.number,
        issuer: '',
        issuedAt: '',
        startsAt: '',
        expiresAt: '',
        note: '',
        isValid: true,
        fileNames: [],
      });
      setDocTypeQuery(opts.find((t) => t.code === 'PASSPORT')?.name || 'Паспорт');
      setDocTypeListOpen(false);
      setDocOpen(true);
      return;
    }
    if (edit) {
      setDocEditId(edit.id);
      setDocForm({
        docType: edit.docType,
        series: edit.series || '',
        docNumber: edit.docNumber || '',
        issuer: edit.issuer || '',
        issuedAt: edit.issuedAt ? String(edit.issuedAt).slice(0, 10) : '',
        startsAt: edit.startsAt ? String(edit.startsAt).slice(0, 10) : '',
        expiresAt: edit.expiresAt ? String(edit.expiresAt).slice(0, 10) : '',
        note: edit.note || '',
        isValid: edit.isValid !== false,
        fileNames: edit.fileNames || [],
      });
      setDocTypeQuery(opts.find((t) => t.code === edit.docType)?.name || edit.docType);
    } else {
      setDocEditId(null);
      setDocForm({
        docType: 'PASSPORT',
        series: '',
        docNumber: '',
        issuer: '',
        issuedAt: '',
        startsAt: '',
        expiresAt: '',
        note: '',
        isValid: true,
        fileNames: [],
      });
      setDocTypeQuery('');
    }
    setDocTypeListOpen(false);
    setDocOpen(true);
  }

  async function savePersonDocument() {
    const picked =
      docTypeOpts.find(
        (t) =>
          t.code === docForm.docType ||
          t.name.toLowerCase() === docTypeQuery.trim().toLowerCase(),
      )?.code || docForm.docType;
    if (!id || !picked.trim() || !docForm.docNumber.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        docType: picked,
        series: docForm.series,
        docNumber: docForm.docNumber,
        issuer: docForm.issuer || undefined,
        issuedAt: docForm.issuedAt || undefined,
        startsAt: docForm.startsAt || undefined,
        expiresAt: docForm.expiresAt || undefined,
        note: docForm.note || undefined,
        isValid: docForm.isValid,
        fileNames: docForm.fileNames,
      };
      if (docEditId) {
        await apiFetch(`/api/employees/${id}/person-documents/${docEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/person-documents`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDocOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения документа');
    } finally {
      setBusy(false);
    }
  }

  async function deletePersonDocument(docId: string) {
    if (!id || !window.confirm('Удалить документ?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/person-documents/${docId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function loadKinshipDict() {
    const fallback = [
      { code: 'SPOUSE', name: 'Супруг(а)' },
      { code: 'HUSBAND', name: 'Муж' },
      { code: 'WIFE', name: 'Жена' },
      { code: 'FATHER', name: 'Отец' },
      { code: 'MOTHER', name: 'Мать' },
      { code: 'SON', name: 'Сын' },
      { code: 'DAUGHTER', name: 'Дочь' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=core');
      const dict = dicts.find((d) => d.code === 'kinship');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setKinshipOpts(resolved);
      return resolved;
    } catch {
      setKinshipOpts(fallback);
      return fallback;
    }
  }

  async function loadMaritalDict() {
    const fallback = [
      { code: 'SINGLE', name: 'Не женат / не замужем' },
      { code: 'MARRIED', name: 'Женат / замужем' },
      { code: 'DIVORCED', name: 'Разведён(а)' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=core');
      const dict = dicts.find((d) => d.code === 'marital');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setMaritalOpts(resolved);
      return resolved;
    } catch {
      setMaritalOpts(fallback);
      return fallback;
    }
  }

  const filteredKinship = useMemo(() => {
    const q = kinshipQuery.trim().toLowerCase();
    if (!q) return kinshipOpts;
    return kinshipOpts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [kinshipOpts, kinshipQuery]);

  const filteredMarital = useMemo(() => {
    const q = maritalQuery.trim().toLowerCase();
    if (!q) return maritalOpts;
    return maritalOpts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [maritalOpts, maritalQuery]);

  function maritalLabel(code?: string | null) {
    if (!code) return '';
    return maritalOpts.find((t) => t.code === code || t.name === code)?.name || code;
  }

  async function openRelModal(edit?: NonNullable<Detail['relatives']>[number]) {
    const opts = await loadKinshipDict();
    if (edit) {
      setRelEditId(edit.id);
      setRelForm({
        fullName: edit.fullName,
        relation: edit.relation,
        gender: edit.gender === 'Женский' || edit.gender === 'female' ? 'female' : 'male',
        phone: edit.phone || '',
        birthDate: edit.birthDate ? String(edit.birthDate).slice(0, 10) : '',
        workplace: edit.workplace || '',
        dependent: !!edit.dependent,
        isHidden: !!edit.isHidden,
      });
      setKinshipQuery(
        opts.find((t) => t.code === edit.relation || t.name === edit.relation)?.name ||
          edit.relation,
      );
    } else {
      setRelEditId(null);
      setRelForm({
        fullName: '',
        relation: '',
        gender: 'male',
        phone: '',
        birthDate: '',
        workplace: '',
        dependent: false,
        isHidden: false,
      });
      setKinshipQuery('');
    }
    setKinshipListOpen(false);
    setRelOpen(true);
  }

  async function saveRelative() {
    const relation =
      kinshipOpts.find(
        (t) =>
          t.code === relForm.relation ||
          t.name.toLowerCase() === kinshipQuery.trim().toLowerCase(),
      )?.name || kinshipQuery.trim() || relForm.relation;
    if (!id || !relForm.fullName.trim() || !relation) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        fullName: relForm.fullName.trim(),
        relation,
        gender: relForm.gender === 'female' ? 'Женский' : 'Мужской',
        phone: relForm.phone || undefined,
        birthDate: relForm.birthDate || undefined,
        workplace: relForm.workplace || undefined,
        dependent: relForm.dependent,
        isHidden: relForm.isHidden,
      };
      if (relEditId) {
        await apiFetch(`/api/employees/${id}/relatives/${relEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/relatives`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setRelOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения родственника');
    } finally {
      setBusy(false);
    }
  }

  async function deleteRelative(relativeId: string) {
    if (!id || !window.confirm('Удалить родственника?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/relatives/${relativeId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function openMaritalModal() {
    const opts = await loadMaritalDict();
    const cur = row?.profileExtras?.maritalStatus || '';
    setMaritalQuery(
      opts.find((t) => t.code === cur || t.name === cur)?.name || cur,
    );
    setMaritalListOpen(false);
    setMaritalOpen(true);
  }

  async function saveMaritalStatus() {
    if (!id) return;
    const picked =
      maritalOpts.find(
        (t) => t.name.toLowerCase() === maritalQuery.trim().toLowerCase(),
      )?.name || maritalQuery.trim();
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}/marital-status`, {
        method: 'PATCH',
        body: JSON.stringify({ maritalStatus: picked || null }),
      });
      setMaritalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function loadCertTypes() {
    const fallback = [
      { code: 'WORK', name: 'С места работы' },
      { code: 'SALARY', name: 'О зарплате' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=core');
      const dict = dicts.find((d) => d.code === 'certificates');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setCertTypeOpts(resolved);
      return resolved;
    } catch {
      setCertTypeOpts(fallback);
      return fallback;
    }
  }

  function certTypeLabel(code: string) {
    return certTypeOpts.find((t) => t.code === code || t.name === code)?.name || code;
  }

  const filteredCertTypes = useMemo(() => {
    const q = certTypeQuery.trim().toLowerCase();
    if (!q) return certTypeOpts;
    return certTypeOpts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [certTypeOpts, certTypeQuery]);

  async function openCertModal(edit?: NonNullable<Detail['certificates']>[number]) {
    const opts = await loadCertTypes();
    if (edit) {
      setCertEditId(edit.id);
      setCertForm({
        certType: edit.certType,
        certNumber: edit.certNumber,
        certDate: edit.certDate ? String(edit.certDate).slice(0, 10) : '',
        validFrom: edit.validFrom ? String(edit.validFrom).slice(0, 10) : '',
        validUntil: edit.validUntil ? String(edit.validUntil).slice(0, 10) : '',
        title: edit.title,
      });
      setCertTypeQuery(
        opts.find((t) => t.code === edit.certType || t.name === edit.certType)?.name ||
          edit.certType,
      );
    } else {
      setCertEditId(null);
      setCertForm({
        certType: '',
        certNumber: '',
        certDate: '',
        validFrom: '',
        validUntil: '',
        title: '',
      });
      setCertTypeQuery('');
    }
    setCertTypeListOpen(false);
    setCertOpen(true);
  }

  async function saveCertificate() {
    const picked =
      certTypeOpts.find(
        (t) =>
          t.code === certForm.certType ||
          t.name.toLowerCase() === certTypeQuery.trim().toLowerCase(),
      )?.name || certTypeQuery.trim() || certForm.certType;
    if (!id || !picked.trim() || !certForm.certNumber.trim() || !certForm.title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        certType: picked,
        certNumber: certForm.certNumber.trim(),
        certDate: certForm.certDate || undefined,
        validFrom: certForm.validFrom || undefined,
        validUntil: certForm.validUntil || undefined,
        title: certForm.title.trim(),
      };
      if (certEditId) {
        await apiFetch(`/api/employees/${id}/certificates/${certEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/certificates`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setCertOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения справки');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCertificate(certificateId: string) {
    if (!id || !window.confirm('Удалить справку?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/certificates/${certificateId}`, {
        method: 'DELETE',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function loadTenureTypes() {
    const fallback = [
      { code: 'TOTAL', name: 'Общий' },
      { code: 'CONTINUOUS', name: 'Непрерывный' },
      { code: 'SPECIAL', name: 'Специальный' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=core');
      const dict = dicts.find((d) => d.code === 'tenure');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setTenureTypeOpts(resolved);
      return resolved;
    } catch {
      setTenureTypeOpts(fallback);
      return fallback;
    }
  }

  async function loadAwardTypes() {
    const fallback = [
      { code: 'HONOR', name: 'Почётная грамота' },
      { code: 'MEDAL', name: 'Медаль' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=core');
      const dict = dicts.find((d) => d.code === 'awards');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setAwardTypeOpts(resolved);
      return resolved;
    } catch {
      setAwardTypeOpts(fallback);
      return fallback;
    }
  }

  function tenureTypeLabel(code: string) {
    return tenureTypeOpts.find((t) => t.code === code || t.name === code)?.name || code;
  }

  function awardTypeLabel(code: string) {
    return awardTypeOpts.find((t) => t.code === code || t.name === code)?.name || code;
  }

  const filteredTenureTypes = useMemo(() => {
    const q = tenureTypeQuery.trim().toLowerCase();
    if (!q) return tenureTypeOpts;
    return tenureTypeOpts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [tenureTypeOpts, tenureTypeQuery]);

  const filteredAwardTypes = useMemo(() => {
    const q = awardTypeQuery.trim().toLowerCase();
    if (!q) return awardTypeOpts;
    return awardTypeOpts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [awardTypeOpts, awardTypeQuery]);

  async function openTenureModal(edit?: NonNullable<Detail['tenures']>[number]) {
    const opts = await loadTenureTypes();
    if (edit) {
      setTenureEditId(edit.id);
      setTenureForm({
        tenureType: edit.tenureType,
        stillWorking: !!edit.stillWorking,
        countedFrom: edit.countedFrom ? String(edit.countedFrom).slice(0, 10) : '',
      });
      setTenureTypeQuery(
        opts.find((t) => t.code === edit.tenureType || t.name === edit.tenureType)?.name ||
          edit.tenureType,
      );
    } else {
      setTenureEditId(null);
      setTenureForm({ tenureType: '', stillWorking: false, countedFrom: '' });
      setTenureTypeQuery('');
    }
    setTenureTypeListOpen(false);
    setTenureOpen(true);
  }

  async function saveTenure() {
    const picked =
      tenureTypeOpts.find(
        (t) =>
          t.code === tenureForm.tenureType ||
          t.name.toLowerCase() === tenureTypeQuery.trim().toLowerCase(),
      )?.name || tenureTypeQuery.trim() || tenureForm.tenureType;
    if (!id || !picked.trim() || !tenureForm.countedFrom) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        tenureType: picked,
        stillWorking: tenureForm.stillWorking,
        countedFrom: tenureForm.countedFrom,
      };
      if (tenureEditId) {
        await apiFetch(`/api/employees/${id}/tenures/${tenureEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/tenures`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setTenureOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения стажа');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTenure(tenureId: string) {
    if (!id || !window.confirm('Удалить стаж?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/tenures/${tenureId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function openWorkModal(edit?: NonNullable<Detail['workplaces']>[number]) {
    if (edit) {
      setWorkEditId(edit.id);
      setWorkForm({
        organization: edit.organization,
        position: edit.position,
        orgAddress: edit.orgAddress || '',
        startDate: edit.startDate ? String(edit.startDate).slice(0, 10) : '',
        endDate: edit.endDate ? String(edit.endDate).slice(0, 10) : '',
        description: edit.description || '',
      });
    } else {
      setWorkEditId(null);
      setWorkForm({
        organization: '',
        position: '',
        orgAddress: '',
        startDate: '',
        endDate: '',
        description: '',
      });
    }
    setWorkOpen(true);
  }

  async function saveWorkplace() {
    if (!id || !workForm.organization.trim() || !workForm.position.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        organization: workForm.organization.trim(),
        position: workForm.position.trim(),
        orgAddress: workForm.orgAddress || undefined,
        startDate: workForm.startDate || undefined,
        endDate: workForm.endDate || undefined,
        description: workForm.description || undefined,
      };
      if (workEditId) {
        await apiFetch(`/api/employees/${id}/workplaces/${workEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/workplaces`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setWorkOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения места работы');
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkplace(workplaceId: string) {
    if (!id || !window.confirm('Удалить место работы?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/workplaces/${workplaceId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function openAwardModal(edit?: NonNullable<Detail['awards']>[number]) {
    const opts = await loadAwardTypes();
    if (edit) {
      setAwardEditId(edit.id);
      setAwardForm({
        awardType: edit.awardType,
        docTitle: edit.docTitle || '',
        docNumber: edit.docNumber || '',
        awardDate: edit.awardDate ? String(edit.awardDate).slice(0, 10) : '',
      });
      setAwardTypeQuery(
        opts.find((t) => t.code === edit.awardType || t.name === edit.awardType)?.name ||
          edit.awardType,
      );
    } else {
      setAwardEditId(null);
      setAwardForm({ awardType: '', docTitle: '', docNumber: '', awardDate: '' });
      setAwardTypeQuery('');
    }
    setAwardTypeListOpen(false);
    setAwardOpen(true);
  }

  async function saveAward() {
    const picked =
      awardTypeOpts.find(
        (t) =>
          t.code === awardForm.awardType ||
          t.name.toLowerCase() === awardTypeQuery.trim().toLowerCase(),
      )?.name || awardTypeQuery.trim() || awardForm.awardType;
    if (!id || !picked.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        awardType: picked,
        docTitle: awardForm.docTitle || undefined,
        docNumber: awardForm.docNumber || undefined,
        awardDate: awardForm.awardDate || undefined,
      };
      if (awardEditId) {
        await apiFetch(`/api/employees/${id}/awards/${awardEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/awards`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setAwardOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения награды');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAward(awardId: string) {
    if (!id || !window.confirm('Удалить награду?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/awards/${awardId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function openEmpFileModal(edit?: NonNullable<Detail['employeeFiles']>[number]) {
    if (edit) {
      setEmpFileEditId(edit.id);
      setEmpFileForm({
        name: edit.name,
        note: edit.note || '',
        file: null,
      });
    } else {
      setEmpFileEditId(null);
      setEmpFileForm({ name: '', note: '', file: null });
    }
    setEmpFileDrag(false);
    setEmpFileOpen(true);
  }

  function pickEmpFile(file: File | null) {
    if (!file) return;
    setEmpFileForm((f) => ({
      ...f,
      file,
      name: f.name.trim() || file.name.replace(/\.[^.]+$/, ''),
    }));
  }

  async function saveEmployeeFile() {
    if (!id || !empFileForm.name.trim()) return;
    if (!empFileEditId && !empFileForm.file) return;
    setBusy(true);
    setError('');
    try {
      if (empFileEditId) {
        await apiFetch(`/api/employees/${id}/files/${empFileEditId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: empFileForm.name.trim(),
            note: empFileForm.note.trim() || null,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append('name', empFileForm.name.trim());
        if (empFileForm.note.trim()) fd.append('note', empFileForm.note.trim());
        fd.append('file', empFileForm.file!);
        await apiFetch(`/api/employees/${id}/files`, { method: 'POST', body: fd });
      }
      setEmpFileOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения файла');
    } finally {
      setBusy(false);
    }
  }

  async function deleteEmployeeFile(fileId: string) {
    if (!id || !window.confirm('Удалить файл?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/files/${fileId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function loadInvTypes() {
    const fallback = [
      { code: 'PC', name: 'Компьютер' },
      { code: 'PHONE', name: 'Телефон' },
      { code: 'UNIFORM', name: 'Форма' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=core');
      const dict = dicts.find((d) => d.code === 'inventory_types');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setInvTypeOpts(resolved);
      return resolved;
    } catch {
      setInvTypeOpts(fallback);
      return fallback;
    }
  }

  function invTypeLabel(code: string) {
    return invTypeOpts.find((t) => t.code === code || t.name === code)?.name || code;
  }

  const filteredInvTypes = useMemo(() => {
    const q = invTypeQuery.trim().toLowerCase();
    if (!q) return invTypeOpts;
    return invTypeOpts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [invTypeOpts, invTypeQuery]);

  const filteredInventory = useMemo(() => {
    let list = row?.inventoryItems ?? [];
    const q = invSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        [
          i.inventoryType,
          i.inventoryNumber,
          i.model,
          i.manufacturer,
          i.locationName,
          i.userName,
          i.responsibleName,
          i.status,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    if (invFilterApplied.userName.trim()) {
      const u = invFilterApplied.userName.trim().toLowerCase();
      list = list.filter((i) => (i.userName || '').toLowerCase().includes(u));
    }
    if (invFilterApplied.responsibleName.trim()) {
      const r = invFilterApplied.responsibleName.trim().toLowerCase();
      list = list.filter((i) => (i.responsibleName || '').toLowerCase().includes(r));
    }
    if (invFilterApplied.purchaseFrom) {
      list = list.filter(
        (i) =>
          i.purchaseDate &&
          String(i.purchaseDate).slice(0, 10) >= invFilterApplied.purchaseFrom,
      );
    }
    if (invFilterApplied.purchaseTo) {
      list = list.filter(
        (i) =>
          i.purchaseDate &&
          String(i.purchaseDate).slice(0, 10) <= invFilterApplied.purchaseTo,
      );
    }
    if (invFilterApplied.statusReceived) {
      list = list.filter((i) => /получен/i.test(i.status || ''));
    }
    return list;
  }, [row?.inventoryItems, invSearch, invFilterApplied]);

  function nowLocalInput() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function openInvModal(edit?: NonNullable<Detail['inventoryItems']>[number]) {
    const opts = await loadInvTypes();
    const fullName = row
      ? [row.lastName, row.firstName, row.middleName].filter(Boolean).join(' ')
      : '';
    if (edit) {
      setInvEditId(edit.id);
      setInvForm({
        inventoryType: edit.inventoryType,
        model: edit.model || '',
        manufacturer: edit.manufacturer || '',
        operationAt: edit.operationAt
          ? String(edit.operationAt).slice(0, 16)
          : nowLocalInput(),
        purchaseDate: edit.purchaseDate ? String(edit.purchaseDate).slice(0, 10) : '',
        locationName: edit.locationName || '',
        userName: edit.userName || fullName,
        responsibleName: edit.responsibleName || '',
        status: edit.status || 'Получен',
        note: edit.note || '',
      });
      setInvTypeQuery(
        opts.find((t) => t.code === edit.inventoryType || t.name === edit.inventoryType)
          ?.name || edit.inventoryType,
      );
    } else {
      setInvEditId(null);
      setInvForm({
        inventoryType: '',
        model: '',
        manufacturer: '',
        operationAt: nowLocalInput(),
        purchaseDate: '',
        locationName: '',
        userName: fullName,
        responsibleName: '',
        status: 'Получен',
        note: '',
      });
      setInvTypeQuery('');
    }
    setInvTypeListOpen(false);
    setInvOpen(true);
  }

  async function saveInventory() {
    const picked =
      invTypeOpts.find(
        (t) =>
          t.code === invForm.inventoryType ||
          t.name.toLowerCase() === invTypeQuery.trim().toLowerCase(),
      )?.name || invTypeQuery.trim() || invForm.inventoryType;
    if (!id || !picked.trim() || !invForm.status.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        inventoryType: picked,
        model: invForm.model || undefined,
        manufacturer: invForm.manufacturer || undefined,
        operationAt: invForm.operationAt
          ? new Date(invForm.operationAt).toISOString()
          : undefined,
        purchaseDate: invForm.purchaseDate || undefined,
        locationName: invForm.locationName || undefined,
        userName: invForm.userName || undefined,
        responsibleName: invForm.responsibleName || undefined,
        status: invForm.status,
        note: invForm.note || undefined,
      };
      if (invEditId) {
        await apiFetch(`/api/employees/${id}/inventory/${invEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/inventory`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setInvOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения инвентаря');
    } finally {
      setBusy(false);
    }
  }

  async function deleteInventory(itemId: string) {
    if (!id || !window.confirm('Удалить инвентарь?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/inventory/${itemId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function applyInvFilter() {
    setInvFilterApplied({ ...invFilterDraft });
    setInvFilterOpen(false);
  }

  function clearInvFilter() {
    const empty = {
      userName: '',
      responsibleName: '',
      purchaseFrom: '',
      purchaseTo: '',
      statusReceived: false,
    };
    setInvFilterDraft(empty);
    setInvFilterApplied(empty);
    setInvFilterOpen(false);
  }

  const filteredCars = useMemo(() => {
    const list = row?.cars ?? [];
    const q = carSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [c.name, c.plateNumber, c.code, c.isActive ? 'активный' : 'неактивный']
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [row?.cars, carSearch]);

  function openCarModal(edit?: NonNullable<Detail['cars']>[number]) {
    if (edit) {
      setCarEditId(edit.id);
      setCarForm({
        name: edit.name,
        plateNumber: edit.plateNumber,
        code: edit.code || '',
        isActive: edit.isActive !== false,
      });
    } else {
      setCarEditId(null);
      setCarForm({ name: '', plateNumber: '', code: '', isActive: true });
    }
    setCarOpen(true);
  }

  async function saveCar() {
    if (!id || !carForm.name.trim() || !carForm.plateNumber.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        name: carForm.name.trim(),
        plateNumber: carForm.plateNumber.trim(),
        code: carForm.code.trim() || undefined,
        isActive: carForm.isActive,
      };
      if (carEditId) {
        await apiFetch(`/api/employees/${id}/cars/${carEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/cars`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setCarOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения автомобиля');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCar(carId: string) {
    if (!id || !window.confirm('Удалить автомобиль?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/cars/${carId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  const FINGER_LEFT = [
    { i: 0, label: 'Мизинец' },
    { i: 1, label: 'Безымянный' },
    { i: 2, label: 'Средний' },
    { i: 3, label: 'Указательный' },
    { i: 4, label: 'Большой' },
  ] as const;
  const FINGER_RIGHT = [
    { i: 5, label: 'Большой' },
    { i: 6, label: 'Указательный' },
    { i: 7, label: 'Средний' },
    { i: 8, label: 'Безымянный' },
    { i: 9, label: 'Мизинец' },
  ] as const;

  function syncIdentForm(data: Detail) {
    setIdentForm({
      pin: data.profileExtras?.pin || '',
      pinCode: data.profileExtras?.pinCode || '',
      rfidNumber: data.profileExtras?.rfidNumber || '',
      fingerprints: data.profileExtras?.fingerprints || [],
    });
  }

  async function saveIdentification() {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}/identification`, {
        method: 'PATCH',
        body: JSON.stringify({
          pin: identForm.pin.trim() || null,
          pinCode: identForm.pinCode.trim() || null,
          rfidNumber: identForm.rfidNumber.trim() || null,
          fingerprints: identForm.fingerprints,
        }),
      });
      await load();
      setFaceMsg('Идентификация сохранена');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function openFingerprintModal() {
    const initial = [...(identForm.fingerprints || [])];
    setFpDraft(initial);
    setFpSelected(initial[0] ?? 0);
    setFpStep(1);
    setFpOpen(true);
  }

  function toggleFingerprint(idx: number) {
    setFpSelected(idx);
    setFpStep(1);
    setFpDraft((prev) =>
      prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a, b) => a - b),
    );
  }

  async function saveFingerprints() {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}/identification`, {
        method: 'PATCH',
        body: JSON.stringify({ fingerprints: fpDraft }),
      });
      setIdentForm((f) => ({ ...f, fingerprints: fpDraft }));
      setFpOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения отпечатков');
    } finally {
      setBusy(false);
    }
  }

  async function clearFacePhoto() {
    if (!id || !window.confirm('Удалить основное фото?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/face`, { method: 'DELETE' });
      await load();
      setFaceMsg('Фото удалено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления фото');
    } finally {
      setBusy(false);
    }
  }

  async function loadCitizenshipOpts() {
    const fallback = [
      { code: 'UZ', name: 'Узбекистан' },
      { code: 'RU', name: 'Россия' },
      { code: 'KZ', name: 'Казахстан' },
      { code: 'TJ', name: 'Таджикистан' },
      { code: 'KG', name: 'Кыргызстан' },
      { code: 'TM', name: 'Туркменистан' },
    ];
    try {
      const dicts = await apiFetch<
        Array<{ code: string; items?: Array<{ code: string; name: string; isActive?: boolean }> }>
      >('/api/settings/dictionaries?kind=admin');
      const dict = dicts.find((d) => d.code === 'countries');
      const opts = (dict?.items || [])
        .filter((i) => i.isActive !== false)
        .map((i) => ({ code: i.code, name: i.name }));
      const resolved = opts.length ? opts : fallback;
      setCitizenshipOpts(resolved);
      return resolved;
    } catch {
      setCitizenshipOpts(fallback);
      return fallback;
    }
  }

  const filteredCitizenship = useMemo(() => {
    const q = citizenshipQuery.trim().toLowerCase();
    if (!q) return citizenshipOpts;
    return citizenshipOpts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [citizenshipOpts, citizenshipQuery]);

  async function saveExtraInfo() {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}/extra-info`, {
        method: 'PATCH',
        body: JSON.stringify({
          altFirstName: extraForm.altFirstName.trim() || null,
          altLastName: extraForm.altLastName.trim() || null,
          altMiddleName: extraForm.altMiddleName.trim() || null,
          citizenship: citizenshipQuery.trim() || null,
          extraCode: extraForm.extraCode.trim() || null,
          notKeyEmployee: extraForm.notKeyEmployee,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  const filteredMarkBlocks = useMemo(() => {
    let list = row?.markBlocks ?? [];
    const q = blockSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((b) =>
        [b.startDate, b.endDate, b.note]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    if (blockFilterApplied.from) {
      list = list.filter(
        (b) => String(b.startDate).slice(0, 10) >= blockFilterApplied.from,
      );
    }
    if (blockFilterApplied.to) {
      list = list.filter((b) => {
        const end = b.endDate ? String(b.endDate).slice(0, 10) : String(b.startDate).slice(0, 10);
        return end <= blockFilterApplied.to;
      });
    }
    if (blockFilterApplied.note.trim()) {
      const n = blockFilterApplied.note.trim().toLowerCase();
      list = list.filter((b) => (b.note || '').toLowerCase().includes(n));
    }
    return list;
  }, [row?.markBlocks, blockSearch, blockFilterApplied]);

  function openBlockModal(edit?: NonNullable<Detail['markBlocks']>[number]) {
    if (edit) {
      setBlockEditId(edit.id);
      setBlockForm({
        startDate: edit.startDate ? String(edit.startDate).slice(0, 10) : '',
        endDate: edit.endDate ? String(edit.endDate).slice(0, 10) : '',
        note: edit.note || '',
      });
    } else {
      setBlockEditId(null);
      setBlockForm({ startDate: '', endDate: '', note: '' });
    }
    setBlockOpen(true);
  }

  async function saveMarkBlock() {
    if (!id || !blockForm.startDate) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        startDate: blockForm.startDate,
        endDate: blockForm.endDate || undefined,
        note: blockForm.note || undefined,
      };
      if (blockEditId) {
        await apiFetch(`/api/employees/${id}/mark-blocks/${blockEditId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/employees/${id}/mark-blocks`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setBlockOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения периода');
    } finally {
      setBusy(false);
    }
  }

  async function deleteMarkBlock(blockId: string) {
    if (!id || !window.confirm('Удалить период блокировки?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}/mark-blocks/${blockId}`, {
        method: 'DELETE',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function persistPrimaryTabs(order: TabKey[]) {
    setPrimaryTabOrder(order);
    try {
      localStorage.setItem('hrhub.emp.primaryTabs', JSON.stringify(order));
    } catch {
      /* ignore */
    }
  }

  function resetPrimaryTabs() {
    const def = PRIMARY_TABS.map((t) => t.key);
    persistPrimaryTabs(def);
    setResetTabsOpen(false);
    setTabSettingsOpen(false);
  }

  function toggleSalaryVisible() {
    setSalaryVisible((v) => {
      const next = !v;
      try {
        localStorage.setItem('hrhub.emp.salaryVisible', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const visiblePrimaryTabs = useMemo(() => {
    const byKey = new Map(PRIMARY_TABS.map((t) => [t.key, t]));
    return primaryTabOrder
      .map((k) => byKey.get(k))
      .filter(Boolean)
      .slice(0, 5) as typeof PRIMARY_TABS;
  }, [primaryTabOrder]);

  async function loadSchedules() {
    try {
      const list = await apiFetch<
        { id: string; name: string; startTime?: string | null; endTime?: string | null }[]
      >('/api/attendance/schedules');
      setSchedules(list);
      if (!schedForm.scheduleId && list[0]) {
        setSchedForm((f) => ({ ...f, scheduleId: list[0].id }));
      }
    } catch {
      /* ignore */
    }
  }

  async function saveManualMark() {
    if (!id || !markForm.occurredAt) return;
    setBusy(true);
    setError('');
    try {
      const loc =
        (row?.attachedLocations ?? []).find((l) => l.id === markForm.locationId) ||
        (row?.locations ?? []).find((l) => l.id === markForm.locationId);
      await apiFetch('/api/attendance/marks', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: id,
          occurredAt: new Date(markForm.occurredAt).toISOString(),
          markType: markForm.markType,
          locationId: markForm.locationId || undefined,
          locationName: loc?.name,
          note: markForm.note.trim() || undefined,
          identificationType: 'Ручной ввод',
          deviceType: 'Ручной',
          isValid: markForm.isValid,
        }),
      });
      setMarkAddOpen(false);
      setMarkForm({
        locationId: '',
        occurredAt: toDatetimeLocalValue(),
        markType: 'mark',
        note: '',
        isValid: true,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания отметки');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDayMarkValid(markId: string, next: boolean) {
    setDayMarkBusy(markId);
    setError('');
    try {
      await apiFetch(`/api/attendance/marks/${markId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isValid: next }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка обновления отметки');
    } finally {
      setDayMarkBusy(null);
    }
  }

  async function deleteDayMark(markId: string) {
    if (!(await confirm('Удалить отметку?'))) return;
    setDayMarkBusy(markId);
    setError('');
    try {
      await apiFetch(`/api/attendance/marks/${markId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления отметки');
    } finally {
      setDayMarkBusy(null);
    }
  }

  async function exportMarksExcel() {
    const header = [
      'Время',
      'Локация',
      'Тип устройства',
      'Тип отметки',
      'Тип идентификации',
      'Примечание',
    ];
    const rows = filteredMarks.map((m) => {
      const meta = markTypeMeta(m);
      return [
        fmtDateTime(m.occurredAt),
        m.locationName || '',
        m.deviceType || '',
        meta.label,
        m.identificationType || '',
        m.note || '',
      ];
    });
    await downloadStyledXlsx({
      filename: `marks-${id}.xlsx`,
      sheetName: 'Отметки',
      title: 'Отметки сотрудника',
      subtitle: row ? `${fullName(row)} · таб. ${row.tabNumber}` : undefined,
      columns: header,
      rows,
      colWidths: [20, 18, 14, 14, 16, 24],
    });
    setMarkMenuOpen(false);
  }

  async function saveScheduleRequest() {
    if (!id || !schedForm.title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const sch = schedules.find((s) => s.id === schedForm.scheduleId);
      await apiFetch('/api/hr/requests', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: id,
          type: 'schedule_change',
          title: schedForm.title.trim(),
          payload: {
            note: schedForm.note.trim() || undefined,
            scheduleId: schedForm.scheduleId || undefined,
            scheduleName: sch
              ? `${sch.name}${sch.startTime && sch.endTime ? ` (${sch.startTime}-${sch.endTime})` : ''}`
              : undefined,
            startDate: schedForm.startDate || undefined,
            endDate: schedForm.endDate || undefined,
          },
        }),
      });
      setSchedOpen(false);
      setSchedForm({
        title: '',
        note: '',
        startDate: '',
        endDate: '',
        scheduleId: schedules[0]?.id ?? '',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания запроса');
    } finally {
      setBusy(false);
    }
  }

  async function reviewScheduleRequest(
    requestId: string,
    status: 'approved' | 'rejected',
    reviewNote?: string,
  ) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/requests/${requestId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reviewNote: reviewNote?.trim() || undefined,
        }),
      });
      setSchedReviewId(null);
      setSchedReviewNote('');
      setSchedSelectedPending((ids) => ids.filter((x) => x !== requestId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка рассмотрения');
    } finally {
      setBusy(false);
    }
  }

  async function exportSchedExcel(
    rows: NonNullable<Detail['requests']>,
    filename: string,
  ) {
    const header = [
      'Дата запроса',
      'Тип запроса',
      'Даты запроса',
      'Примечание',
      'Примечание руководителем',
      'Состояние',
    ];
    const dataRows = rows.map((r) => {
      const p = scheduleReqPayload(r);
      const range =
        p.start || p.end ? `${fmtDate(p.start)} – ${fmtDate(p.end)}` : '—';
      return [
        fmtDate(r.createdAt),
        'Изменение графика',
        range,
        p.note || r.title || '',
        r.reviewNote || '',
        scheduleReqStatusRu(r.status),
      ];
    });
    const name = filename.endsWith('.csv')
      ? filename.replace(/\.csv$/i, '.xlsx')
      : filename.endsWith('.xlsx')
        ? filename
        : `${filename}.xlsx`;
    await downloadStyledXlsx({
      filename: name,
      sheetName: 'График',
      title: 'Запросы на изменение графика',
      subtitle: row ? fullName(row) : undefined,
      columns: header,
      rows: dataRows,
      colWidths: [14, 18, 22, 28, 24, 14],
    });
    setSchedMenuOpen(null);
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
  async function exportAbsExcel(
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
    const dataRows = rows.map((a) => {
      const reqDate = (a.meta?.requestDate as string) || a.createdAt || a.startDate;
      const review = (a.meta?.reviewNote as string) || '';
      return [
        fmtDate(String(reqDate)),
        a.absenceType.name,
        `${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}`,
        a.note || '',
        review,
        absenceStatusRu(a.status, a.endDate),
      ];
    });
    const name = filename.endsWith('.csv')
      ? filename.replace(/\.csv$/i, '.xlsx')
      : filename.endsWith('.xlsx')
        ? filename
        : `${filename}.xlsx`;
    await downloadStyledXlsx({
      filename: name,
      sheetName: 'Отсутствия',
      title: 'Запросы на отсутствие',
      subtitle: row ? fullName(row) : undefined,
      columns: header,
      rows: dataRows,
      colWidths: [14, 18, 22, 28, 24, 14],
    });
    setAbsMenuOpen(null);
  }
  async function dismiss() {
    if (!(await confirm('Уволить сотрудника?'))) return;
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
                    onClick={() => {
                      setActionMenuOpen(false);
                      void openOrgEdit();
                    }}
                  >
                    Изменить организацию
                  </button>
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
                          ['bonus', 'По видам времени'],
                          ['accrual', 'Книга начислений'],
                        ] as const
                      ).map(([reportKind, label]) => (
                        <div key={reportKind} className={styles.menuReportRow}>
                          <Link
                            className={styles.menuItem}
                            href={`/employees/${row.id}/reports/${reportKind}`}
                            onClick={() => setActionMenuOpen(false)}
                          >
                            {label}
                          </Link>
                          <Link
                            className={styles.menuGear}
                            href={`/employees/${row.id}/reports/${reportKind}?view=settings`}
                            title="Настройки"
                            onClick={() => setActionMenuOpen(false)}
                            aria-label={`Настройки: ${label}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                                stroke="currentColor"
                                strokeWidth="1.6"
                              />
                              <path
                                d="M19.4 13.1a7.7 7.7 0 0 0 .05-1.1 7.7 7.7 0 0 0-.05-1.1l1.7-1.3-1.6-2.8-2 .8a7.2 7.2 0 0 0-1.9-1.1l-.3-2.1h-3.2l-.3 2.1a7.2 7.2 0 0 0-1.9 1.1l-2-.8-1.6 2.8 1.7 1.3a7.7 7.7 0 0 0 0 2.2l-1.7 1.3 1.6 2.8 2-.8c.6.45 1.23.82 1.9 1.1l.3 2.1h3.2l.3-2.1c.67-.28 1.3-.65 1.9-1.1l2 .8 1.6-2.8-1.7-1.3Z"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </Link>
                        </div>
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
                <PhotoThumb
                  className={styles.avatar}
                  src={mediaSrc(row.faceProfile.photoUrl) || row.faceProfile.photoUrl}
                  alt={fullName(row)}
                  lightbox={photos}
                  slides={[{ src: row.faceProfile.photoUrl, caption: fullName(row) }]}
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
                onClick={() => void openDocModal('passport')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') void openDocModal('passport');
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
              <li
                className={`${styles.sideItem} ${styles.sideItemClickable}`}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/employees/${row.id}/schedule`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/employees/${row.id}/schedule`);
                  }
                }}
              >
                <SideIcon name="cal" />
                <div>
                  <span className={styles.sideLabel}>График работы</span>
                  <span className={`${styles.sideValue} ${styles.sideLink}`}>
                    {scheduleLabel(row)}
                  </span>
                </div>
              </li>
              <li
                className={`${styles.sideItem} ${styles.sideItemClickable}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setTab('locations');
                  setLocSub(attached.length ? 'attached' : 'available');
                  setMoreOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTab('locations');
                    setLocSub(attached.length ? 'attached' : 'available');
                    setMoreOpen(false);
                  }
                }}
              >
                <SideIcon name="pin" />
                <div>
                  <span className={styles.sideLabel}>Локации</span>
                  <span className={`${styles.sideValue} ${styles.sideLink}`}>
                    {attached.length
                      ? `${attached
                          .slice(0, 3)
                          .map((l) => l.name)
                          .join(', ')}${attached.length > 3 ? '…' : ''}`
                      : 'Открыть локации'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <SideIcon name="pay" />
                <div>
                  <span className={styles.sideLabel}>Зарплата</span>
                  <span className={styles.sideValue}>
                    {salaryVisible ? fmtMoney(row.baseSalary) : '********'}
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
              {visiblePrimaryTabs.map((t) => (
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
                        <span className={styles.moreItemIcon} aria-hidden>
                          {m.icon}
                        </span>
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={styles.tabSettingsWrap} ref={tabSettingsRef}>
                <button
                  type="button"
                  className={styles.tabSettingsBtn}
                  title="Настройки вкладок"
                  onClick={() => setTabSettingsOpen((v) => !v)}
                >
                  ⋮
                </button>
                {tabSettingsOpen ? (
                  <div className={styles.tabSettingsMenu}>
                    <button
                      type="button"
                      className={styles.tabSettingsItem}
                      onClick={() => {
                        setTabArrangeOpen(true);
                        setTabSettingsOpen(false);
                      }}
                    >
                      ⚙ Упорядочить вкладки
                    </button>
                    <button
                      type="button"
                      className={styles.tabSettingsItem}
                      onClick={() => {
                        setResetTabsOpen(true);
                        setTabSettingsOpen(false);
                      }}
                    >
                      ↺ По умолчанию
                    </button>
                    <button
                      type="button"
                      className={styles.tabSettingsItem}
                      onClick={() => {
                        toggleSalaryVisible();
                        setTabSettingsOpen(false);
                      }}
                    >
                      {salaryVisible ? '✓ ' : ''}
                      {salaryVisible ? 'Salary visible' : 'Salary hidden'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.panelBody}>
              {tab === 'main' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Организация и занятость</h3>
                      <div className={styles.sectionActions}>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => void openOrgEdit()}
                        >
                          Изменить
                        </button>
                      </div>
                    </div>
                    <div className={styles.fieldGrid}>
                      <div className={styles.field}>
                        <label>Табельный номер</label>
                        <div className={styles.fieldValue}>{row.tabNumber || '—'}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Подразделение</label>
                        <div className={styles.fieldValue}>
                          {row.division?.name || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Должность</label>
                        <div className={styles.fieldValue}>
                          {row.position?.name || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Грейд</label>
                        <div className={styles.fieldValue}>
                          {row.grade?.name || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>График работы</label>
                        <div className={styles.fieldValue}>
                          {scheduleLabel(row) || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Регион</label>
                        <div className={styles.fieldValue}>
                          {row.region?.name || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Тип занятости</label>
                        <div className={styles.fieldValue}>
                          {employmentTypeRu(row.employmentType)}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Статус</label>
                        <div className={styles.fieldValue}>
                          {statusRu(row.status)}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Дата приёма</label>
                        <div className={styles.fieldValue}>{fmtDate(row.hiredAt)}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Оклад</label>
                        <div className={styles.fieldValue}>
                          {salaryVisible ? fmtMoney(row.baseSalary) : '********'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Персональные данные</h3>
                      <div className={styles.sectionActions}>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => void openHistory('personal')}
                        >
                          История изменений
                        </button>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={openPersonalEdit}
                        >
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
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.inps || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>ИНН</label>
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.inn || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Контакты и адреса</h3>
                      <div className={styles.sectionActions}>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => void openHistory('contacts')}
                        >
                          История изменений
                        </button>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => void openContactsEdit()}
                        >
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
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.phoneExtra || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Корпоративный E-mail</label>
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.emailCorp || row.email || '—'}
                        </div>
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
                          {row.profileExtras?.address ||
                            row.profileExtras?.registeredAddress ||
                            row.region?.name ||
                            '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Адрес по прописке</label>
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.registeredAddress || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.section}>
                    <div className={styles.statsRow}>
                      <h3 className={styles.sectionTitle}>
                        Статистика посещений
                        {row.visitStats?.rangeLabel
                          ? ` за период (${row.visitStats.rangeLabel})`
                          : ''}
                      </h3>
                      <div className={styles.visitPeriodWrap}>
                        <button
                          type="button"
                          className={styles.visitPeriodBtn}
                          onClick={() => setVisitPeriodOpen((v) => !v)}
                        >
                          {visitPeriod === 'current_year'
                            ? 'Текущий год'
                            : visitPeriod === 'last_year'
                              ? 'Прошлый год'
                              : 'Последние 12 месяцев'}{' '}
                          ▾
                        </button>
                        {visitPeriodOpen ? (
                          <div className={styles.visitPeriodMenu} role="menu">
                            {(
                              [
                                ['current_year', 'Текущий год'],
                                ['last_year', 'Прошлый год'],
                                ['last12', 'Последние 12 месяцев'],
                              ] as const
                            ).map(([key, label]) => (
                              <button
                                key={key}
                                type="button"
                                className={styles.visitPeriodItem}
                                onClick={() => void loadVisitStats(key)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
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
                          const isLeave = leaveDateKeys.has(key);
                          const isDayOff = day?.status === 'day_off' || off;
                          const schedLabel = row.schedule
                            ? `${row.schedule.startTime} - ${row.schedule.endTime}`
                            : '09:00 - 18:00';
                          const inHm = fmtHmFromIso(day?.firstInAt);
                          const outHm = fmtHmFromIso(day?.lastOutAt);
                          const planned = plannedWorkMinutes(row.schedule);
                          const worked = workedMinutes(day);
                          const deficit =
                            inHm && outHm ? deficitLabel(planned, worked) : null;
                          const canOpen = inMonth;

                          let content: ReactNode = null;
                          if (inMonth) {
                            if (isLeave) {
                              content = (
                                <>
                                  <span className={`${styles.calBar} ${styles.calSched}`}>
                                    {schedLabel}
                                  </span>
                                  <span className={`${styles.calBar} ${styles.calLeave}`}>
                                    Отпуск
                                  </span>
                                </>
                              );
                            } else if (isDayOff) {
                              content = (
                                <span className={`${styles.calBar} ${styles.calOff}`}>
                                  Выходной
                                </span>
                              );
                            } else {
                              // 2 qator: grafik + fakt; 3-qator: deficit bo‘lsa
                              let factBar: ReactNode = (
                                <span className={`${styles.calBar} ${styles.calFactEmpty}`}>
                                  —
                                </span>
                              );
                              if (day?.status === 'absent' && !inHm) {
                                factBar = (
                                  <span className={`${styles.calBar} ${styles.calAbsent}`}>
                                    Прогул
                                  </span>
                                );
                              } else if (inHm && !outHm) {
                                factBar = (
                                  <span className={`${styles.calBar} ${styles.calNoOut}`}>
                                    {inHm} - Нет ухода
                                  </span>
                                );
                              } else if (inHm && outHm) {
                                factBar = (
                                  <span className={`${styles.calBar} ${styles.calFact}`}>
                                    {inHm} - {outHm}
                                  </span>
                                );
                              }
                              content = (
                                <>
                                  <span className={`${styles.calBar} ${styles.calSched}`}>
                                    {schedLabel}
                                  </span>
                                  {factBar}
                                  {deficit ? (
                                    <span className={styles.calDeficit}>{deficit}</span>
                                  ) : null}
                                </>
                              );
                            }
                          }

                          const cellClass = `${styles.calCell} ${
                            inMonth ? '' : styles.calCellMuted
                          } ${isToday ? styles.calCellToday : ''} ${
                            canOpen ? styles.calCellClickable : ''
                          } ${deficit ? styles.calCellTall : ''}`;

                          const inner = (
                            <>
                              <div
                                className={`${styles.calDayNum} ${
                                  isToday ? styles.calDayNumToday : ''
                                }`}
                              >
                                {date.getUTCDate()}
                              </div>
                              <div className={styles.calStack}>{content}</div>
                            </>
                          );

                          if (canOpen) {
                            return (
                              <button
                                key={key + String(inMonth)}
                                type="button"
                                className={cellClass}
                                onClick={() => {
                                  setDayModalKey(key);
                                  setDayModalTab('stats');
                                  setDayMarksFilter('used');
                                }}
                              >
                                {inner}
                              </button>
                            );
                          }

                          return (
                            <div key={key + String(inMonth)} className={cellClass}>
                              {inner}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className={styles.section}>
                      <div className={styles.marksToolbar}>
                        <button
                          type="button"
                          className={styles.marksAddBtn}
                          onClick={() => {
                            const locs =
                              row.attachedLocations?.length
                                ? row.attachedLocations
                                : row.locations ?? [];
                            setMarkForm({
                              locationId: locs[0]?.id ?? '',
                              occurredAt: toDatetimeLocalValue(),
                              markType: 'mark',
                              note: '',
                              isValid: true,
                            });
                            setMarkAddOpen(true);
                          }}
                        >
                          Добавить
                        </button>
                        <div className={styles.absSearchWrap}>
                          <span className={styles.absSearchIcon} aria-hidden>
                            ⌕
                          </span>
                          <input
                            className={styles.absSearch}
                            placeholder="Поиск..."
                            value={markQuery}
                            onChange={(e) => {
                              setMarkQuery(e.target.value);
                              setMarkPage(1);
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className={`${styles.absToolBtn} ${
                            markFilterOpen ? styles.absToolBtnActive : ''
                          }`}
                          title="Фильтр"
                          onClick={() => setMarkFilterOpen((v) => !v)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M3 5h18l-7 8v5l-4 2v-7L3 5z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {markFilterTypes.length || markFilterFrom || markFilterTo ? (
                            <span className={styles.absFilterBadge}>
                              {markFilterTypes.length +
                                (markFilterFrom ? 1 : 0) +
                                (markFilterTo ? 1 : 0)}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Скачать"
                          onClick={() => void exportMarksExcel()}
                        >
                          ⇩
                        </button>
                        <div className={styles.absMenuWrap}>
                          <button
                            type="button"
                            className={styles.absToolBtn}
                            title="Размер страницы"
                            onClick={() => setMarkPageSizeOpen((v) => !v)}
                          >
                            {markPageSize}
                          </button>
                          {markPageSizeOpen ? (
                            <div className={styles.absMenu}>
                              {[25, 50, 100, 200].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  className={styles.absMenuItem}
                                  onClick={() => {
                                    setMarkPageSize(n);
                                    setMarkPage(1);
                                    setMarkPageSizeOpen(false);
                                  }}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <span className={styles.absPager}>
                          {filteredMarks.length === 0
                            ? '0 / 0'
                            : `${(markPage - 1) * markPageSize + 1}-${Math.min(
                                markPage * markPageSize,
                                filteredMarks.length,
                              )} / ${filteredMarks.length}`}
                        </span>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          disabled={markPage <= 1}
                          onClick={() => setMarkPage((p) => Math.max(1, p - 1))}
                        >
                          ‹
                        </button>
                        <span className={styles.absPageNum}>{markPage}</span>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          disabled={markPage >= markPageCount}
                          onClick={() =>
                            setMarkPage((p) => Math.min(markPageCount, p + 1))
                          }
                        >
                          ›
                        </button>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Обновить"
                          onClick={() => void load()}
                        >
                          ↻
                        </button>
                        <div className={styles.absMenuWrap}>
                          <button
                            type="button"
                            className={styles.absToolBtn}
                            title="Меню"
                            onClick={() => setMarkMenuOpen((v) => !v)}
                          >
                            ≡
                          </button>
                          {markMenuOpen ? (
                            <div className={styles.absMenu}>
                              <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                              <button
                                type="button"
                                className={styles.absMenuItem}
                                onClick={() => {
                                  setMarkSortAsc((v) => !v);
                                  setMarkMenuOpen(false);
                                }}
                              >
                                Время {markSortAsc ? '↑' : '↓'}
                              </button>
                              <div className={styles.absMenuGroup}>ЭКСПОРТ</div>
                              <button
                                type="button"
                                className={styles.absMenuItem}
                                onClick={() => void exportMarksExcel()}
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
                                    markPageRows.length > 0 &&
                                    markPageRows.every((m) =>
                                      markSelected.includes(m.id),
                                    )
                                  }
                                  onChange={(e) => {
                                    const ids = markPageRows.map((m) => m.id);
                                    if (e.target.checked) {
                                      setMarkSelected((prev) => [
                                        ...new Set([...prev, ...ids]),
                                      ]);
                                    } else {
                                      setMarkSelected((prev) =>
                                        prev.filter((x) => !ids.includes(x)),
                                      );
                                    }
                                  }}
                                />
                              </th>
                              <th>
                                <button
                                  type="button"
                                  className={styles.thSort}
                                  onClick={() => setMarkSortAsc((v) => !v)}
                                >
                                  Время {markSortAsc ? '▴' : '▾'}
                                </button>
                              </th>
                              <th>Фото</th>
                              <th>Локация</th>
                              <th>Тип устройства</th>
                              <th>Тип отметки</th>
                              <th>Тип идентификации</th>
                            </tr>
                          </thead>
                          <tbody>
                            {markPageRows.length === 0 ? (
                              <EmptyRow cols={7} withIcon text="Нет данных" />
                            ) : (
                              markPageRows.map((m) => {
                                const meta = markTypeMeta(m);
                                const markSlides = markPageRows
                                  .map((x) => ({
                                    src: mediaSrc(x.photoUrl) || '',
                                    caption: `${markTypeMeta(x).label} ${fmtDateTime(x.occurredAt)}`,
                                  }))
                                  .filter((s) => s.src);
                                const photo = mediaSrc(m.photoUrl);
                                const photoIdx = photo
                                  ? markSlides.findIndex((s) => s.src === photo)
                                  : -1;
                                return (
                                  <tr key={m.id}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={markSelected.includes(m.id)}
                                        onChange={(e) => {
                                          setMarkSelected((prev) =>
                                            e.target.checked
                                              ? [...prev, m.id]
                                              : prev.filter((x) => x !== m.id),
                                          );
                                        }}
                                      />
                                    </td>
                                    <td>{fmtDateTime(m.occurredAt)}</td>
                                    <td>
                                      {photo ? (
                                        <PhotoThumb
                                          className={styles.markThumb}
                                          src={photo}
                                          alt=""
                                          lightbox={photos}
                                          slides={markSlides}
                                          index={photoIdx < 0 ? 0 : photoIdx}
                                        />
                                      ) : (
                                        <span className={styles.markThumbEmpty} />
                                      )}
                                    </td>
                                    <td>{m.locationName || '—'}</td>
                                    <td>{m.deviceType || '—'}</td>
                                    <td>
                                      <span className={styles.markTypeCell}>
                                        <i
                                          className={`${styles.markDot} ${
                                            meta.tone === 'in'
                                              ? styles.markDotIn
                                              : meta.tone === 'out'
                                                ? styles.markDotOut
                                                : styles.markDotMark
                                          }`}
                                        />
                                        {meta.label}
                                      </span>
                                    </td>
                                    <td>{m.identificationType || '—'}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      {markFilterOpen ? (
                        <aside className={styles.absFilterPanel} aria-label="Фильтр отметок">
                          <div className={styles.absFilterHead}>
                            <h3 className={styles.absFilterTitle}>Фильтр</h3>
                            <div className={styles.absFilterHeadActions}>
                              <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => {
                                  setMarkFilterTypes([]);
                                  setMarkFilterFrom('');
                                  setMarkFilterTo('');
                                  setMarkPage(1);
                                }}
                              >
                                Сбросить
                              </button>
                              <button
                                type="button"
                                className={styles.modalClose}
                                onClick={() => setMarkFilterOpen(false)}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          <div className={styles.absFilterBody}>
                            <div className={styles.absFilterCard}>
                              <div className={styles.absFilterCardTop}>
                                <span className={styles.absFilterCardLabel}>
                                  Тип отметки
                                </span>
                              </div>
                              {(
                                [
                                  ['in', 'Приход'],
                                  ['out', 'Уход'],
                                  ['estimated_out', 'Такминий уход'],
                                  ['mark', 'Отметка'],
                                  ['break_out', 'Перерыв уход'],
                                  ['break_in', 'Перерыв приход'],
                                ] as const
                              ).map(([k, label]) => (
                                <label key={k} className={styles.checkLabel}>
                                  <input
                                    type="checkbox"
                                    checked={markFilterTypes.includes(k)}
                                    onChange={(e) => {
                                      setMarkFilterTypes((prev) =>
                                        e.target.checked
                                          ? [...prev, k]
                                          : prev.filter((x) => x !== k),
                                      );
                                      setMarkPage(1);
                                    }}
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            <div className={styles.absFilterCard}>
                              <div className={styles.absFilterCardTop}>
                                <span className={styles.absFilterCardLabel}>Период</span>
                              </div>
                              <div className={styles.modalField}>
                                <label>С</label>
                                <input
                                  type="date"
                                  value={markFilterFrom}
                                  onChange={(e) => {
                                    setMarkFilterFrom(e.target.value);
                                    setMarkPage(1);
                                  }}
                                />
                              </div>
                              <div className={styles.modalField}>
                                <label>По</label>
                                <input
                                  type="date"
                                  value={markFilterTo}
                                  onChange={(e) => {
                                    setMarkFilterTo(e.target.value);
                                    setMarkPage(1);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className={styles.absFilterFoot}>
                            <button
                              type="button"
                              className={styles.btn}
                              onClick={() => setMarkFilterOpen(false)}
                            >
                              Применить
                            </button>
                          </div>
                        </aside>
                      ) : null}
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
                <div className={styles.absLayout}>
                  <div className={styles.absMain}>
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
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск"
                          value={absQueryPending}
                          onChange={(e) => {
                            setAbsQueryPending(e.target.value);
                            setAbsPagePending(1);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className={`${styles.absToolBtn} ${
                          absFilterOpen ? styles.absToolBtnActive : ''
                        }`}
                        title="Фильтр"
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsFilterDraft({ ...absFilterApplied });
                          setAbsFilterOpen((v) => !v);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M3 5h18l-7 8v5l-4 2v-7L3 5z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {absFilterActiveCount > 0 ? (
                          <span className={styles.absFilterBadge}>{absFilterActiveCount}</span>
                        ) : null}
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Excel"
                          onClick={() => setAbsPageSizeOpen((v) => !v)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                            <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" />
                          </svg>
                        </button>
                        {absPageSizeOpen ? (
                          <div className={styles.absMenu}>
                            {[50, 100, 500, 1000].map((n) => (
                              <button
                                key={n}
                                type="button"
                                className={styles.absMenuItem}
                                onClick={() => {
                                  setAbsPageSize(n);
                                  setAbsPagePending(1);
                                  setAbsPageDecided(1);
                                  setAbsPageSizeOpen(false);
                                }}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className={styles.absPager}>
                        {pendingAbsences.length === 0
                          ? '0 / 0'
                          : `${(absPagePending - 1) * absPageSize + 1}-${Math.min(
                              absPagePending * absPageSize,
                              pendingAbsences.length,
                            )} / ${pendingAbsences.length}`}
                      </span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPagePending <= 1}
                        onClick={() => setAbsPagePending((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      <span className={styles.absPageNum}>{absPagePending}</span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPagePending >= pendingPageCount}
                        onClick={() =>
                          setAbsPagePending((p) => Math.min(pendingPageCount, p + 1))
                        }
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Меню"
                          onClick={() =>
                            setAbsMenuOpen((m) => (m === 'pending' ? null : 'pending'))
                          }
                        >
                          ≡
                        </button>
                        {absMenuOpen === 'pending' ? (
                          <div className={styles.absMenu}>
                            <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                setAbsSortAsc((v) => !v);
                                setAbsMenuOpen(null);
                              }}
                            >
                              Дата запроса
                            </button>
                            <div className={styles.absMenuGroup}>НАСТРОЙКА ТАБЛИЦЫ</div>
                            <button type="button" className={styles.absMenuItem}>
                              Колонки
                            </button>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                void exportAbsExcel(pendingAbsences, 'unconfirmed-requests.xlsx');
                              }}
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
                                  pendingPageRows.length > 0 &&
                                  pendingPageRows.every((a) => absSelected.includes(a.id))
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAbsSelected((s) => [
                                      ...new Set([...s, ...pendingPageRows.map((a) => a.id)]),
                                    ]);
                                  } else {
                                    const drop = new Set(pendingPageRows.map((a) => a.id));
                                    setAbsSelected((s) => s.filter((x) => !drop.has(x)));
                                  }
                                }}
                              />
                            </th>
                            <th>
                              <button
                                type="button"
                                className={styles.thSort}
                                onClick={() => setAbsSortAsc((v) => !v)}
                              >
                                Дата запроса{' '}
                                <span aria-hidden>{absSortAsc ? '▴' : '▾'}</span>
                              </button>
                            </th>
                            <th>Вид отсутствия</th>
                            <th>Время</th>
                            <th>Примечание</th>
                            <th>Примечание руководителя</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingPageRows.length === 0 ? (
                            <EmptyRow cols={7} withIcon />
                          ) : (
                            pendingPageRows.map((a) => {
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
                                    <div className={styles.absRowAct}>
                                      <span className={`${styles.badge} ${styles.badgeWarn}`}>
                                        {absenceStatusRu(a.status, a.endDate)}
                                      </span>
                                      <button
                                        type="button"
                                        title="Подтвердить"
                                        disabled={absBusyId === a.id || busy}
                                        onClick={() =>
                                          void patchAbsenceStatus(a.id, 'approved')
                                        }
                                      >
                                        ✓
                                      </button>
                                      <button
                                        type="button"
                                        title="Отклонить"
                                        disabled={absBusyId === a.id || busy}
                                        onClick={() =>
                                          void patchAbsenceStatus(a.id, 'rejected')
                                        }
                                      >
                                        ✕
                                      </button>
                                    </div>
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
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск"
                          value={absQueryDecided}
                          onChange={(e) => {
                            setAbsQueryDecided(e.target.value);
                            setAbsPageDecided(1);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className={`${styles.absToolBtn} ${
                          absFilterOpen ? styles.absToolBtnActive : ''
                        }`}
                        title="Фильтр"
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsFilterDraft({ ...absFilterApplied });
                          setAbsFilterOpen((v) => !v);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M3 5h18l-7 8v5l-4 2v-7L3 5z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {absFilterActiveCount > 0 ? (
                          <span className={styles.absFilterBadge}>{absFilterActiveCount}</span>
                        ) : null}
                      </button>
                      <span className={styles.absPager}>
                        {decidedAbsences.length === 0
                          ? '0 / 0'
                          : `${(absPageDecided - 1) * absPageSize + 1}-${Math.min(
                              absPageDecided * absPageSize,
                              decidedAbsences.length,
                            )} / ${decidedAbsences.length}`}
                      </span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPageDecided <= 1}
                        onClick={() => setAbsPageDecided((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      <span className={styles.absPageNum}>{absPageDecided}</span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPageDecided >= decidedPageCount}
                        onClick={() =>
                          setAbsPageDecided((p) => Math.min(decidedPageCount, p + 1))
                        }
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          onClick={() =>
                            setAbsMenuOpen((m) => (m === 'decided' ? null : 'decided'))
                          }
                        >
                          ≡
                        </button>
                        {absMenuOpen === 'decided' ? (
                          <div className={styles.absMenu}>
                            <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                            <div className={styles.absMenuGroup}>НАСТРОЙКА ТАБЛИЦЫ</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() =>
                                void exportAbsExcel(decidedAbsences, 'confirmed-requests.xlsx')
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
                            <th>Примечание руководителя</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decidedPageRows.length === 0 ? (
                            <EmptyRow cols={7} withIcon />
                          ) : (
                            decidedPageRows.map((a) => {
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
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск"
                          value={absQueryAccrual}
                          onChange={(e) => setAbsQueryAccrual(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className={styles.absToolBtn}
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
                            <EmptyRow cols={7} withIcon />
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
                  </div>

                  {absFilterOpen ? (
                    <aside className={styles.absFilterPanel} aria-label="Фильтр">
                      <div className={styles.absFilterHead}>
                        <h3 className={styles.absFilterTitle}>Фильтр</h3>
                        <div className={styles.absFilterHeadActions}>
                          <button
                            type="button"
                            className={styles.absToolBtn}
                            title="Закрепить"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M15 4l5 5-3 1-4 4v4l-2 2v-6l-5-5 1-3 5 1z"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={styles.absToolBtn}
                            title="Свернуть"
                            onClick={() => setAbsFilterOpen(false)}
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            className={styles.absToolBtn}
                            aria-label="Закрыть"
                            onClick={() => setAbsFilterOpen(false)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className={styles.absFilterTools}>
                        <button type="button" className={styles.absTplBtn}>
                          Шаблон ▾
                        </button>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="По умолчанию"
                          onClick={() => {
                            setAbsFilterDraft(EMPTY_ABS_FILTER);
                            setAbsFilterRows([...DEFAULT_ABS_FILTER_ROWS]);
                          }}
                        >
                          ↻
                        </button>
                        <div className={styles.absMenuWrap}>
                          <button
                            type="button"
                            className={styles.absParamBtn}
                            onClick={() => setAbsAddParamOpen((v) => !v)}
                          >
                            + Добавить параметры
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
                      <div className={styles.absFilterBody}>
                        {absFilterRows.map((rowKey) => (
                          <div key={rowKey} className={styles.absFilterCard}>
                            <div className={styles.absFilterCardTop}>
                              <span className={styles.filterDrag} aria-hidden>
                                ‖
                              </span>
                              <span className={styles.absFilterCardLabel}>
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
                              {rowKey === 'absenceType' ? (
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  onClick={() =>
                                    setAbsFilterDraft((d) => ({
                                      ...d,
                                      absenceTypeIds: absTypes.map((t) => t.id),
                                    }))
                                  }
                                >
                                  выбрать все
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.filterRemove}
                                aria-label="Удалить"
                                onClick={() =>
                                  setAbsFilterRows((rows) =>
                                    rows.filter((r) => r !== rowKey),
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                            {rowKey === 'requestDate' ||
                            rowKey === 'start' ||
                            rowKey === 'end' ||
                            rowKey === 'createdAt' ? (
                              <div className={styles.dateRange}>
                                <label className={styles.dateField}>
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
                                    aria-label="Выбрать дату"
                                  />
                                  <span className={styles.dateFieldCal} aria-hidden>
                                    📅
                                  </span>
                                </label>
                                <label className={styles.dateField}>
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
                                    aria-label="Выбрать дату"
                                  />
                                  <span className={styles.dateFieldCal} aria-hidden>
                                    📅
                                  </span>
                                </label>
                              </div>
                            ) : null}
                            {rowKey === 'absenceType' ? (
                              <div className={styles.absTypePicker}>
                                <input
                                  className={styles.absTypeSearch}
                                  placeholder="Поиск..."
                                  value={absTypeSearch}
                                  onChange={(e) => setAbsTypeSearch(e.target.value)}
                                />
                                <div className={styles.absTypeList}>
                                  {filteredAbsTypes.map((t) => {
                                    const checked = absFilterDraft.absenceTypeIds.includes(
                                      t.id,
                                    );
                                    return (
                                      <label key={t.id} className={styles.checkLabel}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            setAbsFilterDraft((d) => ({
                                              ...d,
                                              absenceTypeIds: e.target.checked
                                                ? [...d.absenceTypeIds, t.id]
                                                : d.absenceTypeIds.filter((x) => x !== t.id),
                                            }));
                                          }}
                                        />
                                        {t.name}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
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
                              <div className={styles.checkGrid2}>
                                {(
                                  [
                                    ['pending', 'В ожидании'],
                                    ['approved', 'Подтвержден'],
                                    ['incoming', 'Входящий'],
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
                              <input readOnly value="Плановый" className={styles.absTypeSearch} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div className={styles.absFilterFoot}>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => {
                            setAbsFilterApplied({ ...absFilterDraft });
                            setAbsPagePending(1);
                            setAbsPageDecided(1);
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
                            setAbsPagePending(1);
                            setAbsPageDecided(1);
                          }}
                        >
                          Показать все
                        </button>
                      </div>
                    </aside>
                  ) : null}
                </div>
              ) : null}

              {tab === 'family' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Состав семьи</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        onClick={() => void openRelModal()}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>ФИО</th>
                            <th>Степень родства</th>
                            <th>Номер телефона</th>
                            <th>Дата рождения</th>
                            <th>Рабочее место</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.relatives ?? []).length === 0 ? (
                            <EmptyRow cols={6} withIcon text="нет данных" />
                          ) : (
                            row.relatives!.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.tableLink}
                                    onClick={() => void openRelModal(r)}
                                  >
                                    {r.fullName}
                                  </button>
                                </td>
                                <td>{r.relation}</td>
                                <td>{r.phone || '—'}</td>
                                <td>{fmtDate(r.birthDate)}</td>
                                <td>{r.workplace || '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={busy}
                                    onClick={() => void deleteRelative(r.id)}
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
                  </div>
                  <div className={styles.section}>
                    <div className={styles.familySubHead}>
                      <h3 className={styles.locTitle}>Состояние в браке</h3>
                      <button
                        type="button"
                        className={styles.btnLink}
                        onClick={() => void openMaritalModal()}
                      >
                        Добавить
                      </button>
                    </div>
                    {row.profileExtras?.maritalStatus ? (
                      <p className={styles.familyValue}>
                        {maritalLabel(row.profileExtras.maritalStatus)}
                      </p>
                    ) : (
                      <p className={styles.familyEmpty}>Данные не найдены</p>
                    )}
                  </div>
                </>
              ) : null}
              {tab === 'schedule_req' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Не подтвержденные запросы</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        onClick={() => {
                          void loadSchedules();
                          setSchedOpen(true);
                        }}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск..."
                          value={schedQueryPending}
                          onChange={(e) => {
                            setSchedQueryPending(e.target.value);
                            setSchedPagePending(1);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className={`${styles.absToolBtn} ${
                          schedFilterOpen ? styles.absToolBtnActive : ''
                        }`}
                        title="Фильтр"
                        onClick={() => setSchedFilterOpen((v) => !v)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M3 5h18l-7 8v5l-4 2v-7L3 5z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {schedFilterStatus.length > 0 ? (
                          <span className={styles.absFilterBadge}>
                            {schedFilterStatus.length}
                          </span>
                        ) : null}
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Размер страницы"
                          onClick={() => setSchedPageSizeOpen((v) => !v)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                            <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" />
                          </svg>
                        </button>
                        {schedPageSizeOpen ? (
                          <div className={styles.absMenu}>
                            {[50, 100, 500, 1000].map((n) => (
                              <button
                                key={n}
                                type="button"
                                className={styles.absMenuItem}
                                onClick={() => {
                                  setSchedPageSize(n);
                                  setSchedPagePending(1);
                                  setSchedPageDecided(1);
                                  setSchedPageSizeOpen(false);
                                }}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Скачать Excel"
                        onClick={() =>
                          void exportSchedExcel(
                            filteredPendingSched,
                            'schedule-requests-pending.xlsx',
                          )
                        }
                      >
                        ⇩
                      </button>
                      <span className={styles.absPager}>
                        {filteredPendingSched.length === 0
                          ? '0-0 / 0'
                          : `${(schedPagePending - 1) * schedPageSize + 1}-${Math.min(
                              schedPagePending * schedPageSize,
                              filteredPendingSched.length,
                            )} / ${filteredPendingSched.length}`}
                      </span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={schedPagePending <= 1}
                        onClick={() => setSchedPagePending((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      <span className={styles.absPageNum}>{schedPagePending}</span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={schedPagePending >= schedPendingPageCount}
                        onClick={() =>
                          setSchedPagePending((p) =>
                            Math.min(schedPendingPageCount, p + 1),
                          )
                        }
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Меню"
                          onClick={() =>
                            setSchedMenuOpen((m) => (m === 'pending' ? null : 'pending'))
                          }
                        >
                          ≡
                        </button>
                        {schedMenuOpen === 'pending' ? (
                          <div className={styles.absMenu}>
                            <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                setSchedSortAsc((v) => !v);
                                setSchedMenuOpen(null);
                              }}
                            >
                              Дата запроса {schedSortAsc ? '↑' : '↓'}
                            </button>
                            <div className={styles.absMenuGroup}>ДЕЙСТВИЯ</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              disabled={!schedSelectedPending.length || busy}
                              onClick={() => {
                                void (async () => {
                                  for (const rid of schedSelectedPending) {
                                    await reviewScheduleRequest(rid, 'approved');
                                  }
                                  setSchedSelectedPending([]);
                                  setSchedMenuOpen(null);
                                })();
                              }}
                            >
                              Утвердить выбранные
                            </button>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              disabled={!schedSelectedPending.length || busy}
                              onClick={() => {
                                void (async () => {
                                  for (const rid of schedSelectedPending) {
                                    await reviewScheduleRequest(rid, 'rejected');
                                  }
                                  setSchedSelectedPending([]);
                                  setSchedMenuOpen(null);
                                })();
                              }}
                            >
                              Отклонить выбранные
                            </button>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                void exportSchedExcel(
                                  filteredPendingSched,
                                  'schedule-requests-pending.xlsx',
                                );
                              }}
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
                                  pendingSchedPageRows.length > 0 &&
                                  pendingSchedPageRows.every((r) =>
                                    schedSelectedPending.includes(r.id),
                                  )
                                }
                                onChange={(e) => {
                                  const ids = pendingSchedPageRows.map((r) => r.id);
                                  if (e.target.checked) {
                                    setSchedSelectedPending((prev) => [
                                      ...new Set([...prev, ...ids]),
                                    ]);
                                  } else {
                                    setSchedSelectedPending((prev) =>
                                      prev.filter((id) => !ids.includes(id)),
                                    );
                                  }
                                }}
                              />
                            </th>
                            <th>
                              <button
                                type="button"
                                className={styles.thSort}
                                onClick={() => setSchedSortAsc((v) => !v)}
                              >
                                Дата запроса {schedSortAsc ? '▴' : '▾'}
                              </button>
                            </th>
                            <th>Тип запроса</th>
                            <th>Даты запроса</th>
                            <th>Примечание</th>
                            <th>Примечание руководителем</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingSchedPageRows.length === 0 ? (
                            <EmptyRow cols={7} withIcon text="Нет данных" />
                          ) : (
                            pendingSchedPageRows.map((r) => {
                              const p = scheduleReqPayload(r);
                              const range =
                                p.start || p.end
                                  ? `${fmtDate(p.start)} – ${fmtDate(p.end)}`
                                  : '—';
                              return (
                                <tr key={r.id}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={schedSelectedPending.includes(r.id)}
                                      onChange={(e) => {
                                        setSchedSelectedPending((prev) =>
                                          e.target.checked
                                            ? [...prev, r.id]
                                            : prev.filter((x) => x !== r.id),
                                        );
                                      }}
                                    />
                                  </td>
                                  <td>{fmtDate(r.createdAt)}</td>
                                  <td>Изменение графика</td>
                                  <td>{range}</td>
                                  <td>
                                    {p.note || r.title}
                                    {p.scheduleName ? (
                                      <div className={styles.muted}>{p.scheduleName}</div>
                                    ) : null}
                                  </td>
                                  <td>{r.reviewNote || '—'}</td>
                                  <td>
                                    <span
                                      className={`${styles.badge} ${styles.badgeWarn}`}
                                    >
                                      {scheduleReqStatusRu(r.status)}
                                    </span>
                                    <div
                                      style={{
                                        display: 'flex',
                                        gap: 6,
                                        marginTop: 6,
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className={styles.linkBtn}
                                        disabled={busy}
                                        onClick={() => {
                                          setSchedReviewId(r.id);
                                          setSchedReviewNote('');
                                        }}
                                      >
                                        Рассмотреть
                                      </button>
                                    </div>
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
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>
                        Подтвержденные и отклоненные запросы
                      </h3>
                    </div>
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск..."
                          value={schedQueryDecided}
                          onChange={(e) => {
                            setSchedQueryDecided(e.target.value);
                            setSchedPageDecided(1);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className={`${styles.absToolBtn} ${
                          schedFilterOpen ? styles.absToolBtnActive : ''
                        }`}
                        title="Фильтр"
                        onClick={() => setSchedFilterOpen((v) => !v)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M3 5h18l-7 8v5l-4 2v-7L3 5z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Скачать Excel"
                        onClick={() =>
                          void exportSchedExcel(
                            filteredDecidedSched,
                            'schedule-requests-decided.xlsx',
                          )
                        }
                      >
                        ⇩
                      </button>
                      <span className={styles.absPager}>
                        {filteredDecidedSched.length === 0
                          ? '0-0 / 0'
                          : `${(schedPageDecided - 1) * schedPageSize + 1}-${Math.min(
                              schedPageDecided * schedPageSize,
                              filteredDecidedSched.length,
                            )} / ${filteredDecidedSched.length}`}
                      </span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={schedPageDecided <= 1}
                        onClick={() => setSchedPageDecided((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      <span className={styles.absPageNum}>{schedPageDecided}</span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={schedPageDecided >= schedDecidedPageCount}
                        onClick={() =>
                          setSchedPageDecided((p) =>
                            Math.min(schedDecidedPageCount, p + 1),
                          )
                        }
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Меню"
                          onClick={() =>
                            setSchedMenuOpen((m) => (m === 'decided' ? null : 'decided'))
                          }
                        >
                          ≡
                        </button>
                        {schedMenuOpen === 'decided' ? (
                          <div className={styles.absMenu}>
                            <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                setSchedSortAsc((v) => !v);
                                setSchedMenuOpen(null);
                              }}
                            >
                              Дата запроса {schedSortAsc ? '↑' : '↓'}
                            </button>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                void exportSchedExcel(
                                  filteredDecidedSched,
                                  'schedule-requests-decided.xlsx',
                                );
                              }}
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
                                  decidedSchedPageRows.length > 0 &&
                                  decidedSchedPageRows.every((r) =>
                                    schedSelectedDecided.includes(r.id),
                                  )
                                }
                                onChange={(e) => {
                                  const ids = decidedSchedPageRows.map((r) => r.id);
                                  if (e.target.checked) {
                                    setSchedSelectedDecided((prev) => [
                                      ...new Set([...prev, ...ids]),
                                    ]);
                                  } else {
                                    setSchedSelectedDecided((prev) =>
                                      prev.filter((id) => !ids.includes(id)),
                                    );
                                  }
                                }}
                              />
                            </th>
                            <th>
                              <button
                                type="button"
                                className={styles.thSort}
                                onClick={() => setSchedSortAsc((v) => !v)}
                              >
                                Дата запроса {schedSortAsc ? '▴' : '▾'}
                              </button>
                            </th>
                            <th>Тип запроса</th>
                            <th>Даты запроса</th>
                            <th>Примечание</th>
                            <th>Примечание руководителем</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decidedSchedPageRows.length === 0 ? (
                            <EmptyRow cols={7} withIcon text="Нет данных" />
                          ) : (
                            decidedSchedPageRows.map((r) => {
                              const p = scheduleReqPayload(r);
                              const range =
                                p.start || p.end
                                  ? `${fmtDate(p.start)} – ${fmtDate(p.end)}`
                                  : '—';
                              const ok = r.status === 'approved';
                              return (
                                <tr key={r.id}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={schedSelectedDecided.includes(r.id)}
                                      onChange={(e) => {
                                        setSchedSelectedDecided((prev) =>
                                          e.target.checked
                                            ? [...prev, r.id]
                                            : prev.filter((x) => x !== r.id),
                                        );
                                      }}
                                    />
                                  </td>
                                  <td>{fmtDate(r.createdAt)}</td>
                                  <td>Изменение графика</td>
                                  <td>{range}</td>
                                  <td>
                                    {p.note || r.title}
                                    {p.scheduleName ? (
                                      <div className={styles.muted}>{p.scheduleName}</div>
                                    ) : null}
                                  </td>
                                  <td>{r.reviewNote || '—'}</td>
                                  <td>
                                    <span
                                      className={`${styles.badge} ${
                                        ok ? styles.badgeOk : styles.badgeWarn
                                      }`}
                                    >
                                      {scheduleReqStatusRu(r.status)}
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

                  {schedFilterOpen ? (
                    <aside className={styles.absFilterPanel} aria-label="Фильтр">
                      <div className={styles.absFilterHead}>
                        <h3 className={styles.absFilterTitle}>Фильтр</h3>
                        <div className={styles.absFilterHeadActions}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => setSchedFilterStatus([])}
                          >
                            Сбросить
                          </button>
                          <button
                            type="button"
                            className={styles.modalClose}
                            onClick={() => setSchedFilterOpen(false)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className={styles.absFilterBody}>
                        <div className={styles.absFilterCard}>
                          <div className={styles.absFilterCardTop}>
                            <span className={styles.absFilterCardLabel}>Состояние</span>
                          </div>
                          {(
                            [
                              ['pending', 'В ожидании'],
                              ['approved', 'Утверждено'],
                              ['rejected', 'Отклонено'],
                              ['cancelled', 'Отменено'],
                            ] as const
                          ).map(([k, label]) => (
                            <label key={k} className={styles.checkLabel}>
                              <input
                                type="checkbox"
                                checked={schedFilterStatus.includes(k)}
                                onChange={(e) => {
                                  setSchedFilterStatus((prev) =>
                                    e.target.checked
                                      ? [...prev, k]
                                      : prev.filter((x) => x !== k),
                                  );
                                  setSchedPagePending(1);
                                  setSchedPageDecided(1);
                                }}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className={styles.absFilterFoot}>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => setSchedFilterOpen(false)}
                        >
                          Применить
                        </button>
                      </div>
                    </aside>
                  ) : null}
                </>
              ) : null}
              {tab === 'identity' ? (
                <div className={styles.section}>
                  <div className={styles.locHead}>
                    <h3 className={styles.locTitle}>Идентификация</h3>
                    <button
                      type="button"
                      className={styles.btn}
                      disabled={busy}
                      onClick={() => void saveIdentification()}
                    >
                      Сохранить
                    </button>
                  </div>
                  <div className={styles.identLayout}>
                    <div className={styles.identFields}>
                      <div className={styles.modalRow2}>
                        <div className={styles.modalField}>
                          <label>ПИН</label>
                          <input
                            value={identForm.pin}
                            onChange={(e) =>
                              setIdentForm((f) => ({ ...f, pin: e.target.value }))
                            }
                          />
                        </div>
                        <div className={styles.modalField}>
                          <label>ПИН код</label>
                          <input
                            value={identForm.pinCode}
                            onChange={(e) =>
                              setIdentForm((f) => ({ ...f, pinCode: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                      <div className={styles.modalField}>
                        <label>Номер RFID карты</label>
                        <input
                          value={identForm.rfidNumber}
                          onChange={(e) =>
                            setIdentForm((f) => ({
                              ...f,
                              rfidNumber: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className={styles.modalField}>
                        <label>Отпечатки пальцев</label>
                        <button
                          type="button"
                          className={styles.fpFieldBtn}
                          onClick={openFingerprintModal}
                        >
                          <span>
                            Зарегистрировано {identForm.fingerprints.length} из 10
                          </span>
                          <span className={styles.fpEditIcon} aria-hidden>
                            ✎
                          </span>
                        </button>
                      </div>
                      <div className={styles.modalField}>
                        <label>Face ID (employeeNo)</label>
                        <div className={styles.identFaceIdRow}>
                          <input
                            value={externalIdDraft}
                            onChange={(e) => setExternalIdDraft(e.target.value)}
                            placeholder="face-0001"
                          />
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            disabled={busy}
                            onClick={saveExternalId}
                          >
                            Сохранить Face ID
                          </button>
                          <button
                            type="button"
                            className={styles.btn}
                            disabled={busy || !row.faceProfile?.photoUrl}
                            onClick={syncFace}
                          >
                            Sync
                          </button>
                        </div>
                        {faceMsg ? <p className={styles.muted}>{faceMsg}</p> : null}
                        {row.faceProfile?.lastError ? (
                          <p className={styles.error}>{row.faceProfile.lastError}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.identPhotoCol}>
                      <h4 className={styles.identPhotoTitle}>Фото для распознавания</h4>
                      <div
                        className={`${styles.fileDropPanel} ${fpDrag ? styles.fileDropPanelActive : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setFpDrag(true);
                        }}
                        onDragLeave={() => setFpDrag(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setFpDrag(false);
                          void onFaceFile(e.dataTransfer.files?.[0] ?? null);
                        }}
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          id="ident-face-input"
                          disabled={busy}
                          onChange={(e) => {
                            void onFaceFile(e.target.files?.[0] ?? null);
                            e.target.value = '';
                          }}
                        />
                        <label
                          htmlFor="ident-face-input"
                          className={styles.fileDropPanelLabel}
                        >
                          <span>Перетащите файл сюда</span>
                          <span>или кликните для выбора файла</span>
                        </label>
                      </div>
                      {row.faceProfile?.photoUrl ? (
                        <div className={styles.identMainPhoto}>
                          <PhotoThumb
                            src={mediaSrc(row.faceProfile.photoUrl) || row.faceProfile.photoUrl}
                            alt="Основное фото"
                            lightbox={photos}
                            slides={[
                              {
                                src: row.faceProfile.photoUrl,
                                caption: `Основное фото — ${fullName(row)}`,
                              },
                            ]}
                          />
                          <div className={styles.identMainPhotoMeta}>
                            <span>Основное фото</span>
                            <button
                              type="button"
                              className={styles.identPhotoRemove}
                              onClick={() => void clearFacePhoto()}
                              aria-label="Удалить фото"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              {tab === 'payroll' ? (
                <div className={styles.payLayout}>
                  <div className={styles.payCard}>
                    <div className={styles.payHead}>
                      <div className={styles.payTitleRow}>
                        <h3 className={styles.locTitle}>Зарплата сотрудника</h3>
                        <span className={styles.payBadge}>Предварительный расчет</span>
                      </div>
                      <label className={styles.payMonth}>
                        <input
                          type="month"
                          value={payMonth}
                          onChange={(e) => setPayMonth(e.target.value)}
                        />
                        <span>{payMonthLabel}</span>
                      </label>
                    </div>
                    <div className={styles.paySummary}>
                      <div className={styles.paySumItem}>
                        <span>К выплате</span>
                        <strong>{fmtMoney(accruedPay)} сум</strong>
                      </div>
                      <div className={styles.paySumItem}>
                        <span>Выплачено</span>
                        <strong>{fmtMoney(paidPay)} сум</strong>
                      </div>
                      <div className={styles.paySumItem}>
                        <span>Осталось выплатить</span>
                        <strong>{fmtMoney(remainPay)} сум</strong>
                      </div>
                    </div>
                    <div className={styles.payBlockAccrued}>
                      <div className={styles.payBlockHead}>
                        Начислено
                        <strong>{fmtMoney(accruedPay)} сум</strong>
                      </div>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Название</th>
                            <th>Сумма</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(payroll?.accruals?.length ?? 0) > 0 ? (
                            payroll!.accruals.map((a) => (
                              <tr key={a.name}>
                                <td>{a.name}</td>
                                <td>{fmtMoney(a.amount)} сум</td>
                              </tr>
                            ))
                          ) : basePay > 0 ? (
                            <tr>
                              <td>Месячная</td>
                              <td>{fmtMoney(accruedPay)} сум</td>
                            </tr>
                          ) : (
                            <EmptyRow cols={2} withIcon />
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.payBlockDeduct}>
                      <div className={styles.payBlockHead}>
                        Удержано
                        <strong>
                          {fmtMoney(
                            (payroll?.deductions ?? []).reduce((s, d) => s + d.amount, 0),
                          )}{' '}
                          сум
                        </strong>
                      </div>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Название</th>
                            <th>Сумма</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(payroll?.deductions ?? [{ name: 'Штрафы за нарушение дисциплины', amount: 0 }]).map(
                            (d) => (
                              <tr key={d.name}>
                                <td>{d.name}</td>
                                <td>{fmtMoney(d.amount)} сум</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className={styles.payCard}>
                    <div className={styles.payHead}>
                      <h3 className={styles.locTitle}>
                        Динамика заработной платы за {payYear} г.
                      </h3>
                      <select
                        className={styles.payYearSelect}
                        value={String(payYear)}
                        onChange={(e) =>
                          setPayMonth(`${e.target.value}-${payMonth.slice(5)}`)
                        }
                      >
                        {[payYear - 1, payYear, payYear + 1].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.payChart}>
                      {chartMonths.map((c) => (
                        <div key={c.label} className={styles.payChartCol}>
                          <div className={styles.payChartBars}>
                            <div
                              className={styles.payChartBarToPay}
                              style={{ height: `${(c.toPay / maxChart) * 100}%` }}
                              title={`К выплате: ${fmtMoney(c.toPay)}`}
                            />
                            <div
                              className={styles.payChartBarPaid}
                              style={{ height: `${(c.paid / maxChart) * 100}%` }}
                              title={`Выплачено: ${fmtMoney(c.paid)}`}
                            />
                          </div>
                          <span>{c.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.payLegend}>
                      <span>
                        <i className={styles.payLegToPay} /> К выплате
                      </span>
                      <span>
                        <i className={styles.payLegPaid} /> Выплачено
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
              {tab === 'settings' ? (
                <UserSettingsPanel
                  employeeId={id}
                  initial={row.profileExtras?.userSettings}
                  onSaved={() => void load()}
                />
              ) : null}
              {tab === 'subordinates' ? (
                <div className={styles.section}>
                  <div className={styles.locHead}>
                    <h3 className={styles.locTitle}>Подчиненные</h3>
                  </div>
                  <div className={styles.absToolbar}>
                    <div className={styles.absSearchWrap}>
                      <span className={styles.absSearchIcon} aria-hidden>
                        ⌕
                      </span>
                      <input
                        className={styles.absSearch}
                        placeholder="Поиск..."
                        value={subQuery}
                        onChange={(e) => setSubQuery(e.target.value)}
                      />
                    </div>
                    <button type="button" className={styles.absToolBtn} title="Фильтр">
                      ▤
                    </button>
                    <button type="button" className={styles.absToolBtn} title="Excel">
                      ⇩
                    </button>
                    <span className={styles.absPager}>
                      {subRows.length === 0
                        ? '0 / 0'
                        : `1-${subRows.length} / ${subRows.length}`}
                    </span>
                    <button type="button" className={styles.absToolBtn}>
                      ‹
                    </button>
                    <button type="button" className={styles.absToolBtn}>
                      ›
                    </button>
                    <button
                      type="button"
                      className={styles.absToolBtn}
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
                          <th>
                            <button type="button" className={styles.thSort}>
                              ФИО ▾
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {subRows.length === 0 ? (
                          <EmptyRow cols={1} withIcon text="нет данных" />
                        ) : (
                          subRows.map((s) => (
                            <tr key={s.id}>
                              <td>
                                <Link href={`/employees/${s.id}`} className={styles.linkBtn}>
                                  {[s.lastName, s.firstName, s.middleName]
                                    .filter(Boolean)
                                    .join(' ')
                                    .toUpperCase()}
                                </Link>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {tab === 'efficiency' ? (
                <div className={styles.section}>
                  <div className={styles.locHead}>
                    <h3 className={styles.locTitle}>Эффективность сотрудника</h3>
                    <select
                      className={styles.payYearSelect}
                      value={effPeriod}
                      onChange={(e) => setEffPeriod(e.target.value)}
                    >
                      <option value="12">Последние 12 месяцев</option>
                      <option value="6">Последние 6 месяцев</option>
                      <option value="3">Последние 3 месяца</option>
                    </select>
                  </div>
                  {(() => {
                    const eff = row.efficiency;
                    const months = Number(effPeriod) || 12;
                    const rows = (eff?.rows ?? []).slice(0, months);
                    const avg =
                      rows.length === 0
                        ? 0
                        : Math.round(
                            (rows.reduce((s, r) => s + r.fact, 0) / rows.length) *
                              10,
                          ) / 10;
                    const needleAngle = -90 + (Math.min(100, Math.max(0, avg)) / 100) * 180;
                    const chart = [...rows].reverse();
                    const maxFact = Math.max(1, ...chart.map((r) => r.fact));
                    return (
                      <>
                        <div className={styles.effLayout}>
                          <div className={styles.effGaugeCard}>
                            <svg
                              className={styles.effSvg}
                              viewBox="0 0 320 190"
                              role="img"
                              aria-label={`Эффективность ${avg}`}
                            >
                              {(() => {
                                const cx = 160;
                                const cy = 155;
                                const r = 118;
                                const stroke = 26;
                                const colors = [
                                  '#f1416c',
                                  '#ffc700',
                                  '#f1bc00',
                                  '#50cd89',
                                  '#47be7d',
                                ];
                                const segs = 5;
                                const toXY = (deg: number, radius: number) => {
                                  const rad = ((180 - deg) * Math.PI) / 180;
                                  return {
                                    x: cx + Math.cos(rad) * radius,
                                    y: cy - Math.sin(rad) * radius,
                                  };
                                };
                                const arcPath = (a0: number, a1: number) => {
                                  const p0 = toXY(a0, r);
                                  const p1 = toXY(a1, r);
                                  const large = a1 - a0 > 180 ? 1 : 0;
                                  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
                                };
                                return (
                                  <>
                                    {colors.map((c, i) => {
                                      const a0 = (i / segs) * 180 + 1.2;
                                      const a1 = ((i + 1) / segs) * 180 - 1.2;
                                      return (
                                        <path
                                          key={c}
                                          d={arcPath(a0, a1)}
                                          fill="none"
                                          stroke={c}
                                          strokeWidth={stroke}
                                          strokeLinecap="butt"
                                        />
                                      );
                                    })}
                                    {Array.from({ length: 11 }, (_, i) => {
                                      const deg = (i / 10) * 180;
                                      const a = toXY(deg, r - stroke / 2 - 2);
                                      const b = toXY(deg, r + stroke / 2 + 2);
                                      const t = toXY(deg, r + stroke / 2 + 16);
                                      return (
                                        <g key={i}>
                                          <line
                                            x1={a.x}
                                            y1={a.y}
                                            x2={b.x}
                                            y2={b.y}
                                            stroke="#7e8299"
                                            strokeWidth="1.25"
                                          />
                                          <text
                                            x={t.x}
                                            y={t.y}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fontSize="11"
                                            fill="#7e8299"
                                          >
                                            {i * 10}
                                          </text>
                                        </g>
                                      );
                                    })}
                                    <g transform={`rotate(${needleAngle} ${cx} ${cy})`}>
                                      <line
                                        x1={cx}
                                        y1={cy}
                                        x2={cx}
                                        y2={cy - r + 18}
                                        stroke="#3f4254"
                                        strokeWidth="3.5"
                                        strokeLinecap="round"
                                      />
                                      <circle cx={cx} cy={cy} r="8" fill="#3f4254" />
                                      <circle cx={cx} cy={cy} r="4" fill="#fff" />
                                    </g>
                                    <text
                                      x={cx}
                                      y={cy - 36}
                                      textAnchor="middle"
                                      fontSize="32"
                                      fontWeight="700"
                                      fill="#181c32"
                                    >
                                      {avg.toFixed(1)}
                                    </text>
                                  </>
                                );
                              })()}
                            </svg>
                            <p className={styles.effGaugeLabel}>
                              Средняя эффективность за период
                            </p>
                          </div>
                          <div className={styles.effChartCard}>
                            {chart.length === 0 ? (
                              <div className={styles.effChartEmpty}>
                                <svg
                                  width="48"
                                  height="40"
                                  viewBox="0 0 48 40"
                                  fill="none"
                                  aria-hidden
                                >
                                  <rect x="4" y="22" width="8" height="14" rx="1" fill="#d1d5db" />
                                  <rect x="16" y="14" width="8" height="22" rx="1" fill="#c4cada" />
                                  <rect x="28" y="8" width="8" height="28" rx="1" fill="#d1d5db" />
                                  <rect x="40" y="18" width="8" height="18" rx="1" fill="#c4cada" />
                                </svg>
                                Нет данных для отображения
                              </div>
                            ) : (
                              <div className={styles.effBars}>
                                {chart.map((r) => (
                                  <div key={r.month} className={styles.effBarCol}>
                                    <div
                                      className={styles.effBar}
                                      style={{
                                        height: `${(r.fact / maxFact) * 100}%`,
                                      }}
                                      title={`${r.monthLabel}: ${r.fact}%`}
                                    />
                                    <span>{r.monthLabel.slice(0, 2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className={styles.effLegend}>
                              <span>
                                <i className={styles.effLegMain} /> Основная
                              </span>
                              <span>
                                <i className={styles.effLegExtra} /> Дополнительная
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>Месяц</th>
                                <th>Тип</th>
                                <th>Должность</th>
                                <th>Подразделение</th>
                                <th>Факт (%)</th>
                                <th>Сумма</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.length === 0 ? (
                                <EmptyRow cols={6} withIcon />
                              ) : (
                                rows.map((r) => (
                                  <tr key={r.month}>
                                    <td>{r.monthLabel}</td>
                                    <td>{r.type}</td>
                                    <td>{r.positionName}</td>
                                    <td>{r.divisionName}</td>
                                    <td>{r.fact.toFixed(1)}</td>
                                    <td>{r.amount == null ? '—' : fmtMoney(r.amount)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {tab === 'education' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Образование</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        onClick={() => setEduOpen(true)}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Вид образования</th>
                            <th>Учебное заведение</th>
                            <th>Специальность</th>
                            <th>Начало обучения</th>
                            <th>Конец обучения</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.education?.length ?? 0) === 0 ? (
                            <EmptyRow cols={6} withIcon text="нет данных" />
                          ) : (
                            row.education!.map((e) => (
                              <tr key={e.id}>
                                <td>{e.educationType}</td>
                                <td>{e.institution}</td>
                                <td>{e.specialty}</td>
                                <td>{fmtDate(e.startDate)}</td>
                                <td>{fmtDate(e.endDate)}</td>
                                <td>—</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Языки</h3>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setLangOpen(true)}
                      >
                        Добавить
                      </button>
                    </div>
                    {(row.languages?.length ?? 0) === 0 ? (
                      <div className={styles.statsBox}>Данные не найдены</div>
                    ) : (
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Язык</th>
                              <th>Уровень</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.languages!.map((l) => (
                              <tr key={l.id}>
                                <td>{l.name}</td>
                                <td>{l.level}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              {tab === 'accounts' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Расчетные счета</h3>
                      <button type="button" className={styles.btnAdd} onClick={() => void openAccModal()}>
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Банк</th>
                            <th>Название</th>
                            <th>Расчетный счет</th>
                            <th>Номер карты</th>
                            <th>МФО</th>
                            <th>Основной</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.bankAccounts?.length ?? 0) === 0 ? (
                            <EmptyRow cols={7} withIcon text="нет данных" />
                          ) : (
                            row.bankAccounts!.map((a) => (
                              <tr key={a.id}>
                                <td>{a.bankName || '—'}</td>
                                <td>{a.name || '—'}</td>
                                <td>{a.accountNumber}</td>
                                <td>{a.cardNumber || '—'}</td>
                                <td>{a.mfo || '—'}</td>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={!!a.isPrimary}
                                    readOnly={a.isPrimary}
                                    onChange={() => {
                                      if (!a.isPrimary) void setPrimaryAccount(a.id);
                                    }}
                                  />
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={busy}
                                    onClick={() => void deleteBankAccount(a.id)}
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
                  </div>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Банковские карты</h3>
                      <button type="button" className={styles.btnAdd} onClick={() => void openCardModal()}>
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Номер карты</th>
                            <th>Расчетный счет</th>
                            <th>Код банка</th>
                            <th>Срок действия</th>
                            <th>Состояние</th>
                            <th>Статус</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.bankCards?.length ?? 0) === 0 ? (
                            <EmptyRow cols={7} withIcon text="нет данных" />
                          ) : (
                            row.bankCards!.map((c) => (
                              <tr key={c.id}>
                                <td>{c.cardNumber}</td>
                                <td>{c.accountNumber || '—'}</td>
                                <td>{c.bankCode || '—'}</td>
                                <td>{c.expiresAt ? fmtDate(c.expiresAt) : '—'}</td>
                                <td>{c.state === 'active' ? 'Активна' : c.state === 'blocked' ? 'Заблокирована' : c.state}</td>
                                <td>{c.status === 'active' ? 'Активный' : 'Неактивный'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={busy}
                                    onClick={() => void deleteBankCard(c.id)}
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
                  </div>
                </>
              ) : null}

              {tab === 'certificates' ? (
                <div className={styles.section}>
                  <div className={styles.locHead}>
                    <h3 className={styles.locTitle}>Справки</h3>
                    <button
                      type="button"
                      className={styles.btnAdd}
                      onClick={() => void openCertModal()}
                    >
                      Добавить
                    </button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Вид справки</th>
                          <th>Действует по</th>
                          <th>Название</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(row.certificates ?? []).length === 0 ? (
                          <EmptyRow cols={4} withIcon text="нет данных" />
                        ) : (
                          row.certificates!.map((c) => (
                            <tr key={c.id}>
                              <td>
                                <button
                                  type="button"
                                  className={styles.tableLink}
                                  onClick={() => void openCertModal(c)}
                                >
                                  {certTypeLabel(c.certType)}
                                </button>
                              </td>
                              <td>{fmtDate(c.validUntil)}</td>
                              <td>{c.title}</td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  disabled={busy}
                                  onClick={() => void deleteCertificate(c.id)}
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
                </div>
              ) : null}

              {tab === 'career' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Стаж</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        onClick={() => void openTenureModal()}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Вид стажа</th>
                            <th>Все еще работает</th>
                            <th>Начисляется с</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.tenures ?? []).length === 0 ? (
                            <EmptyRow cols={4} withIcon text="нет данных" />
                          ) : (
                            row.tenures!.map((t) => (
                              <tr key={t.id}>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.tableLink}
                                    onClick={() => void openTenureModal(t)}
                                  >
                                    {tenureTypeLabel(t.tenureType)}
                                  </button>
                                </td>
                                <td>{t.stillWorking ? 'Да' : 'Нет'}</td>
                                <td>{fmtDate(t.countedFrom)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={busy}
                                    onClick={() => void deleteTenure(t.id)}
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
                  </div>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Места работы</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        onClick={() => void openWorkModal()}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>С</th>
                            <th>По</th>
                            <th>Организация</th>
                            <th>Должность</th>
                            <th>Адрес организации</th>
                            <th>Описание</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.workplaces ?? []).length === 0 ? (
                            <EmptyRow cols={7} withIcon text="нет данных" />
                          ) : (
                            row.workplaces!.map((w) => (
                              <tr key={w.id}>
                                <td>{fmtDate(w.startDate)}</td>
                                <td>{fmtDate(w.endDate)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.tableLink}
                                    onClick={() => void openWorkModal(w)}
                                  >
                                    {w.organization}
                                  </button>
                                </td>
                                <td>{w.position}</td>
                                <td>{w.orgAddress || '—'}</td>
                                <td>{w.description || '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={busy}
                                    onClick={() => void deleteWorkplace(w.id)}
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
                  </div>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Награды</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        onClick={() => void openAwardModal()}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Награда</th>
                            <th>Название документа</th>
                            <th>Номер</th>
                            <th>Дата</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.awards ?? []).length === 0 ? (
                            <EmptyRow cols={5} withIcon text="нет данных" />
                          ) : (
                            row.awards!.map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.tableLink}
                                    onClick={() => void openAwardModal(a)}
                                  >
                                    {awardTypeLabel(a.awardType)}
                                  </button>
                                </td>
                                <td>{a.docTitle || '—'}</td>
                                <td>{a.docNumber || '—'}</td>
                                <td>{fmtDate(a.awardDate)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={busy}
                                    onClick={() => void deleteAward(a.id)}
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
                  </div>
                </>
              ) : null}

              {tab === 'files' ? (
                <div className={styles.section}>
                  <div className={styles.locHead}>
                    <h3 className={styles.locTitle}>Файлы</h3>
                    <button
                      type="button"
                      className={styles.btnAdd}
                      onClick={() => void openEmpFileModal()}
                    >
                      Добавить
                    </button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Название</th>
                          <th>Примечание</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(row.employeeFiles ?? []).length === 0 ? (
                          <EmptyRow cols={3} withIcon text="нет данных" />
                        ) : (
                          row.employeeFiles!.map((f) => (
                            <tr key={f.id}>
                              <td>
                                {f.fileUrl ? (
                                  <a
                                    href={f.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.tableLink}
                                  >
                                    {f.name}
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    className={styles.tableLink}
                                    onClick={() => void openEmpFileModal(f)}
                                  >
                                    {f.name}
                                  </button>
                                )}
                              </td>
                              <td>{f.note || '—'}</td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  onClick={() => void openEmpFileModal(f)}
                                >
                                  Изменить
                                </button>
                                {' · '}
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  disabled={busy}
                                  onClick={() => void deleteEmployeeFile(f.id)}
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
                </div>
              ) : null}

              {tab === 'inventory' ? (
                <div className={styles.section}>
                  <div className={styles.invToolbar}>
                    <button
                      type="button"
                      className={styles.btnCreate}
                      onClick={() => void openInvModal()}
                    >
                      Создать
                    </button>
                    <div className={styles.invToolbarRight}>
                      <input
                        className={styles.invSearch}
                        value={invSearch}
                        placeholder="Поиск..."
                        onChange={(e) => setInvSearch(e.target.value)}
                      />
                      <button
                        type="button"
                        className={`${styles.invIconBtn} ${
                          invFilterApplied.userName ||
                          invFilterApplied.responsibleName ||
                          invFilterApplied.purchaseFrom ||
                          invFilterApplied.purchaseTo ||
                          invFilterApplied.statusReceived
                            ? styles.invIconBtnActive
                            : ''
                        }`}
                        title="Фильтр"
                        onClick={() => {
                          setInvFilterDraft({ ...invFilterApplied });
                          setInvFilterOpen(true);
                        }}
                      >
                        ⏷
                      </button>
                      <span className={styles.invPager}>
                        {filteredInventory.length}/{row.inventoryItems?.length ?? 0}
                      </span>
                      <button
                        type="button"
                        className={styles.invIconBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                    </div>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Тип инвентаря</th>
                          <th>Номер инвентаря</th>
                          <th>Пользователь</th>
                          <th>Ответственное лицо</th>
                          <th>Модель</th>
                          <th>Производитель</th>
                          <th>Дата покупки</th>
                          <th>Местоположение</th>
                          <th>Статус</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInventory.length === 0 ? (
                          <EmptyRow cols={10} withIcon text="нет данных" />
                        ) : (
                          filteredInventory.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <button
                                  type="button"
                                  className={styles.tableLink}
                                  onClick={() => void openInvModal(item)}
                                >
                                  {invTypeLabel(item.inventoryType)}
                                </button>
                              </td>
                              <td>{item.inventoryNumber || '—'}</td>
                              <td>{item.userName || '—'}</td>
                              <td>{item.responsibleName || '—'}</td>
                              <td>{item.model || '—'}</td>
                              <td>{item.manufacturer || '—'}</td>
                              <td>{fmtDate(item.purchaseDate)}</td>
                              <td>{item.locationName || '—'}</td>
                              <td>{item.status || '—'}</td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  disabled={busy}
                                  onClick={() => void deleteInventory(item.id)}
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
                </div>
              ) : null}

              {tab === 'car' ? (
                <div className={styles.section}>
                  <div className={styles.locHead}>
                    <h3 className={styles.locTitle}>Список машин</h3>
                    <button
                      type="button"
                      className={styles.btnAdd}
                      onClick={() => openCarModal()}
                    >
                      Добавить
                    </button>
                  </div>
                  <div className={styles.carSearchRow}>
                    <input
                      className={styles.invSearch}
                      value={carSearch}
                      placeholder="Поиск"
                      onChange={(e) => setCarSearch(e.target.value)}
                    />
                    <span className={styles.invPager}>
                      {filteredCars.length}/{row.cars?.length ?? 0}
                    </span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Название</th>
                          <th>Номер автомобиля</th>
                          <th>Код</th>
                          <th>Статус</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCars.length === 0 ? (
                          <EmptyRow cols={5} withIcon text="нет данных" />
                        ) : (
                          filteredCars.map((c) => (
                            <tr key={c.id}>
                              <td>
                                <button
                                  type="button"
                                  className={styles.tableLink}
                                  onClick={() => openCarModal(c)}
                                >
                                  {c.name}
                                </button>
                              </td>
                              <td>{c.plateNumber}</td>
                              <td>{c.code || '—'}</td>
                              <td>
                                <span
                                  className={
                                    c.isActive ? styles.badgeOk : styles.badgeMuted
                                  }
                                >
                                  {c.isActive ? 'Активный' : 'Неактивный'}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  disabled={busy}
                                  onClick={() => void deleteCar(c.id)}
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
                </div>
              ) : null}

              {tab === 'extra' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Дополнительная информация</h3>
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={busy}
                        onClick={() => void saveExtraInfo()}
                      >
                        Сохранить
                      </button>
                    </div>
                    <div className={styles.extraGrid}>
                      <div className={styles.extraCol}>
                        <div className={styles.modalField}>
                          <label>Альтернативное имя</label>
                          <input
                            value={extraForm.altFirstName}
                            onChange={(e) =>
                              setExtraForm((f) => ({
                                ...f,
                                altFirstName: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className={styles.modalField}>
                          <label>Альтернативная фамилия</label>
                          <input
                            value={extraForm.altLastName}
                            onChange={(e) =>
                              setExtraForm((f) => ({
                                ...f,
                                altLastName: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className={styles.modalField}>
                          <label>Альтернативное отчество</label>
                          <input
                            value={extraForm.altMiddleName}
                            onChange={(e) =>
                              setExtraForm((f) => ({
                                ...f,
                                altMiddleName: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className={styles.extraCol}>
                        <div className={styles.docTypeCombo} ref={citizenshipComboRef}>
                          <div className={styles.modalField}>
                            <label>Гражданство</label>
                            <input
                              value={citizenshipQuery}
                              placeholder="Поиск..."
                              onChange={(e) => {
                                setCitizenshipQuery(e.target.value);
                                setCitizenshipListOpen(true);
                              }}
                              onFocus={() => setCitizenshipListOpen(true)}
                            />
                          </div>
                          {citizenshipListOpen && filteredCitizenship.length ? (
                            <ul className={styles.docTypeList}>
                              {filteredCitizenship.map((t) => (
                                <li key={t.code}>
                                  <button
                                    type="button"
                                    className={styles.docTypeOption}
                                    onClick={() => {
                                      setCitizenshipQuery(t.name);
                                      setExtraForm((f) => ({
                                        ...f,
                                        citizenship: t.name,
                                      }));
                                      setCitizenshipListOpen(false);
                                    }}
                                  >
                                    {t.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className={styles.modalField}>
                          <label>Код</label>
                          <input
                            value={extraForm.extraCode}
                            onChange={(e) =>
                              setExtraForm((f) => ({
                                ...f,
                                extraCode: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className={styles.toggleRow}>
                          <button
                            type="button"
                            className={`${styles.toggle} ${
                              extraForm.notKeyEmployee ? styles.toggleOn : ''
                            }`}
                            aria-pressed={extraForm.notKeyEmployee}
                            onClick={() =>
                              setExtraForm((f) => ({
                                ...f,
                                notKeyEmployee: !f.notKeyEmployee,
                              }))
                            }
                          />
                          <span>Не ключевой сотрудник</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.section}>
                    <h3 className={styles.locTitle}>Пользовательские поля</h3>
                    <p className={styles.familyEmpty}>Нет пользовательских полей</p>
                  </div>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Периоды блокировки отметок</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        onClick={() => openBlockModal()}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.blockToolbar}>
                      <input
                        className={styles.invSearch}
                        value={blockSearch}
                        placeholder="Поиск..."
                        onChange={(e) => setBlockSearch(e.target.value)}
                      />
                      <button
                        type="button"
                        className={`${styles.invIconBtn} ${
                          blockFilterApplied.from ||
                          blockFilterApplied.to ||
                          blockFilterApplied.note
                            ? styles.invIconBtnActive
                            : ''
                        }`}
                        title="Фильтр"
                        onClick={() => {
                          setBlockFilterDraft({ ...blockFilterApplied });
                          setBlockFilterOpen(true);
                        }}
                      >
                        ▽
                      </button>
                      <span className={styles.invPager}>
                        {filteredMarkBlocks.length}/{row.markBlocks?.length ?? 0}
                      </span>
                      <button
                        type="button"
                        className={styles.invIconBtn}
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
                            <th>Дата начала</th>
                            <th>Дата окончания</th>
                            <th>Примечание</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMarkBlocks.length === 0 ? (
                            <EmptyRow cols={4} withIcon text="нет данных" />
                          ) : (
                            filteredMarkBlocks.map((b) => (
                              <tr key={b.id}>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.tableLink}
                                    onClick={() => openBlockModal(b)}
                                  >
                                    {fmtDate(b.startDate)}
                                  </button>
                                </td>
                                <td>{fmtDate(b.endDate)}</td>
                                <td>{b.note || '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={busy}
                                    onClick={() => void deleteMarkBlock(b.id)}
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
                  </div>
                </>
              ) : null}
              {tab === 'documents' ? (
                <>
                  <div className={styles.docsHead}>
                    <div className={styles.docsTitleRow}>
                      <h3 className={styles.docsTitle}>Документы</h3>
                      <span className={styles.docsBadge}>Не требуемый</span>
                    </div>
                    <button
                      type="button"
                      className={styles.btnAdd}
                      onClick={() => void openDocModal()}
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
                        {(() => {
                          const docs = row.personDocuments || [];
                          const hasPassportDoc = docs.some(
                            (d) =>
                              /^PASSPORT$/i.test(d.docType) ||
                              /паспорт/i.test(d.docType),
                          );
                          const showDefaultPassport =
                            !!row.person?.passport && !hasPassportDoc;
                          if (!showDefaultPassport && docs.length === 0) {
                            return <EmptyRow cols={9} withIcon text="нет данных" />;
                          }
                          return (
                            <>
                              {showDefaultPassport ? (
                                <tr>
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.tableLink}
                                      onClick={() => void openDocModal('passport')}
                                    >
                                      Паспорт (по умолчанию)
                                    </button>
                                  </td>
                                  <td>
                                    {parsePassport(row.person?.passport).series || '—'}
                                  </td>
                                  <td>
                                    {parsePassport(row.person?.passport).number || '—'}
                                  </td>
                                  <td>—</td>
                                  <td>—</td>
                                  <td>—</td>
                                  <td>—</td>
                                  <td>
                                    <span
                                      className={`${styles.badge} ${styles.badgeNew}`}
                                    >
                                      Новый
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.viewBtn}
                                      onClick={() => void openDocModal('passport')}
                                    >
                                      Открыть
                                    </button>
                                  </td>
                                </tr>
                              ) : null}
                              {docs.map((d) => (
                                <tr key={d.id}>
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.tableLink}
                                      onClick={() => void openDocModal(d)}
                                    >
                                      {docTypeLabel(d.docType)}
                                    </button>
                                  </td>
                                  <td>{d.series || '—'}</td>
                                  <td>{d.docNumber}</td>
                                  <td>{d.issuer || '—'}</td>
                                  <td>
                                    {d.startsAt ? fmtDate(String(d.startsAt)) : '—'}
                                  </td>
                                  <td>
                                    {d.expiresAt
                                      ? fmtDate(String(d.expiresAt))
                                      : '—'}
                                  </td>
                                  <td>{d.note || '—'}</td>
                                  <td>
                                    <span
                                      className={`${styles.badge} ${
                                        d.isValid
                                          ? styles.badgeNew
                                          : styles.badgeMuted
                                      }`}
                                    >
                                      {d.isValid ? 'Новый' : 'Недействителен'}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.linkBtn}
                                      disabled={busy}
                                      onClick={() => void deletePersonDocument(d.id)}
                                    >
                                      Удалить
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      <FormModal
        open={docOpen}
        title={docEditId ? 'Документ (изменение)' : 'Документ (добавление)'}
        onClose={() => setDocOpen(false)}
        width="xl"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={busy || !docForm.docNumber.trim()}
              onClick={() => void savePersonDocument()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setDocOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.docTypeCombo} ref={docTypeComboRef}>
            <div className={styles.modalField}>
              <label>
                Тип документа <span className={styles.req}>*</span>
              </label>
              <input
                value={docTypeQuery}
                placeholder="Поиск..."
                onChange={(e) => {
                  setDocTypeQuery(e.target.value);
                  setDocTypeListOpen(true);
                  const hit = docTypeOpts.find(
                    (t) => t.name.toLowerCase() === e.target.value.trim().toLowerCase(),
                  );
                  if (hit) setDocForm((f) => ({ ...f, docType: hit.code }));
                }}
                onFocus={() => setDocTypeListOpen(true)}
              />
            </div>
            {docTypeListOpen && filteredDocTypes.length ? (
              <ul className={styles.docTypeList}>
                {filteredDocTypes.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      className={styles.docTypeOption}
                      onClick={() => pickDocType(t.code, t.name)}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>Серия документа</label>
              <input
                value={docForm.series}
                onChange={(e) =>
                  setDocForm((f) => ({ ...f, series: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>Номер документа</label>
              <input
                value={docForm.docNumber}
                onChange={(e) =>
                  setDocForm((f) => ({ ...f, docNumber: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.modalField}>
            <label>Выдана</label>
            <input
              value={docForm.issuer}
              onChange={(e) =>
                setDocForm((f) => ({ ...f, issuer: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>Дата выдачи</label>
            <input
              type="date"
              value={docForm.issuedAt}
              onChange={(e) =>
                setDocForm((f) => ({ ...f, issuedAt: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>Дата начала действия</label>
              <input
                type="date"
                value={docForm.startsAt}
                onChange={(e) =>
                  setDocForm((f) => ({ ...f, startsAt: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>Дата истечения</label>
              <input
                type="date"
                value={docForm.expiresAt}
                onChange={(e) =>
                  setDocForm((f) => ({ ...f, expiresAt: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.modalField}>
            <label>Примечание</label>
            <textarea
              value={docForm.note}
              onChange={(e) =>
                setDocForm((f) => ({ ...f, note: e.target.value }))
              }
              rows={3}
            />
          </div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${
                docForm.isValid ? styles.toggleOn : ''
              }`}
              aria-pressed={docForm.isValid}
              onClick={() =>
                setDocForm((f) => ({ ...f, isValid: !f.isValid }))
              }
            />
            <span>Действительный</span>
          </div>
          <div className={styles.modalField}>
            <label>Файлы</label>
            <div className={styles.filesToolbar}>
              <label className={styles.uploadBtn}>
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    appendDocFileNames(e.target.files);
                    e.target.value = '';
                  }}
                />
                <span className={styles.uploadIcon} aria-hidden>
                  ↑
                </span>
                upload
              </label>
              <label className={styles.fileDrop}>
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    appendDocFileNames(e.target.files);
                    e.target.value = '';
                  }}
                />
                <span className={styles.fileDropPlus}>+</span>
                <span>Добавить</span>
              </label>
            </div>
            {docForm.fileNames.length ? (
              <ul className={styles.fileList}>
                {docForm.fileNames.map((n) => (
                  <li key={n}>
                    {n}{' '}
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() =>
                        setDocForm((f) => ({
                          ...f,
                          fileNames: f.fileNames.filter((x) => x !== n),
                        }))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </FormModal>
      <FormModal
        open={relOpen}
        title={relEditId ? 'Родственник (изменение)' : 'Родственник (добавление)'}
        onClose={() => setRelOpen(false)}
        width="xl"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={busy || !relForm.fullName.trim() || !kinshipQuery.trim()}
              onClick={() => void saveRelative()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setRelOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.modalField}>
            <label>
              ФИО <span className={styles.req}>*</span>
            </label>
            <input
              value={relForm.fullName}
              onChange={(e) =>
                setRelForm((f) => ({ ...f, fullName: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>Пол</label>
            <div className={styles.checkRow}>
              {(
                [
                  ['male', 'Мужской'],
                  ['female', 'Женский'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={styles.checkLabel}>
                  <input
                    type="radio"
                    name="relGender"
                    checked={relForm.gender === k}
                    onChange={() => setRelForm((f) => ({ ...f, gender: k }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className={styles.docTypeCombo} ref={kinshipComboRef}>
            <div className={styles.modalField}>
              <label>Степень родства</label>
              <input
                value={kinshipQuery}
                placeholder="Поиск..."
                onChange={(e) => {
                  setKinshipQuery(e.target.value);
                  setKinshipListOpen(true);
                  const hit = kinshipOpts.find(
                    (t) => t.name.toLowerCase() === e.target.value.trim().toLowerCase(),
                  );
                  if (hit) setRelForm((f) => ({ ...f, relation: hit.code }));
                }}
                onFocus={() => setKinshipListOpen(true)}
              />
            </div>
            {kinshipListOpen && filteredKinship.length ? (
              <ul className={styles.docTypeList}>
                {filteredKinship.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      className={styles.docTypeOption}
                      onClick={() => {
                        setKinshipQuery(t.name);
                        setRelForm((f) => ({ ...f, relation: t.code }));
                        setKinshipListOpen(false);
                      }}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.modalField}>
            <label>Номер телефона</label>
            <input
              value={relForm.phone}
              onChange={(e) => setRelForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className={styles.modalField}>
            <label>Дата рождения</label>
            <input
              type="date"
              value={relForm.birthDate}
              onChange={(e) =>
                setRelForm((f) => ({ ...f, birthDate: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>Рабочее место</label>
            <input
              value={relForm.workplace}
              onChange={(e) =>
                setRelForm((f) => ({ ...f, workplace: e.target.value }))
              }
            />
          </div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${
                relForm.dependent ? styles.toggleOn : ''
              }`}
              aria-pressed={relForm.dependent}
              onClick={() =>
                setRelForm((f) => ({ ...f, dependent: !f.dependent }))
              }
            />
            <span>На иждивении</span>
            <span className={styles.toggleHint}>
              {relForm.dependent ? 'Да' : 'Нет'}
            </span>
          </div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${
                relForm.isHidden ? styles.toggleOn : ''
              }`}
              aria-pressed={relForm.isHidden}
              onClick={() =>
                setRelForm((f) => ({ ...f, isHidden: !f.isHidden }))
              }
            />
            <span>Скрыть данные</span>
            <span className={styles.toggleHint}>
              {relForm.isHidden ? 'Да' : 'Нет'}
            </span>
          </div>
        </div>
      </FormModal>
      <FormModal
        open={maritalOpen}
        title="Состояние в браке"
        onClose={() => setMaritalOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={busy || !maritalQuery.trim()}
              onClick={() => void saveMaritalStatus()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setMaritalOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docTypeCombo} ref={maritalComboRef}>
          <div className={styles.modalField}>
            <label>Состояние в браке</label>
            <input
              value={maritalQuery}
              placeholder="Поиск..."
              onChange={(e) => {
                setMaritalQuery(e.target.value);
                setMaritalListOpen(true);
              }}
              onFocus={() => setMaritalListOpen(true)}
            />
          </div>
          {maritalListOpen && filteredMarital.length ? (
            <ul className={styles.docTypeList}>
              {filteredMarital.map((t) => (
                <li key={t.code}>
                  <button
                    type="button"
                    className={styles.docTypeOption}
                    onClick={() => {
                      setMaritalQuery(t.name);
                      setMaritalListOpen(false);
                    }}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </FormModal>
      <FormModal
        open={certOpen}
        title={certEditId ? 'Справка (изменение)' : 'Справка (добавление)'}
        onClose={() => setCertOpen(false)}
        width="xl"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={
                busy ||
                !certForm.certNumber.trim() ||
                !certForm.title.trim() ||
                !certTypeQuery.trim()
              }
              onClick={() => void saveCertificate()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setCertOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.docTypeCombo} ref={certTypeComboRef}>
            <div className={styles.modalField}>
              <label>
                Вид справки <span className={styles.req}>*</span>
              </label>
              <input
                value={certTypeQuery}
                placeholder="Поиск..."
                onChange={(e) => {
                  setCertTypeQuery(e.target.value);
                  setCertTypeListOpen(true);
                  const hit = certTypeOpts.find(
                    (t) => t.name.toLowerCase() === e.target.value.trim().toLowerCase(),
                  );
                  if (hit) setCertForm((f) => ({ ...f, certType: hit.code }));
                }}
                onFocus={() => setCertTypeListOpen(true)}
              />
            </div>
            {certTypeListOpen && filteredCertTypes.length ? (
              <ul className={styles.docTypeList}>
                {filteredCertTypes.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      className={styles.docTypeOption}
                      onClick={() => {
                        setCertTypeQuery(t.name);
                        setCertForm((f) => ({ ...f, certType: t.code }));
                        setCertTypeListOpen(false);
                      }}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>
                Номер справки <span className={styles.req}>*</span>
              </label>
              <input
                value={certForm.certNumber}
                onChange={(e) =>
                  setCertForm((f) => ({ ...f, certNumber: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>Дата справки</label>
              <input
                type="date"
                value={certForm.certDate}
                onChange={(e) =>
                  setCertForm((f) => ({ ...f, certDate: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>Действует с</label>
              <input
                type="date"
                value={certForm.validFrom}
                onChange={(e) =>
                  setCertForm((f) => ({ ...f, validFrom: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>Действует по</label>
              <input
                type="date"
                value={certForm.validUntil}
                onChange={(e) =>
                  setCertForm((f) => ({ ...f, validUntil: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.modalField}>
            <label>
              Название <span className={styles.req}>*</span>
            </label>
            <input
              value={certForm.title}
              onChange={(e) => setCertForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
        </div>
      </FormModal>
      <FormModal
        open={tenureOpen}
        title={tenureEditId ? 'Стаж (изменение)' : 'Стаж (добавление)'}
        onClose={() => setTenureOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={
                busy || !tenureTypeQuery.trim() || !tenureForm.countedFrom
              }
              onClick={() => void saveTenure()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setTenureOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.docTypeCombo} ref={tenureTypeComboRef}>
            <div className={styles.modalField}>
              <label>
                Вид стажа <span className={styles.req}>*</span>
              </label>
              <input
                value={tenureTypeQuery}
                placeholder="Поиск..."
                onChange={(e) => {
                  setTenureTypeQuery(e.target.value);
                  setTenureTypeListOpen(true);
                  const hit = tenureTypeOpts.find(
                    (t) => t.name.toLowerCase() === e.target.value.trim().toLowerCase(),
                  );
                  if (hit) setTenureForm((f) => ({ ...f, tenureType: hit.code }));
                }}
                onFocus={() => setTenureTypeListOpen(true)}
              />
            </div>
            {tenureTypeListOpen && filteredTenureTypes.length ? (
              <ul className={styles.docTypeList}>
                {filteredTenureTypes.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      className={styles.docTypeOption}
                      onClick={() => {
                        setTenureTypeQuery(t.name);
                        setTenureForm((f) => ({ ...f, tenureType: t.code }));
                        setTenureTypeListOpen(false);
                      }}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${
                tenureForm.stillWorking ? styles.toggleOn : ''
              }`}
              aria-pressed={tenureForm.stillWorking}
              onClick={() =>
                setTenureForm((f) => ({ ...f, stillWorking: !f.stillWorking }))
              }
            />
            <span>Всё еще работает</span>
            <span className={styles.toggleHint}>
              {tenureForm.stillWorking ? 'Да' : 'Нет'}
            </span>
          </div>
          <div className={styles.modalField}>
            <label>
              Исчисляется с <span className={styles.req}>*</span>
            </label>
            <input
              type="date"
              value={tenureForm.countedFrom}
              onChange={(e) =>
                setTenureForm((f) => ({ ...f, countedFrom: e.target.value }))
              }
            />
          </div>
        </div>
      </FormModal>
      <FormModal
        open={workOpen}
        title={workEditId ? 'Место работы (изменение)' : 'Место работы (добавление)'}
        onClose={() => setWorkOpen(false)}
        width="xl"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={
                busy || !workForm.organization.trim() || !workForm.position.trim()
              }
              onClick={() => void saveWorkplace()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setWorkOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.modalField}>
            <label>
              Организация <span className={styles.req}>*</span>
            </label>
            <input
              value={workForm.organization}
              onChange={(e) =>
                setWorkForm((f) => ({ ...f, organization: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>
              Должность <span className={styles.req}>*</span>
            </label>
            <input
              value={workForm.position}
              onChange={(e) =>
                setWorkForm((f) => ({ ...f, position: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>Адрес организации</label>
            <textarea
              rows={3}
              value={workForm.orgAddress}
              onChange={(e) =>
                setWorkForm((f) => ({ ...f, orgAddress: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>С</label>
              <input
                type="date"
                value={workForm.startDate}
                onChange={(e) =>
                  setWorkForm((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>По</label>
              <input
                type="date"
                value={workForm.endDate}
                onChange={(e) =>
                  setWorkForm((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.modalField}>
            <label>Описание</label>
            <textarea
              rows={3}
              value={workForm.description}
              onChange={(e) =>
                setWorkForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
        </div>
      </FormModal>
      <FormModal
        open={awardOpen}
        title={awardEditId ? 'Награда (изменение)' : 'Награда (добавление)'}
        onClose={() => setAwardOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={busy || !awardTypeQuery.trim()}
              onClick={() => void saveAward()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setAwardOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.docTypeCombo} ref={awardTypeComboRef}>
            <div className={styles.modalField}>
              <label>
                Награда <span className={styles.req}>*</span>
              </label>
              <input
                value={awardTypeQuery}
                placeholder="Поиск..."
                onChange={(e) => {
                  setAwardTypeQuery(e.target.value);
                  setAwardTypeListOpen(true);
                  const hit = awardTypeOpts.find(
                    (t) => t.name.toLowerCase() === e.target.value.trim().toLowerCase(),
                  );
                  if (hit) setAwardForm((f) => ({ ...f, awardType: hit.code }));
                }}
                onFocus={() => setAwardTypeListOpen(true)}
              />
            </div>
            {awardTypeListOpen && filteredAwardTypes.length ? (
              <ul className={styles.docTypeList}>
                {filteredAwardTypes.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      className={styles.docTypeOption}
                      onClick={() => {
                        setAwardTypeQuery(t.name);
                        setAwardForm((f) => ({ ...f, awardType: t.code }));
                        setAwardTypeListOpen(false);
                      }}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.modalField}>
            <label>Название документа</label>
            <input
              value={awardForm.docTitle}
              onChange={(e) =>
                setAwardForm((f) => ({ ...f, docTitle: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>Номер</label>
              <input
                value={awardForm.docNumber}
                onChange={(e) =>
                  setAwardForm((f) => ({ ...f, docNumber: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>Дата</label>
              <input
                type="date"
                value={awardForm.awardDate}
                onChange={(e) =>
                  setAwardForm((f) => ({ ...f, awardDate: e.target.value }))
                }
              />
            </div>
          </div>
        </div>
      </FormModal>
      <FormModal
        open={empFileOpen}
        title={empFileEditId ? 'Файл (изменение)' : 'Файл (добавление)'}
        onClose={() => setEmpFileOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={
                busy ||
                !empFileForm.name.trim() ||
                (!empFileEditId && !empFileForm.file)
              }
              onClick={() => void saveEmployeeFile()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setEmpFileOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.modalField}>
            <label>
              Название <span className={styles.req}>*</span>
            </label>
            <input
              value={empFileForm.name}
              onChange={(e) =>
                setEmpFileForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>Примечание</label>
            <textarea
              rows={3}
              value={empFileForm.note}
              onChange={(e) =>
                setEmpFileForm((f) => ({ ...f, note: e.target.value }))
              }
            />
          </div>
          {!empFileEditId ? (
            <div
              className={`${styles.fileDropPanel} ${empFileDrag ? styles.fileDropPanelActive : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setEmpFileDrag(true);
              }}
              onDragLeave={() => setEmpFileDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setEmpFileDrag(false);
                pickEmpFile(e.dataTransfer.files?.[0] || null);
              }}
            >
              <input
                type="file"
                hidden
                id="emp-file-input"
                onChange={(e) => {
                  pickEmpFile(e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
              <label htmlFor="emp-file-input" className={styles.fileDropPanelLabel}>
                {empFileForm.file ? (
                  <>
                    <strong>{empFileForm.file.name}</strong>
                    <span>Кликните, чтобы выбрать другой файл</span>
                  </>
                ) : (
                  <>
                    <span>Перетащите файл сюда</span>
                    <span>или кликните для выбора файла</span>
                  </>
                )}
              </label>
            </div>
          ) : null}
        </div>
      </FormModal>
      <FormModal
        open={invOpen}
        title={invEditId ? 'Инвентарь (изменение)' : 'Инвентарь (создание)'}
        onClose={() => setInvOpen(false)}
        width="xl"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={busy || !invTypeQuery.trim() || !invForm.status.trim()}
              onClick={() => void saveInventory()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setInvOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.docTypeCombo} ref={invTypeComboRef}>
            <div className={styles.modalField}>
              <label>
                Тип инвентаря <span className={styles.req}>*</span>
              </label>
              <input
                value={invTypeQuery}
                placeholder="Поиск..."
                onChange={(e) => {
                  setInvTypeQuery(e.target.value);
                  setInvTypeListOpen(true);
                  const hit = invTypeOpts.find(
                    (t) => t.name.toLowerCase() === e.target.value.trim().toLowerCase(),
                  );
                  if (hit) setInvForm((f) => ({ ...f, inventoryType: hit.code }));
                }}
                onFocus={() => setInvTypeListOpen(true)}
              />
            </div>
            {invTypeListOpen && filteredInvTypes.length ? (
              <ul className={styles.docTypeList}>
                {filteredInvTypes.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      className={styles.docTypeOption}
                      onClick={() => {
                        setInvTypeQuery(t.name);
                        setInvForm((f) => ({ ...f, inventoryType: t.code }));
                        setInvTypeListOpen(false);
                      }}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.modalField}>
            <label>Модель</label>
            <input
              value={invForm.model}
              onChange={(e) => setInvForm((f) => ({ ...f, model: e.target.value }))}
            />
          </div>
          <div className={styles.modalField}>
            <label>Производитель</label>
            <input
              value={invForm.manufacturer}
              onChange={(e) =>
                setInvForm((f) => ({ ...f, manufacturer: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>Время операции</label>
              <input
                type="datetime-local"
                value={invForm.operationAt}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, operationAt: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>Дата покупки</label>
              <input
                type="date"
                value={invForm.purchaseDate}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, purchaseDate: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.modalField}>
            <label>Местоположение</label>
            <input
              value={invForm.locationName}
              placeholder="Поиск..."
              list="inv-loc-list"
              onChange={(e) =>
                setInvForm((f) => ({ ...f, locationName: e.target.value }))
              }
            />
            <datalist id="inv-loc-list">
              {(row?.attachedLocations || []).map((l) => (
                <option key={l.id} value={l.name} />
              ))}
            </datalist>
          </div>
          <div className={styles.modalField}>
            <label>Пользователь</label>
            <input
              value={invForm.userName}
              onChange={(e) =>
                setInvForm((f) => ({ ...f, userName: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>Ответственное лицо</label>
            <input
              value={invForm.responsibleName}
              placeholder="Поиск..."
              onChange={(e) =>
                setInvForm((f) => ({ ...f, responsibleName: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>
              Статус <span className={styles.req}>*</span>
            </label>
            <select
              value={invForm.status}
              onChange={(e) =>
                setInvForm((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="Получен">Получен</option>
              <option value="В использовании">В использовании</option>
              <option value="Списан">Списан</option>
              <option value="Возвращён">Возвращён</option>
            </select>
          </div>
          <div className={styles.modalField}>
            <label>Примечание</label>
            <textarea
              rows={4}
              value={invForm.note}
              onChange={(e) => setInvForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>
      </FormModal>
      <FormModal
        open={invFilterOpen}
        title="Фильтр"
        onClose={() => setInvFilterOpen(false)}
        width="lg"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              onClick={applyInvFilter}
            >
              Применить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={clearInvFilter}
            >
              Показать все
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setInvFilterOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.filterBody}>
          <div className={styles.filterRow}>
            <span className={styles.filterDrag}>↕</span>
            <span className={styles.filterLabel}>Пользователь</span>
            <span className={styles.filterOp}>=</span>
            <div className={styles.filterValue}>
              <input
                value={invFilterDraft.userName}
                placeholder="Поиск..."
                onChange={(e) =>
                  setInvFilterDraft((f) => ({ ...f, userName: e.target.value }))
                }
              />
            </div>
            <button
              type="button"
              className={styles.filterRemove}
              onClick={() => setInvFilterDraft((f) => ({ ...f, userName: '' }))}
            >
              ×
            </button>
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterDrag}>↕</span>
            <span className={styles.filterLabel}>Ответственное лицо</span>
            <span className={styles.filterOp}>=</span>
            <div className={styles.filterValue}>
              <input
                value={invFilterDraft.responsibleName}
                placeholder="Поиск..."
                onChange={(e) =>
                  setInvFilterDraft((f) => ({
                    ...f,
                    responsibleName: e.target.value,
                  }))
                }
              />
            </div>
            <button
              type="button"
              className={styles.filterRemove}
              onClick={() =>
                setInvFilterDraft((f) => ({ ...f, responsibleName: '' }))
              }
            >
              ×
            </button>
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterDrag}>↕</span>
            <span className={styles.filterLabel}>Дата покупки</span>
            <span className={styles.filterOp}>=</span>
            <div className={styles.filterValue}>
              <div className={styles.modalRow2}>
                <input
                  type="date"
                  value={invFilterDraft.purchaseFrom}
                  onChange={(e) =>
                    setInvFilterDraft((f) => ({
                      ...f,
                      purchaseFrom: e.target.value,
                    }))
                  }
                />
                <input
                  type="date"
                  value={invFilterDraft.purchaseTo}
                  onChange={(e) =>
                    setInvFilterDraft((f) => ({
                      ...f,
                      purchaseTo: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <button
              type="button"
              className={styles.filterRemove}
              onClick={() =>
                setInvFilterDraft((f) => ({
                  ...f,
                  purchaseFrom: '',
                  purchaseTo: '',
                }))
              }
            >
              ×
            </button>
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterDrag}>↕</span>
            <span className={styles.filterLabel}>Статус</span>
            <span className={styles.filterOp}>=</span>
            <div className={styles.filterValue}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={invFilterDraft.statusReceived}
                  onChange={(e) =>
                    setInvFilterDraft((f) => ({
                      ...f,
                      statusReceived: e.target.checked,
                    }))
                  }
                />
                Получен
              </label>
            </div>
            <button
              type="button"
              className={styles.filterRemove}
              onClick={() =>
                setInvFilterDraft((f) => ({ ...f, statusReceived: false }))
              }
            >
              ×
            </button>
          </div>
        </div>
      </FormModal>
      <FormModal
        open={carOpen}
        title={
          carEditId
            ? 'Изменение автомобиля сотрудника'
            : 'Добавление автомобиля сотрудника'
        }
        onClose={() => setCarOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={
                busy || !carForm.name.trim() || !carForm.plateNumber.trim()
              }
              onClick={() => void saveCar()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setCarOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.modalField}>
            <label>
              Название <span className={styles.req}>*</span>
            </label>
            <input
              value={carForm.name}
              onChange={(e) => setCarForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className={styles.modalField}>
            <label>
              Номер автомобиля <span className={styles.req}>*</span>
            </label>
            <input
              value={carForm.plateNumber}
              onChange={(e) =>
                setCarForm((f) => ({ ...f, plateNumber: e.target.value }))
              }
            />
          </div>
          <div className={styles.modalField}>
            <label>Код</label>
            <input
              value={carForm.code}
              onChange={(e) => setCarForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${carForm.isActive ? styles.toggleOn : ''}`}
              aria-pressed={carForm.isActive}
              onClick={() =>
                setCarForm((f) => ({ ...f, isActive: !f.isActive }))
              }
            />
            <span>Активный</span>
            <span className={styles.toggleHint}>
              {carForm.isActive ? 'Да' : 'Нет'}
            </span>
          </div>
        </div>
      </FormModal>
      <FormModal
        open={fpOpen}
        title="Регистрация отпечатков пальцев"
        onClose={() => setFpOpen(false)}
        width="xl"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={busy}
              onClick={() => void saveFingerprints()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setFpOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.fpModalLayout}>
          <div className={styles.fpHands}>
            <div className={styles.fpHandBlock}>
              <div className={styles.fpHandTitle}>Левая рука</div>
              <div className={styles.fpFingers}>
                {FINGER_LEFT.map((f) => (
                  <button
                    key={f.i}
                    type="button"
                    className={`${styles.fpFinger} ${
                      fpSelected === f.i ? styles.fpFingerActive : ''
                    } ${fpDraft.includes(f.i) ? styles.fpFingerDone : ''}`}
                    onClick={() => toggleFingerprint(f.i)}
                  >
                    <span className={styles.fpFingerIcon}>🔏</span>
                    <span className={styles.fpFingerIdx}>{f.i}</span>
                    <span className={styles.fpFingerLabel}>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.fpHandBlock}>
              <div className={styles.fpHandTitle}>Правая рука</div>
              <div className={styles.fpFingers}>
                {FINGER_RIGHT.map((f) => (
                  <button
                    key={f.i}
                    type="button"
                    className={`${styles.fpFinger} ${
                      fpSelected === f.i ? styles.fpFingerActive : ''
                    } ${fpDraft.includes(f.i) ? styles.fpFingerDone : ''}`}
                    onClick={() => toggleFingerprint(f.i)}
                  >
                    <span className={styles.fpFingerIcon}>🔏</span>
                    <span className={styles.fpFingerIdx}>{f.i}</span>
                    <span className={styles.fpFingerLabel}>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.fpScanCol}>
            <div className={styles.fpScanOval} />
            <div className={styles.fpSteps}>
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.fpStep} ${fpStep === s ? styles.fpStepActive : ''}`}
                  onClick={() => setFpStep(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className={styles.fpDriverError}>Установите драйвер устройства!</p>
            <a
              className={styles.fpDriverLink}
              href="/drivers/Fingerprint-Reader-Driver.exe"
              download
            >
              ↓ Скачать драйвер
            </a>
            <p className={styles.muted}>
              Выбрано пальцев: {fpDraft.length} / 10
              {fpSelected != null ? ` · палец №${fpSelected}` : ''}
            </p>
          </div>
        </div>
      </FormModal>
      <FormModal
        open={blockOpen}
        title={
          blockEditId
            ? 'Период блокировки (изменение)'
            : 'Период блокировки (добавление)'
        }
        onClose={() => setBlockOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              disabled={busy || !blockForm.startDate}
              onClick={() => void saveMarkBlock()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setBlockOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.docModalFields}>
          <div className={styles.modalRow2}>
            <div className={styles.modalField}>
              <label>
                Дата начала <span className={styles.req}>*</span>
              </label>
              <input
                type="date"
                value={blockForm.startDate}
                onChange={(e) =>
                  setBlockForm((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </div>
            <div className={styles.modalField}>
              <label>Дата окончания</label>
              <input
                type="date"
                value={blockForm.endDate}
                onChange={(e) =>
                  setBlockForm((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.modalField}>
            <label>Примечание</label>
            <textarea
              rows={3}
              value={blockForm.note}
              onChange={(e) =>
                setBlockForm((f) => ({ ...f, note: e.target.value }))
              }
            />
          </div>
        </div>
      </FormModal>
      <FormModal
        open={blockFilterOpen}
        title="Фильтр"
        onClose={() => setBlockFilterOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              onClick={() => {
                setBlockFilterApplied({ ...blockFilterDraft });
                setBlockFilterOpen(false);
              }}
            >
              Применить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => {
                const empty = { from: '', to: '', note: '' };
                setBlockFilterDraft(empty);
                setBlockFilterApplied(empty);
                setBlockFilterOpen(false);
              }}
            >
              Показать все
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setBlockFilterOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <div className={styles.filterBody}>
          <div className={styles.filterRow}>
            <span className={styles.filterDrag}>↕</span>
            <span className={styles.filterLabel}>Дата начала</span>
            <span className={styles.filterOp}>=</span>
            <div className={styles.filterValue}>
              <input
                type="date"
                value={blockFilterDraft.from}
                onChange={(e) =>
                  setBlockFilterDraft((f) => ({ ...f, from: e.target.value }))
                }
              />
            </div>
            <span />
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterDrag}>↕</span>
            <span className={styles.filterLabel}>Дата окончания</span>
            <span className={styles.filterOp}>=</span>
            <div className={styles.filterValue}>
              <input
                type="date"
                value={blockFilterDraft.to}
                onChange={(e) =>
                  setBlockFilterDraft((f) => ({ ...f, to: e.target.value }))
                }
              />
            </div>
            <span />
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterDrag}>↕</span>
            <span className={styles.filterLabel}>Примечание</span>
            <span className={styles.filterOp}>=</span>
            <div className={styles.filterValue}>
              <input
                value={blockFilterDraft.note}
                placeholder="Поиск..."
                onChange={(e) =>
                  setBlockFilterDraft((f) => ({ ...f, note: e.target.value }))
                }
              />
            </div>
            <span />
          </div>
        </div>
      </FormModal>
      <FormModal
        open={tabArrangeOpen}
        title="Первые 5 вкладок для отображения"
        onClose={() => setTabArrangeOpen(false)}
        width="md"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              onClick={() => setTabArrangeOpen(false)}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={resetPrimaryTabs}
            >
              По умолчанию
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setTabArrangeOpen(false)}
            >
              Закрыть
            </button>
          </>
        }
      >
        <ul className={styles.tabArrangeList}>
          {primaryTabOrder.map((key, idx) => {
            const item = PRIMARY_TABS.find((t) => t.key === key);
            if (!item) return null;
            return (
              <li key={key} className={styles.tabArrangeItem}>
                <span className={styles.tabArrangeIcon}>{item.icon}</span>
                <span className={styles.tabArrangeLabel}>{item.label}</span>
                {idx < 5 ? (
                  <span className={styles.tabArrangeBadge}>
                    {idx === 0 ? 'Первая отображаемая вкладка' : 'Отображаемая'}
                  </span>
                ) : null}
                <div className={styles.tabArrangeMoves}>
                  <button
                    type="button"
                    className={styles.invIconBtn}
                    disabled={idx === 0}
                    onClick={() => {
                      const next = [...primaryTabOrder];
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      persistPrimaryTabs(next);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.invIconBtn}
                    disabled={idx === primaryTabOrder.length - 1}
                    onClick={() => {
                      const next = [...primaryTabOrder];
                      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                      persistPrimaryTabs(next);
                    }}
                  >
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </FormModal>
      <FormModal
        open={resetTabsOpen}
        title="Сбросить"
        onClose={() => setResetTabsOpen(false)}
        width="sm"
        footer={
          <>
            <button
              type="button"
              className={fmStyles.btnPrimary}
              onClick={resetPrimaryTabs}
            >
              Да
            </button>
            <button
              type="button"
              className={fmStyles.btnGhost}
              onClick={() => setResetTabsOpen(false)}
            >
              Нет
            </button>
          </>
        }
      >
        <p className={styles.muted}>
          Сбросить порядок вкладок к значениям по умолчанию?
        </p>
      </FormModal>
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
      {eduOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setEduOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Добавить образование</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setEduOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label>Вид образования</label>
                <select
                  value={eduForm.educationType}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, educationType: e.target.value }))
                  }
                >
                  {['Высшее', 'Среднее специальное', 'Среднее', 'Курсы'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.modalField}>
                <label>Учебное заведение</label>
                <input
                  value={eduForm.institution}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, institution: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalField}>
                <label>Специальность</label>
                <input
                  value={eduForm.specialty}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, specialty: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Начало обучения</label>
                  <input
                    type="date"
                    value={eduForm.startDate}
                    onChange={(e) =>
                      setEduForm((f) => ({ ...f, startDate: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Конец обучения</label>
                  <input
                    type="date"
                    value={eduForm.endDate}
                    onChange={(e) =>
                      setEduForm((f) => ({ ...f, endDate: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy || !eduForm.institution.trim()}
                onClick={() => void saveEducation()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setEduOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {langOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setLangOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Добавить язык</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setLangOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label>Язык</label>
                <input
                  value={langForm.name}
                  onChange={(e) => setLangForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className={styles.modalField}>
                <label>Уровень</label>
                <select
                  value={langForm.level}
                  onChange={(e) => setLangForm((f) => ({ ...f, level: e.target.value }))}
                >
                  {['Начальный', 'Средний', 'Продвинутый', 'Родной'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy || !langForm.name.trim()}
                onClick={() => void saveLanguage()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setLangOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {accOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setAccOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Добавить расчетный счет</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setAccOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label>Банк</label>
                <select
                  value={accForm.bankName}
                  onChange={(e) => {
                    const bank = bankOpts.find((b) => b.name === e.target.value);
                    setAccForm((f) => ({
                      ...f,
                      bankName: e.target.value,
                      mfo: bank?.code || f.mfo,
                      name: f.name || e.target.value,
                    }));
                  }}
                >
                  <option value="">— выберите —</option>
                  {bankOpts.map((b) => (
                    <option key={b.code + b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.modalField}>
                <label>Название</label>
                <input
                  value={accForm.name}
                  onChange={(e) => setAccForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className={styles.modalField}>
                <label>Расчетный счет</label>
                <input
                  value={accForm.accountNumber}
                  onChange={(e) =>
                    setAccForm((f) => ({ ...f, accountNumber: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalField}>
                <label>Номер карты</label>
                <input
                  value={accForm.cardNumber}
                  onChange={(e) =>
                    setAccForm((f) => ({ ...f, cardNumber: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalField}>
                <label>МФО</label>
                <input
                  value={accForm.mfo}
                  onChange={(e) => setAccForm((f) => ({ ...f, mfo: e.target.value }))}
                />
              </div>
              <div className={styles.modalField}>
                <label>
                  <input
                    type="checkbox"
                    checked={accForm.isPrimary}
                    onChange={(e) =>
                      setAccForm((f) => ({ ...f, isPrimary: e.target.checked }))
                    }
                  />{' '}
                  Основной счет
                </label>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy || !accForm.accountNumber.trim()}
                onClick={() => void saveBankAccount()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setAccOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {cardOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setCardOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Добавить банковскую карту</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setCardOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label>Номер карты</label>
                <input
                  value={cardForm.cardNumber}
                  onChange={(e) =>
                    setCardForm((f) => ({ ...f, cardNumber: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalField}>
                <label>Расчетный счет</label>
                <select
                  value={cardForm.accountId}
                  onChange={(e) => {
                    const acc = row?.bankAccounts?.find((a) => a.id === e.target.value);
                    setCardForm((f) => ({
                      ...f,
                      accountId: e.target.value,
                      accountNumber: acc?.accountNumber || '',
                      bankCode: acc?.mfo || f.bankCode,
                    }));
                  }}
                >
                  <option value="">— без привязки —</option>
                  {(row?.bankAccounts || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountNumber}
                      {a.bankName ? ` (${a.bankName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {!cardForm.accountId ? (
                <div className={styles.modalField}>
                  <label>Номер счета (вручную)</label>
                  <input
                    value={cardForm.accountNumber}
                    onChange={(e) =>
                      setCardForm((f) => ({ ...f, accountNumber: e.target.value }))
                    }
                  />
                </div>
              ) : null}
              <div className={styles.modalField}>
                <label>Код банка</label>
                <input
                  value={cardForm.bankCode}
                  onChange={(e) =>
                    setCardForm((f) => ({ ...f, bankCode: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalField}>
                <label>Срок действия</label>
                <input
                  type="date"
                  value={cardForm.expiresAt}
                  onChange={(e) =>
                    setCardForm((f) => ({ ...f, expiresAt: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalField}>
                <label>Состояние</label>
                <select
                  value={cardForm.state}
                  onChange={(e) => setCardForm((f) => ({ ...f, state: e.target.value }))}
                >
                  <option value="active">Активна</option>
                  <option value="blocked">Заблокирована</option>
                  <option value="expired">Истекла</option>
                </select>
              </div>
              <div className={styles.modalField}>
                <label>Статус</label>
                <select
                  value={cardForm.status}
                  onChange={(e) =>
                    setCardForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="active">Активный</option>
                  <option value="inactive">Неактивный</option>
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy || !cardForm.cardNumber.trim()}
                onClick={() => void saveBankCard()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setCardOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {schedOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setSchedOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Запрос на изменение графика</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSchedOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label>Новый график</label>
                <select
                  value={schedForm.scheduleId}
                  onChange={(e) =>
                    setSchedForm((f) => ({ ...f, scheduleId: e.target.value }))
                  }
                >
                  {schedules.length === 0 ? (
                    <option value="">Нет графиков</option>
                  ) : (
                    schedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.startTime && s.endTime
                          ? ` (${s.startTime}-${s.endTime})`
                          : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Дата начала</label>
                  <input
                    type="date"
                    value={schedForm.startDate}
                    onChange={(e) =>
                      setSchedForm((f) => ({ ...f, startDate: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Дата окончания (необяз.)</label>
                  <input
                    type="date"
                    value={schedForm.endDate}
                    onChange={(e) =>
                      setSchedForm((f) => ({ ...f, endDate: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalField}>
                <label>Примечание</label>
                <input
                  value={schedForm.title}
                  onChange={(e) =>
                    setSchedForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="Например: переход на 10:00-19:00"
                />
              </div>
              <div className={styles.modalField}>
                <label>Комментарий</label>
                <textarea
                  value={schedForm.note}
                  onChange={(e) =>
                    setSchedForm((f) => ({ ...f, note: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy || !schedForm.title.trim()}
                onClick={() => void saveScheduleRequest()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setSchedOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {schedReviewId ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setSchedReviewId(null)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Рассмотрение запроса</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSchedReviewId(null)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label>Примечание руководителем</label>
                <textarea
                  value={schedReviewNote}
                  onChange={(e) => setSchedReviewNote(e.target.value)}
                  placeholder="Комментарий к решению"
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() =>
                  void reviewScheduleRequest(
                    schedReviewId,
                    'approved',
                    schedReviewNote,
                  )
                }
              >
                Утвердить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={busy}
                onClick={() =>
                  void reviewScheduleRequest(
                    schedReviewId,
                    'rejected',
                    schedReviewNote,
                  )
                }
              >
                Отклонить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setSchedReviewId(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {markAddOpen && row ? (
        <div className={styles.markCreatePage} role="dialog" aria-modal="true">
          <div className={styles.markCreateTop}>
            <h2 className={styles.markCreateTitle}>Отметки (создание)</h2>
            <div className={styles.markCreateActions}>
              <button
                type="button"
                className={styles.markSaveBtn}
                disabled={busy || !markForm.occurredAt}
                onClick={() => void saveManualMark()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.markCloseBtn}
                onClick={() => setMarkAddOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>

          <div className={styles.markCreateCard}>
            <div className={styles.markField}>
              <label>
                Физическое лицо <span className={styles.req}>*</span>
              </label>
              <div className={styles.markPersonBox}>
                <span>
                  {[row.lastName, row.firstName, row.middleName]
                    .filter(Boolean)
                    .join(' ')
                    .toUpperCase()}
                </span>
                <button
                  type="button"
                  className={styles.markPersonClear}
                  title="Очистить"
                  aria-label="Очистить"
                  onClick={() => setMarkAddOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>

            <div className={styles.markField}>
              <label>Локация</label>
              <div className={styles.markSelectWrap}>
                <select
                  className={styles.markInput}
                  value={markForm.locationId}
                  onChange={(e) =>
                    setMarkForm((f) => ({ ...f, locationId: e.target.value }))
                  }
                >
                  <option value="">Поиск</option>
                  {(row.attachedLocations?.length
                    ? row.attachedLocations
                    : row.locations ?? []
                  ).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.markField}>
              <label>
                Время <span className={styles.req}>*</span>
              </label>
              <input
                className={styles.markInput}
                type="datetime-local"
                value={markForm.occurredAt}
                onChange={(e) =>
                  setMarkForm((f) => ({ ...f, occurredAt: e.target.value }))
                }
              />
            </div>

            <div className={styles.markField}>
              <label>Тип отметки</label>
              <div className={styles.markRadios}>
                {(
                  [
                    ['mark', 'Отметка'],
                    ['in', 'Приход'],
                    ['out', 'Уход'],
                    ['break_out', 'Перерыв уход'],
                    ['break_in', 'Перерыв приход'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className={styles.markRadio}>
                    <input
                      type="radio"
                      name="markTypeCreate"
                      checked={markForm.markType === k}
                      onChange={() =>
                        setMarkForm((f) => ({ ...f, markType: k }))
                      }
                    />
                    <span className={styles.markRadioDot} aria-hidden />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.markField}>
              <label>Примечание</label>
              <textarea
                className={styles.markTextarea}
                rows={4}
                value={markForm.note}
                onChange={(e) =>
                  setMarkForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </div>

            <label className={styles.markDrop}>
              <span>Перетащите файл сюда или кликните для выбора файла</span>
              <input
                type="file"
                onChange={() => {
                  /* attachment optional for now */
                }}
              />
            </label>

            <div className={styles.markValid}>
              <span className={styles.markValidLabel}>Действительная</span>
              <button
                type="button"
                className={`${styles.markSwitch} ${
                  markForm.isValid ? styles.markSwitchOn : ''
                }`}
                role="switch"
                aria-checked={markForm.isValid}
                onClick={() =>
                  setMarkForm((f) => ({ ...f, isValid: !f.isValid }))
                }
              >
                <span className={styles.markSwitchKnob} />
                <span className={styles.markSwitchText}>
                  {markForm.isValid ? 'Да' : 'Нет'}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dayModalKey && row ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setDayModalKey(null)}
          role="presentation"
        >
          <div
            className={`${styles.modal} ${styles.dayModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const day = dayByDate.get(dayModalKey);
              const d = new Date(`${dayModalKey}T12:00:00Z`);
              const dayNum = d.getUTCDate();
              const monthName = MONTHS_RU[d.getUTCMonth()] ?? '';
              const off = isWeekendPattern(d, row.schedule);
              const isLeave = leaveDateKeys.has(dayModalKey);
              const isDayOff = day?.status === 'day_off' || off;
              const kindLabel = isLeave
                ? 'Отпуск'
                : isDayOff
                  ? 'Выходной'
                  : 'Рабочий день';
              const kindClass = isLeave
                ? styles.dayKindLeave
                : isDayOff
                  ? styles.dayKindOff
                  : styles.dayKindWork;
              const start = row.schedule?.startTime || '09:00';
              const end = row.schedule?.endTime || '18:00';
              const inHm = fmtHmFromIso(day?.firstInAt);
              const outHm = fmtHmFromIso(day?.lastOutAt);
              const planned = isDayOff || isLeave ? 0 : plannedWorkMinutes(row.schedule);
              const worked = workedMinutes(day);
              const unworked = Math.max(0, planned - worked);
              const dayMarksAll = (row.marks || [])
                .filter((m) => {
                  const utc = m.occurredAt.slice(0, 10);
                  const ld = new Date(m.occurredAt);
                  const local = `${ld.getFullYear()}-${String(ld.getMonth() + 1).padStart(2, '0')}-${String(ld.getDate()).padStart(2, '0')}`;
                  return utc === dayModalKey || local === dayModalKey;
                })
                .sort(
                  (a, b) =>
                    new Date(a.occurredAt).getTime() -
                    new Date(b.occurredAt).getTime(),
                );
              const dayMarks =
                dayMarksFilter === 'used'
                  ? dayMarksAll.filter((m) => m.isValid !== false)
                  : dayMarksAll;

              return (
                <>
                  <div className={styles.dayModalHead}>
                    <div className={styles.dayModalTitleRow}>
                      <h2 id="day-modal-title" className={styles.dayModalTitle}>
                        {dayNum} {monthName}
                      </h2>
                      <span className={`${styles.dayKindBadge} ${kindClass}`}>
                        {kindLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.modalClose}
                      aria-label="Закрыть"
                      onClick={() => setDayModalKey(null)}
                    >
                      ×
                    </button>
                  </div>

                  <div className={styles.dayModalTabs}>
                    <button
                      type="button"
                      className={
                        dayModalTab === 'stats'
                          ? styles.dayModalTabActive
                          : styles.dayModalTab
                      }
                      onClick={() => setDayModalTab('stats')}
                    >
                      Статистика дня
                    </button>
                    <button
                      type="button"
                      className={
                        dayModalTab === 'marks'
                          ? styles.dayModalTabActive
                          : styles.dayModalTab
                      }
                      onClick={() => setDayModalTab('marks')}
                    >
                      Отметки
                    </button>
                  </div>

                  <div className={styles.modalBody}>
                    {dayModalTab === 'stats' ? (
                      <>
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th />
                                <th>Приход</th>
                                <th>Уход</th>
                                <th>Перерыв</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>План</td>
                                <td>{isDayOff || isLeave ? '—' : start}</td>
                                <td>{isDayOff || isLeave ? '—' : end}</td>
                                <td>{isDayOff || isLeave ? '—' : '13:00-14:00'}</td>
                              </tr>
                              <tr>
                                <td>Факт</td>
                                <td>{inHm || '—'}</td>
                                <td className={!outHm && inHm ? styles.dayOutMissing : undefined}>
                                  {outHm || ''}
                                  {!outHm && inHm ? (
                                    <span className={styles.dayWarn}>Нет ухода</span>
                                  ) : null}
                                  {!outHm && !inHm ? '—' : null}
                                </td>
                                <td>—</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className={styles.dayTotals}>
                          <h3>Итоги дня</h3>
                          <dl>
                            <div>
                              <dt>План</dt>
                              <dd>{formatDurationRu(planned)}</dd>
                            </div>
                            <div>
                              <dt>Отработано</dt>
                              <dd>{worked > 0 ? formatDurationRu(worked) : '—'}</dd>
                            </div>
                            <div>
                              <dt>Неотработано</dt>
                              <dd
                                className={
                                  unworked > 0 ? styles.dayTotalsNeg : undefined
                                }
                              >
                                {unworked > 0 ? formatDurationRu(unworked) : '—'}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </>
                    ) : (
                      <div className={styles.dayMarksPanel}>
                        <div className={styles.dayMarksFilters}>
                          <button
                            type="button"
                            className={
                              dayMarksFilter === 'all'
                                ? styles.dayMarksChipActive
                                : styles.dayMarksChip
                            }
                            onClick={() => setDayMarksFilter('all')}
                          >
                            Все отметки
                          </button>
                          <button
                            type="button"
                            className={
                              dayMarksFilter === 'used'
                                ? styles.dayMarksChipActive
                                : styles.dayMarksChip
                            }
                            onClick={() => setDayMarksFilter('used')}
                          >
                            Только отметки использованные при расчете фактов
                          </button>
                        </div>
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>Дата</th>
                                <th>Время</th>
                                <th>Фото</th>
                                <th>Тип отметки</th>
                                <th>Локация</th>
                                <th>Отметка использована при расчете фактов</th>
                                <th>Действия</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayMarks.length ? (
                                dayMarks.map((m) => {
                                  const meta = markTypeMeta(m);
                                  const used = m.isValid !== false;
                                  const busy = dayMarkBusy === m.id;
                                  const daySlides = dayMarks
                                    .map((x) => ({
                                      src: mediaSrc(x.photoUrl) || '',
                                      caption: `${markTypeMeta(x).label} ${new Date(x.occurredAt).toLocaleTimeString('ru-RU')}`,
                                    }))
                                    .filter((s) => s.src);
                                  const photo = mediaSrc(m.photoUrl);
                                  const photoIdx = photo
                                    ? daySlides.findIndex((s) => s.src === photo)
                                    : -1;
                                  return (
                                    <tr key={m.id}>
                                      <td>
                                        {new Date(m.occurredAt).toLocaleDateString(
                                          'ru-RU',
                                          {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                          },
                                        )}
                                      </td>
                                      <td>
                                        {new Date(m.occurredAt).toLocaleTimeString(
                                          'ru-RU',
                                          {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                          },
                                        )}
                                      </td>
                                      <td>
                                        {photo ? (
                                          <PhotoThumb
                                            className={styles.markThumb}
                                            src={photo}
                                            alt=""
                                            lightbox={photos}
                                            slides={daySlides}
                                            index={photoIdx < 0 ? 0 : photoIdx}
                                          />
                                        ) : (
                                          <span className={styles.markThumbEmpty} />
                                        )}
                                      </td>
                                      <td>
                                        <span className={styles.markTypeCell}>
                                          <span
                                            className={`${styles.markDot} ${
                                              meta.tone === 'in'
                                                ? styles.markDotIn
                                                : meta.tone === 'out'
                                                  ? styles.markDotOut
                                                  : styles.markDotMark
                                            }`}
                                          />
                                          {meta.label}
                                        </span>
                                      </td>
                                      <td>{m.locationName || '—'}</td>
                                      <td>
                                        <label className={styles.dayUsedCheck}>
                                          <input
                                            type="checkbox"
                                            checked={used}
                                            disabled={busy}
                                            onChange={() =>
                                              void toggleDayMarkValid(m.id, !used)
                                            }
                                          />
                                          <span>{used ? 'Да' : 'Нет'}</span>
                                        </label>
                                      </td>
                                      <td>
                                        <div className={styles.dayMarkActions}>
                                          <button
                                            type="button"
                                            className={styles.dayMarkAct}
                                            title="Удалить"
                                            disabled={busy}
                                            onClick={() => void deleteDayMark(m.id)}
                                          >
                                            <i className="fas fa-trash-alt" aria-hidden />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={7} className={styles.emptyCell}>
                                    Отметок за день нет
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.modalFooter}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => setDayModalKey(null)}
                    >
                      Закрыть
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
      {personalOpen && row ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setPersonalOpen(false)}
          role="presentation"
        >
          <div
            className={`${styles.modal} ${styles.profileEditModal}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Персональные данные (изменение)</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setPersonalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Имя *</label>
                  <input
                    value={personalForm.firstName}
                    onChange={(e) =>
                      setPersonalForm((f) => ({ ...f, firstName: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Фамилия</label>
                  <input
                    value={personalForm.lastName}
                    onChange={(e) =>
                      setPersonalForm((f) => ({ ...f, lastName: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Отчество</label>
                  <input
                    value={personalForm.middleName}
                    onChange={(e) =>
                      setPersonalForm((f) => ({ ...f, middleName: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Национальность</label>
                  <select
                    value={personalForm.nationality}
                    onChange={(e) =>
                      setPersonalForm((f) => ({
                        ...f,
                        nationality: e.target.value,
                      }))
                    }
                  >
                    {!nationalityOpts.some((o) => o.name === personalForm.nationality) &&
                    personalForm.nationality ? (
                      <option value={personalForm.nationality}>
                        {personalForm.nationality}
                      </option>
                    ) : null}
                    {nationalityOpts.map((o) => (
                      <option key={o.code} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Дата рождения</label>
                  <input
                    type="date"
                    value={personalForm.birthDate}
                    onChange={(e) =>
                      setPersonalForm((f) => ({ ...f, birthDate: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Пол</label>
                  <div className={styles.genderRow}>
                    <label>
                      <input
                        type="radio"
                        checked={personalForm.gender === 'male'}
                        onChange={() =>
                          setPersonalForm((f) => ({ ...f, gender: 'male' }))
                        }
                      />{' '}
                      Мужской
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={personalForm.gender === 'female'}
                        onChange={() =>
                          setPersonalForm((f) => ({ ...f, gender: 'female' }))
                        }
                      />{' '}
                      Женский
                    </label>
                  </div>
                </div>
              </div>
              <div className={styles.modalRow3}>
                <div className={styles.modalField}>
                  <label>ПИНФЛ</label>
                  <input
                    value={personalForm.pinfl}
                    onChange={(e) =>
                      setPersonalForm((f) => ({ ...f, pinfl: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>ИНПС</label>
                  <input
                    value={personalForm.inps}
                    onChange={(e) =>
                      setPersonalForm((f) => ({ ...f, inps: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>ИНН</label>
                  <input
                    value={personalForm.inn}
                    onChange={(e) =>
                      setPersonalForm((f) => ({ ...f, inn: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalField}>
                <label>Примечание</label>
                <textarea
                  value={personalForm.note}
                  onChange={(e) =>
                    setPersonalForm((f) => ({ ...f, note: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setPersonalOpen(false)}
              >
                Закрыть
              </button>
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() => void savePersonal()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {contactsOpen && row ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setContactsOpen(false)}
          role="presentation"
        >
          <div
            className={`${styles.modal} ${styles.profileEditModal}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Контакты и адреса (изменение)</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setContactsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Номер телефона</label>
                  <input
                    value={contactsForm.phone}
                    onChange={(e) =>
                      setContactsForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    placeholder="+998…"
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Дополнительный номер телефона</label>
                  <input
                    value={contactsForm.phoneExtra}
                    onChange={(e) =>
                      setContactsForm((f) => ({
                        ...f,
                        phoneExtra: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>E-mail</label>
                  <input
                    value={contactsForm.email}
                    onChange={(e) =>
                      setContactsForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Корпоративный E-mail</label>
                  <input
                    value={contactsForm.emailCorp}
                    onChange={(e) =>
                      setContactsForm((f) => ({
                        ...f,
                        emailCorp: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalField}>
                <label>Регион</label>
                <select
                  value={contactsForm.regionId}
                  onChange={(e) =>
                    setContactsForm((f) => ({ ...f, regionId: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.modalRow3}>
                <div className={styles.modalField}>
                  <label>Улица</label>
                  <input
                    value={contactsForm.street}
                    onChange={(e) =>
                      setContactsForm((f) => ({ ...f, street: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Дом</label>
                  <input
                    value={contactsForm.house}
                    onChange={(e) =>
                      setContactsForm((f) => ({ ...f, house: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Квартира</label>
                  <input
                    value={contactsForm.apartment}
                    onChange={(e) =>
                      setContactsForm((f) => ({
                        ...f,
                        apartment: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalField}>
                <label>Адрес</label>
                <textarea
                  value={contactsForm.address}
                  onChange={(e) =>
                    setContactsForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </div>
              <div className={styles.modalField}>
                <label>Адрес по прописке</label>
                <textarea
                  value={contactsForm.registeredAddress}
                  onChange={(e) =>
                    setContactsForm((f) => ({
                      ...f,
                      registeredAddress: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setContactsOpen(false)}
              >
                Закрыть
              </button>
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() => void saveContacts()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {orgOpen && row ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setOrgOpen(false)}
          role="presentation"
        >
          <div
            className={`${styles.modal} ${styles.profileEditModal}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Организация и занятость</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setOrgOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Табельный номер</label>
                  <input
                    value={orgForm.tabNumber}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, tabNumber: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.modalField}>
                  <label>Дата приёма</label>
                  <input
                    type="date"
                    value={orgForm.hiredAt}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, hiredAt: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Подразделение</label>
                  <select
                    value={orgForm.divisionId}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, divisionId: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {orgLookups.divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.modalField}>
                  <label>Должность</label>
                  <select
                    value={orgForm.positionId}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, positionId: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {orgLookups.positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Грейд</label>
                  <select
                    value={orgForm.gradeId}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, gradeId: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {orgLookups.grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.modalField}>
                  <label>График работы</label>
                  <select
                    value={orgForm.scheduleId}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, scheduleId: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {orgLookups.schedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Регион</label>
                  <select
                    value={orgForm.regionId}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, regionId: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.modalField}>
                  <label>Оклад</label>
                  <input
                    value={orgForm.baseSalary}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, baseSalary: e.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className={styles.modalRow2}>
                <div className={styles.modalField}>
                  <label>Тип занятости</label>
                  <select
                    value={orgForm.employmentType}
                    onChange={(e) =>
                      setOrgForm((f) => ({
                        ...f,
                        employmentType: e.target.value,
                      }))
                    }
                  >
                    <option value="staff">Штат</option>
                    <option value="gph">ГПХ</option>
                  </select>
                </div>
                <div className={styles.modalField}>
                  <label>Статус</label>
                  <select
                    value={orgForm.status}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    <option value="active">Работает</option>
                    <option value="leave">В отпуске</option>
                    <option value="dismissed">Уволен</option>
                  </select>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setOrgOpen(false)}
              >
                Закрыть
              </button>
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() => void saveOrg()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {historyOpen && historyData ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setHistoryOpen(null)}
          role="presentation"
        >
          <div
            className={`${styles.modal} ${styles.historyModal}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>{historyData.title}</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setHistoryOpen(null)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.historyMeta}>
                <div>
                  <span>Создал</span>
                  <strong>{historyData.createdBy}</strong>
                  <small>{fmtDateTime(historyData.createdAt)}</small>
                </div>
                <div>
                  <span>Изменил</span>
                  <strong>{historyData.changedBy}</strong>
                  <small>{fmtDateTime(historyData.changedAt)}</small>
                </div>
              </div>
              <div className={styles.historyToolbar}>
                <input
                  className={styles.historySearch}
                  placeholder="Поиск"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => void openHistory(historyOpen)}
                  title="Обновить"
                >
                  ↻
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Поле</th>
                      <th>Событие</th>
                      <th>Дата и время события</th>
                      <th>Значение</th>
                      <th>Пользователь</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.rows.filter((r) => {
                      const q = historyQuery.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        r.field.toLowerCase().includes(q) ||
                        r.value.toLowerCase().includes(q) ||
                        r.userName.toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.emptyCell}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      historyData.rows
                        .filter((r) => {
                          const q = historyQuery.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            r.field.toLowerCase().includes(q) ||
                            r.value.toLowerCase().includes(q) ||
                            r.userName.toLowerCase().includes(q)
                          );
                        })
                        .map((r, i) => (
                          <tr key={`${r.field}-${r.occurredAt}-${i}`}>
                            <td>{r.field}</td>
                            <td>
                              <span className={styles.historyEvent}>
                                <span
                                  className={
                                    r.event === 'Добавлен'
                                      ? styles.historyDotAdd
                                      : styles.historyDotEdit
                                  }
                                />
                                {r.event}
                              </span>
                            </td>
                            <td>{fmtDateTime(r.occurredAt)}</td>
                            <td>{r.value}</td>
                            <td>{r.userName}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setHistoryOpen(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {photos.node}
    </div>
  );
}
