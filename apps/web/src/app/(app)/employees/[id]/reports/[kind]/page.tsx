'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  DisciplineReportSheet,
  type DisciplineRow,
} from '@/components/DisciplineReportSheet';
import {
  downloadAttendanceLikeXlsx,
  downloadStyledXlsx,
  XLSX_COLORS,
  type XlsxCell,
} from '@/lib/xlsx-download';
import styles from './page.module.css';

type ReportSettings = Record<string, boolean>;

type AttendanceRow = {
  date: string;
  day?: string;
  status?: string;
  isWeekend?: boolean;
  isLeave?: boolean;
  isNoShow?: boolean;
  isIncomplete?: boolean;
  dayOffLabel?: string | null;
  planIn?: string | null;
  planOut?: string | null;
  planNorm?: number;
  factIn?: string | null;
  factOut?: string | null;
  hoursWorked?: number | null;
  absenceReason?: string | null;
  onTimeHours?: number | null;
  absenceWithReason?: number;
  absenceWithoutReason?: number;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  overtimeHours?: number;
  workCoeff?: number | null;
  fineLateMinutes?: number | null;
  fineEarlyMinutes?: number | null;
  fineAbsentHours?: number | null;
  workedWithPenalties?: number | null;
  total?: number | null;
  [key: string]: unknown;
};

type Report = {
  kind: string;
  title: string;
  generatedAt: string;
  from?: string | null;
  to?: string | null;
  settings?: ReportSettings;
  columns?: string[];
  employee: {
    id: string;
    tabNumber: string;
    fullName: string;
    email?: string | null;
    division?: string | null;
    divisionCode?: string | null;
    position?: string | null;
    grade?: string | null;
    region?: string | null;
    hiredAt?: string | null;
    schedule?: string | null;
    scheduleStart?: string | null;
    scheduleEnd?: string | null;
    manager?: string | null;
    baseSalary?: number | null;
    location?: string | null;
    branch?: string | null;
  };
  summary?: Record<string, number>;
  totals?: Record<string, number>;
  rows?: AttendanceRow[];
  marksSample?: Record<string, unknown>[];
};

type ViewMode = 'filter' | 'preview' | 'settings';

const KIND_LABELS: Record<string, string> = {
  attendance: 'По посещениям',
  discipline: 'По дисциплине',
  bonus: 'По видам времени',
  'time-types': 'По видам времени',
  accrual: 'Книга начислений',
};

const MONTHS_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

const SETTINGS_COLUMNS: {
  title: string;
  items: { key: string; label: string; toggle?: boolean }[];
}[][] = [
  [
    {
      title: 'Информация о сотруднике',
      items: [
        { key: 'showTabNumber', label: 'Табельный номер' },
        { key: 'showPosition', label: 'Должность' },
        { key: 'showFullName', label: 'Ф.И.О.' },
        { key: 'showBranch', label: 'Филиал' },
        { key: 'showGrade', label: 'Разряд' },
        { key: 'showHireDate', label: 'Установка даты приема' },
        { key: 'showAltName', label: 'Альтернативное имя сотрудника' },
        { key: 'showSchedule', label: 'График работы' },
        { key: 'showManager', label: 'Руководитель' },
      ],
    },
    {
      title: 'Организационная структура',
      items: [
        { key: 'showDivision', label: 'Подразделение' },
        { key: 'showDivisionCode', label: 'Код подразделения' },
        { key: 'showDivisionGroup', label: 'Группа подразделений' },
        { key: 'showRegion', label: 'Регион' },
        { key: 'showLocation', label: 'Локация' },
      ],
    },
    {
      title: 'Фильтры и динамические поля',
      items: [
        {
          key: 'includeDismissed',
          label: 'Отображать уволенных либо еще не принятых на работу',
        },
        {
          key: 'showDynamicFields',
          label: 'Показать динамические поля сотрудника',
        },
        {
          key: 'showDivisionDynamicFields',
          label: 'Показать динамические поля подразделений',
        },
      ],
    },
  ],
  [
    {
      title: 'Информация о посещениях',
      items: [
        { key: 'showLate', label: 'Опоздания' },
        { key: 'showEarlyLeave', label: 'Ранний уход' },
        { key: 'showOvertime', label: 'Сверхурочно' },
        { key: 'showOffSchedule', label: 'Вне графика' },
        { key: 'showHoursWorked', label: 'Отработано часов' },
        { key: 'showWorkCoeff', label: 'Отработанный коэффициент' },
        { key: 'showDaysWorked', label: 'Отработанных дней' },
        { key: 'showPlannedDays', label: 'Дни по плану' },
        { key: 'showCustomNormDays', label: 'Пользовательская норма дней' },
        { key: 'showCustomNormHours', label: 'Пользовательская норма часов' },
        { key: 'showWorkedDaysCoeff', label: 'Коэффициент отработанных дней' },
        { key: 'showConsecutiveAbsence', label: 'Дни отсутствия подряд' },
        { key: 'showHoursWorkedPerDay', label: 'Отработано часов (за день)' },
        { key: 'showFactsByDays', label: 'Факты по дням' },
        { key: 'showRequestTime', label: 'Время запроса' },
      ],
    },
    {
      title: 'Отображать приходы и уходы',
      items: [
        { key: 'showArrivals', label: 'Отображать приходы и уходы', toggle: true },
        { key: 'showArrivalTimes', label: 'Время прихода и ухода' },
        {
          key: 'showDailyByRows',
          label: 'Показывать ежедневную информацию по строкам',
        },
        {
          key: 'showDailyByColumns',
          label: 'Показывать ежедневную информацию по столбцам',
        },
      ],
    },
  ],
  [
    {
      title: 'Формат и отображение',
      items: [
        { key: 'showTimeDisplay', label: 'Отображение времени', toggle: true },
        { key: 'showColorLegend', label: 'Показывать описания цветов' },
        { key: 'hideLetterCodes', label: 'Скрыть буквенные коды' },
        { key: 'hideWorkedHours', label: 'Скрыть отработанные часы' },
        { key: 'showAbsencesByType', label: 'Отсутствие по виду времени' },
        { key: 'showInternalTrips', label: 'Внутренняя командировка' },
        { key: 'showMarkVerify', label: 'Проверить отметки' },
        { key: 'showMarkSchedule', label: 'Расписание отметок' },
        { key: 'showMarkDetails', label: 'Детали отметок' },
        { key: 'showDailyMarkDetails', label: 'Детали отметок за день' },
        { key: 'splitByDivision', label: 'Разделить по подразделениям' },
        { key: 'roundHours', label: 'Округлять часы' },
      ],
    },
  ],
  [
    {
      title: 'Расчет',
      items: [
        {
          key: 'customWorkedTime',
          label: 'Пользовательские настройки отработанного времени',
          toggle: true,
        },
        { key: 'weekendFactCalc', label: 'Расчет выходных фактов' },
        { key: 'monthlyPlan', label: 'Месячный план' },
        {
          key: 'absenceCoeff',
          label: 'Отсутствие по причине с учетом коэффициента',
        },
        { key: 'weekendWorkCoeff', label: 'Коэффициент работы в выходные дни' },
      ],
    },
    {
      title: 'Показатели штрафов',
      items: [
        { key: 'fineLate', label: 'Штрафное время за опоздание' },
        { key: 'fineTime', label: 'Штрафное время' },
        {
          key: 'fineWorkedWithPenalties',
          label: 'Отработанное время с учетом штрафов',
        },
        { key: 'fineEarly', label: 'Штрафное время за ранний уход' },
        { key: 'fineAbsent', label: 'Штрафное время за отсутствие' },
        {
          key: 'finePeriodOnly',
          label: 'Считать штрафное время только за период',
        },
      ],
    },
    {
      title: 'Исходные штрафы',
      items: [
        { key: 'origFineLate', label: 'Исходное штрафное время за опоздание' },
        {
          key: 'origFineEarly',
          label: 'Исходное штрафное время за ранний уход',
        },
        {
          key: 'origFineAbsent',
          label: 'Исходное штрафное время за отсутствие',
        },
      ],
    },
  ],
];

function fmtDateSlash(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function fmtPeriodRu(from?: string | null, to?: string | null) {
  const one = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS_RU[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  return `${one(from)} - ${one(to)}`;
}

function fmtHm(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    if (/^\d{1,2}:\d{2}/.test(iso)) return iso.slice(0, 5);
    return '';
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function num(v: unknown) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '';
  return String(n);
}

function numOrZero(v: unknown) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(n);
}

function statusRu(s: string) {
  const map: Record<string, string> = {
    on_time: 'Вовремя',
    late: 'Опоздание',
    absent: 'Прогул',
    leave: 'Отпуск',
    day_off: 'Выходной',
    not_started: 'Не начат',
  };
  return map[s] ?? s;
}

function cell(v: unknown) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return fmtDateSlash(v);
  }
  return String(v);
}

export default function EmployeeReportPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Загрузка…</p>}>
      <EmployeeReportInner />
    </Suspense>
  );
}

function EmployeeReportInner() {
  const { id, kind } = useParams<{ id: string; kind: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const initialView = (search.get('view') as ViewMode) || 'preview';
  const [view, setView] = useState<ViewMode>(
    initialView === 'settings' || initialView === 'filter' ? initialView : 'preview',
  );
  const [data, setData] = useState<Report | null>(null);
  const [settings, setSettings] = useState<ReportSettings>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const q = qs.toString();
      const res = await apiFetch<Report>(
        `/api/employees/${id}/reports/${kind}${q ? `?${q}` : ''}`,
      );
      setData(res);
      if (res.settings) setSettings(res.settings);
      if (!from && res.from) setFrom(res.from.slice(0, 10));
      if (!to && res.to) setTo(res.to.slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }, [id, kind, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo(() => {
    if (data?.columns?.length) return data.columns;
    if (data?.rows?.length) return Object.keys(data.rows[0]);
    return [];
  }, [data]);

  async function saveSettings() {
    setBusy(true);
    setSavedMsg('');
    setError('');
    try {
      const res = await apiFetch<{ settings: ReportSettings }>(
        `/api/employees/${id}/reports/${kind}/settings`,
        { method: 'PATCH', body: JSON.stringify(settings) },
      );
      setSettings(res.settings);
      setSavedMsg('Настройки сохранены');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function resetSettings() {
    setBusy(true);
    setError('');
    try {
      const defaults = await apiFetch<{ settings: ReportSettings }>(
        `/api/employees/${id}/reports/${kind}/settings`,
        {
          method: 'PATCH',
          body: JSON.stringify({ __reset: true }),
        },
      );
      setSettings(defaults.settings);
      setSavedMsg('Настройки сброшены');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сброса');
    } finally {
      setBusy(false);
    }
  }

  async function exportExcel() {
    if (!data?.rows?.length) return;
    if (kind === 'attendance' || kind === 'visits') {
      const s = settings;
      const showFactCsv = !!(s.showArrivals || s.showArrivalTimes);
      const showWorkedCsv = !!(
        s.showHoursWorked &&
        s.showHoursWorkedPerDay &&
        !s.hideWorkedHours
      );
      const factSpan = showFactCsv ? (showWorkedCsv ? 3 : 2) : 0;
      const absSpan = s.showAbsencesByType ? 1 : 0;
      const absHoursSpan = s.showAbsencesByType ? 2 : 0;
      const extrasLabels = [
        ...(s.showLate ? ['Опоздание'] : []),
        ...(s.showEarlyLeave ? ['Ранний уход'] : []),
        ...(s.showOvertime ? ['Сверхурочно'] : []),
        ...(s.showWorkCoeff ? ['Коэфф.'] : []),
        ...(s.fineLate ? ['Штраф опозд.'] : []),
        ...(s.fineEarly ? ['Штраф ран.'] : []),
        ...(s.fineAbsent ? ['Штраф прогул'] : []),
        ...(s.fineWorkedWithPenalties ? ['Отраб. со штрафом'] : []),
      ];

      const topHeader: { label: string; span: number; fill?: string }[] = [
        { label: 'Дата', span: 1 },
        { label: 'День', span: 1 },
        { label: 'План', span: 3 },
      ];
      if (showFactCsv) {
        topHeader.push({
          label: 'Факт',
          span: factSpan,
          fill: XLSX_COLORS.factBg,
        });
      }
      if (s.showAbsencesByType) {
        topHeader.push({ label: 'Отсутствие по причине', span: 1 });
      }
      topHeader.push({ label: 'Вовремя', span: 1 });
      if (s.showAbsencesByType) {
        topHeader.push({ label: 'Отсутствие', span: 2 });
      }
      for (const lab of extrasLabels) {
        topHeader.push({ label: lab, span: 1 });
      }
      topHeader.push({ label: 'Итого', span: 1 });

      const subHeader: { label: string; fill?: string }[] = [
        { label: '' },
        { label: '' },
        { label: 'Приход' },
        { label: 'Уход' },
        { label: 'Норма' },
        ...(showFactCsv
          ? [
              { label: 'Приход', fill: XLSX_COLORS.factBg },
              { label: 'Уход', fill: XLSX_COLORS.factBg },
              ...(showWorkedCsv
                ? [{ label: 'Отработано', fill: XLSX_COLORS.factBg }]
                : []),
            ]
          : []),
        ...(s.showAbsencesByType ? [{ label: '' }] : []),
        { label: '' },
        ...(s.showAbsencesByType
          ? [{ label: 'По причине' }, { label: 'Без причины' }]
          : []),
        ...extrasLabels.map((label) => ({ label: '' })),
        { label: '' },
      ];

      const factStyle = { fill: XLSX_COLORS.factBg };
      const dateStyle = { fontColor: XLSX_COLORS.dateFg, bold: true };

      const xrows = data.rows.map((row) => {
        const extras: XlsxCell[] = [
          ...(s.showLate ? [num(row.lateMinutes)] : []),
          ...(s.showEarlyLeave ? [num(row.earlyLeaveMinutes)] : []),
          ...(s.showOvertime ? [num(row.overtimeHours)] : []),
          ...(s.showWorkCoeff ? [num(row.workCoeff)] : []),
          ...(s.fineLate ? [num(row.fineLateMinutes)] : []),
          ...(s.fineEarly ? [num(row.fineEarlyMinutes)] : []),
          ...(s.fineAbsent ? [num(row.fineAbsentHours)] : []),
          ...(s.fineWorkedWithPenalties ? [num(row.workedWithPenalties)] : []),
        ];
        if (row.isWeekend) {
          const cells: XlsxCell[] = [
            { v: fmtDateSlash(String(row.date)), s: dateStyle },
            row.day || '',
            { v: 'Выходной день', s: { bold: true } },
            '',
            '',
            ...(showFactCsv
              ? Array.from({ length: factSpan }, () => '' as XlsxCell)
              : []),
            ...(s.showAbsencesByType ? ['' as XlsxCell] : []),
            '',
            ...(s.showAbsencesByType ? (['', ''] as XlsxCell[]) : []),
            ...extras.map(() => '' as XlsxCell),
            '',
          ];
          return { cells, kind: 'weekend' as const };
        }
        const factIn = row.isNoShow
          ? 'Не пришел'
          : fmtHm(row.factIn as string);
        const factOut = row.isNoShow
          ? 'Не пришел'
          : row.isIncomplete
            ? 'xx:xx'
            : fmtHm(row.factOut as string);
        const worked = row.isNoShow
          ? 'Не пришел'
          : row.isIncomplete
            ? ''
            : numOrZero(row.hoursWorked);
        const cells: XlsxCell[] = [
          { v: fmtDateSlash(String(row.date)), s: dateStyle },
          row.day || '',
          row.planIn || '',
          row.planOut || '',
          row.planNorm ?? '',
          ...(showFactCsv
            ? ([
                { v: factIn, s: factStyle },
                { v: factOut, s: factStyle },
                ...(showWorkedCsv
                  ? [{ v: worked, s: factStyle } as XlsxCell]
                  : []),
              ] as XlsxCell[])
            : []),
          ...(s.showAbsencesByType ? [row.absenceReason || ''] : []),
          numOrZero(row.onTimeHours),
          ...(s.showAbsencesByType
            ? [
                numOrZero(row.absenceWithReason),
                numOrZero(row.absenceWithoutReason),
              ]
            : []),
          ...extras,
          numOrZero(row.total),
        ];
        return {
          cells,
          kind: row.isNoShow ? ('noshow' as const) : ('normal' as const),
        };
      });

      const footer: XlsxCell[] | undefined = data.totals
        ? [
            { v: 'Итого', s: { bold: true } },
            '',
            '',
            '',
            numOrZero(data.totals.planNorm),
            ...(showFactCsv
              ? ([
                  '',
                  '',
                  ...(showWorkedCsv
                    ? [num(data.totals.hoursWorked)]
                    : []),
                ] as XlsxCell[])
              : []),
            ...(s.showAbsencesByType ? ['' as XlsxCell] : []),
            num(data.totals.onTimeHours),
            ...(s.showAbsencesByType
              ? [
                  num(data.totals.absenceWithReason),
                  numOrZero(data.totals.absenceWithoutReason),
                ]
              : []),
            ...(s.showLate ? [num(data.totals.lateMinutes)] : []),
            ...(s.showEarlyLeave ? [num(data.totals.earlyLeaveMinutes)] : []),
            ...(s.showOvertime ? [num(data.totals.overtimeHours)] : []),
            ...(s.showWorkCoeff ? ['' as XlsxCell] : []),
            ...(s.fineLate ? [num(data.totals.fineLateMinutes)] : []),
            ...(s.fineEarly ? [num(data.totals.fineEarlyMinutes)] : []),
            ...(s.fineAbsent ? [num(data.totals.fineAbsentHours)] : []),
            ...(s.fineWorkedWithPenalties ? ['' as XlsxCell] : []),
            num(data.totals.total),
          ]
        : undefined;

      void absSpan;
      void absHoursSpan;

      await downloadAttendanceLikeXlsx({
        filename: `Отчет-по-посещениям-${data.employee.fullName}.xlsx`,
        title: `${data.title || 'Отчет по посещениям'} (${data.employee.fullName})`,
        subtitle: `Период: ${fmtPeriodRu(data.from, data.to)}`,
        topHeader,
        subHeader,
        rows: xrows,
        footer,
      });
      return;
    }

    await downloadStyledXlsx({
      filename: `report-${kind}-${id}.xlsx`,
      sheetName: KIND_LABELS[kind] || 'Отчет',
      title: data.title || KIND_LABELS[kind] || 'Отчет',
      subtitle: data.employee
        ? `${data.employee.fullName} · ${fmtPeriodRu(data.from, data.to)}`
        : undefined,
      columns,
      rows: data.rows.map((row) =>
        columns.map((c) =>
          c === 'status' && typeof row[c] === 'string'
            ? statusRu(String(row[c]))
            : cell(row[c]),
        ),
      ),
    });
  }

  if (!data && !error) return <p className={styles.muted}>Загрузка…</p>;
  if (error && !data) return <p className={styles.error}>{error}</p>;
  if (!data) return null;

  const isAttendance = kind === 'attendance' || kind === 'visits';
  const isDiscipline = kind === 'discipline';
  const showFact = !!(settings.showArrivals || settings.showArrivalTimes);
  const showWorkedCol = !!(
    settings.showHoursWorked &&
    settings.showHoursWorkedPerDay &&
    !settings.hideWorkedHours
  );
  const showAbs = !!settings.showAbsencesByType;
  const showLateCol = !!settings.showLate;
  const showEarlyCol = !!settings.showEarlyLeave;
  const showOvertimeCol = !!settings.showOvertime;
  const showWorkCoeffCol = !!settings.showWorkCoeff;
  const showFineLate = !!settings.fineLate;
  const showFineEarly = !!settings.fineEarly;
  const showFineAbsent = !!settings.fineAbsent;
  const showWorkedPen = !!settings.fineWorkedWithPenalties;
  const showDaily = settings.showDailyByRows !== false;
  const genLabel = new Date(data.generatedAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const extraColCount =
    (showLateCol ? 1 : 0) +
    (showEarlyCol ? 1 : 0) +
    (showOvertimeCol ? 1 : 0) +
    (showWorkCoeffCol ? 1 : 0) +
    (showFineLate ? 1 : 0) +
    (showFineEarly ? 1 : 0) +
    (showFineAbsent ? 1 : 0) +
    (showWorkedPen ? 1 : 0);

  return (
    <div className={styles.page}>
      <div className={`${styles.actionBar} ${styles.noPrint}`}>
        <button
          type="button"
          className={`${styles.tabBtn} ${view === 'filter' ? styles.tabBtnActive : ''}`}
          onClick={() => setView('filter')}
        >
          Фильтр
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${view === 'preview' ? styles.tabBtnActive : ''}`}
          onClick={() => setView('preview')}
        >
          Просмотр
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${view === 'settings' ? styles.tabBtnActive : ''}`}
          onClick={() => setView('settings')}
        >
          Настройки
        </button>
        <button
          type="button"
          className={styles.tabBtn}
          onClick={() => router.push(`/employees/${id}`)}
        >
          Закрыть
        </button>
        <button
          type="button"
          className={styles.tabBtnPrimary}
          disabled={busy}
          onClick={() => void saveSettings()}
        >
          Сохранить
        </button>
        <button
          type="button"
          className={styles.tabBtn}
          disabled={busy}
          onClick={() => void resetSettings()}
        >
          Сбросить
        </button>
      </div>

      {savedMsg ? <p className={styles.ok}>{savedMsg}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {view === 'filter' ? (
        <div className={`${styles.filterPanel} ${styles.noPrint}`}>
          <h3 className={styles.panelTitle}>Фильтр периода</h3>
          <div className={styles.filterRow}>
            <label>
              С
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              По
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button
              type="button"
              className={styles.tabBtnPrimary}
              onClick={() => {
                void load();
                setView('preview');
              }}
            >
              Применить
            </button>
          </div>
          <div className={styles.checkGrid}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={!!settings.includeDismissed}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, includeDismissed: e.target.checked }))
                }
              />
              Отображать уволенных либо еще не принятых на работу
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={!!settings.showDynamicFields}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, showDynamicFields: e.target.checked }))
                }
              />
              Показать динамические поля сотрудника
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={!!settings.showDivisionDynamicFields}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    showDivisionDynamicFields: e.target.checked,
                  }))
                }
              />
              Показать динамические поля подразделений
            </label>
          </div>
        </div>
      ) : null}

      {view === 'settings' ? (
        <div className={`${styles.settingsPage} ${styles.noPrint}`}>
          <div className={styles.settingsTitleRow}>
            <h1 className={styles.settingsH1}>
              {data.title || KIND_LABELS[kind] || 'Отчет'}
            </h1>
            <span className={styles.settingsGear} aria-hidden>
              ⚙
            </span>
          </div>
          <div className={styles.settingsColumns}>
            {SETTINGS_COLUMNS.map((col, ci) => (
              <div key={ci} className={styles.settingsCol}>
                {col.map((g) => (
                  <div key={g.title} className={styles.settingsCard}>
                    <div className={styles.settingsHead}>{g.title}</div>
                    <div className={styles.settingsBody}>
                      {g.items.map((item) => (
                        <label key={item.key} className={styles.check}>
                          {item.toggle ? (
                            <>
                              <span
                                className={`${styles.toggle} ${
                                  settings[item.key] ? styles.toggleOn : ''
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setSettings((s) => ({
                                    ...s,
                                    [item.key]: !s[item.key],
                                  }));
                                }}
                                role="switch"
                                aria-checked={!!settings[item.key]}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSettings((s) => ({
                                      ...s,
                                      [item.key]: !s[item.key],
                                    }));
                                  }
                                }}
                              />
                              <span className={styles.toggleLabel}>
                                {item.label}
                                <em>{settings[item.key] ? 'Да' : 'Нет'}</em>
                              </span>
                            </>
                          ) : (
                            <>
                              <input
                                type="checkbox"
                                checked={!!settings[item.key]}
                                onChange={(e) =>
                                  setSettings((s) => ({
                                    ...s,
                                    [item.key]: e.target.checked,
                                  }))
                                }
                              />
                              {item.label}
                            </>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {view === 'preview' ? (
        isDiscipline ? (
          <DisciplineReportSheet
            title={data.title || 'Отчет по дисциплине посещений'}
            generatedAt={data.generatedAt}
            from={data.from}
            to={data.to}
            rows={(data.rows || []) as DisciplineRow[]}
          />
        ) : (
        <div className={styles.reportSheet}>
          <div className={styles.reportTop}>
            <div className={styles.reportBrand}>HR Hub</div>
            <h1 className={styles.reportTitle}>
              {data.title || KIND_LABELS[kind] || 'Отчет'} ({genLabel}) (
              {data.employee.fullName})
            </h1>
            <div className={`${styles.reportActions} ${styles.noPrint}`}>
              <button
                type="button"
                className={styles.printBtn}
                onClick={() => window.print()}
              >
                <i className="fas fa-print" aria-hidden /> Печать
              </button>
              <button
                type="button"
                className={styles.printBtn}
                onClick={() => void exportExcel()}
              >
                <i className="fas fa-file-excel" aria-hidden /> Excel
              </button>
            </div>
          </div>

          <div className={styles.reportMeta}>
            {(settings.showFullName !== false || !('showFullName' in settings)) && (
              <div>
                <span>Сотрудник:</span> <strong>{data.employee.fullName}</strong>
              </div>
            )}
            <div>
              <span>Период:</span>{' '}
              <strong>{fmtPeriodRu(data.from, data.to)}</strong>
            </div>
            {settings.showTabNumber ? (
              <div>
                <span>Таб. номер:</span> <strong>{data.employee.tabNumber}</strong>
              </div>
            ) : null}
            {settings.showPosition ? (
              <div>
                <span>Должность:</span>{' '}
                <strong>{data.employee.position || '—'}</strong>
              </div>
            ) : null}
            {settings.showAltName ? (
              <div>
                <span>Альт. имя:</span> <strong>{data.employee.fullName}</strong>
              </div>
            ) : null}
            {settings.showDivision ? (
              <div>
                <span>Подразделение:</span>{' '}
                <strong>{data.employee.division || '—'}</strong>
              </div>
            ) : null}
            {settings.showDivisionCode ? (
              <div>
                <span>Код подр.:</span>{' '}
                <strong>{data.employee.divisionCode || '—'}</strong>
              </div>
            ) : null}
            {settings.showBranch ? (
              <div>
                <span>Филиал:</span> <strong>{data.employee.branch || '—'}</strong>
              </div>
            ) : null}
            {settings.showSchedule ? (
              <div>
                <span>График:</span> <strong>{data.employee.schedule || '—'}</strong>
              </div>
            ) : null}
            {settings.showManager ? (
              <div>
                <span>Руководитель:</span>{' '}
                <strong>{data.employee.manager || '—'}</strong>
              </div>
            ) : null}
            {settings.showGrade ? (
              <div>
                <span>Разряд:</span> <strong>{data.employee.grade || '—'}</strong>
              </div>
            ) : null}
            {settings.showRegion ? (
              <div>
                <span>Регион:</span> <strong>{data.employee.region || '—'}</strong>
              </div>
            ) : null}
            {settings.showLocation ? (
              <div>
                <span>Локация:</span>{' '}
                <strong>{data.employee.location || '—'}</strong>
              </div>
            ) : null}
            {settings.showHireDate ? (
              <div>
                <span>Дата приема:</span>{' '}
                <strong>{fmtDateSlash(data.employee.hiredAt)}</strong>
              </div>
            ) : null}
            {settings.showEmail ? (
              <div>
                <span>E-mail:</span> <strong>{data.employee.email || '—'}</strong>
              </div>
            ) : null}
          </div>

          {data.summary &&
          (settings.showDaysWorked ||
            settings.showPlannedDays ||
            settings.showLate ||
            settings.showEarlyLeave ||
            settings.showHoursWorked) ? (
            <div className={styles.summaryStrip}>
              {settings.showDaysWorked ? (
                <div>
                  <strong>{data.summary.daysWorked ?? 0}</strong>
                  <span>Отработано дней</span>
                </div>
              ) : null}
              {settings.showPlannedDays ? (
                <div>
                  <strong>{data.summary.plannedDays ?? 0}</strong>
                  <span>Дни по плану</span>
                </div>
              ) : null}
              {settings.showHoursWorked ? (
                <div>
                  <strong>{data.summary.hoursWorked ?? 0}</strong>
                  <span>Отработано часов</span>
                </div>
              ) : null}
              {settings.showLate ? (
                <div>
                  <strong>{data.summary.lateMinutes ?? 0}</strong>
                  <span>Опоздания (мин)</span>
                </div>
              ) : null}
              {settings.showEarlyLeave ? (
                <div>
                  <strong>{data.summary.earlyMinutes ?? 0}</strong>
                  <span>Ранний уход (мин)</span>
                </div>
              ) : null}
              {settings.fineLate ? (
                <div>
                  <strong>{data.totals?.fineLateMinutes ?? 0}</strong>
                  <span>Штраф опозд. (мин)</span>
                </div>
              ) : null}
              {settings.fineEarly ? (
                <div>
                  <strong>{data.totals?.fineEarlyMinutes ?? 0}</strong>
                  <span>Штраф ран. (мин)</span>
                </div>
              ) : null}
              {settings.fineAbsent ? (
                <div>
                  <strong>{data.totals?.fineAbsentHours ?? 0}</strong>
                  <span>Штраф прогул (ч)</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {isAttendance ? (
            showDaily ? (
            <div className={styles.attWrap}>
              <table className={styles.attTable}>
                <thead>
                  <tr>
                    <th rowSpan={2}>Дата</th>
                    <th rowSpan={2}>День</th>
                    <th colSpan={3}>План</th>
                    {showFact ? (
                      <th
                        colSpan={showWorkedCol ? 3 : 2}
                        className={styles.factHead}
                      >
                        Факт
                      </th>
                    ) : null}
                    {showAbs ? <th rowSpan={2}>Отсутствие по причине</th> : null}
                    <th rowSpan={2}>Вовремя</th>
                    {showAbs ? <th colSpan={2}>Отсутствие</th> : null}
                    {showLateCol ? <th rowSpan={2}>Опоздание</th> : null}
                    {showEarlyCol ? <th rowSpan={2}>Ранний уход</th> : null}
                    {showOvertimeCol ? <th rowSpan={2}>Сверхурочно</th> : null}
                    {showWorkCoeffCol ? <th rowSpan={2}>Коэфф.</th> : null}
                    {showFineLate ? <th rowSpan={2}>Штраф опозд.</th> : null}
                    {showFineEarly ? <th rowSpan={2}>Штраф ран.</th> : null}
                    {showFineAbsent ? <th rowSpan={2}>Штраф прогул</th> : null}
                    {showWorkedPen ? (
                      <th rowSpan={2}>Отраб. со штрафом</th>
                    ) : null}
                    <th rowSpan={2}>Итого</th>
                  </tr>
                  <tr>
                    <th>Приход</th>
                    <th>Уход</th>
                    <th>Норма</th>
                    {showFact ? (
                      <>
                        <th className={styles.factHead}>Приход</th>
                        <th className={styles.factHead}>Уход</th>
                        {showWorkedCol ? (
                          <th className={styles.factHead}>Отработано</th>
                        ) : null}
                      </>
                    ) : null}
                    {showAbs ? (
                      <>
                        <th>По причине</th>
                        <th>Без причины</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {(data.rows ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={10 + (showFact ? (showWorkedCol ? 3 : 2) : 0) + extraColCount}
                        className={styles.empty}
                      >
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    (data.rows ?? []).map((row) => {
                      const extras = (
                        <>
                          {showLateCol ? (
                            <td>{num(row.lateMinutes)}</td>
                          ) : null}
                          {showEarlyCol ? (
                            <td>{num(row.earlyLeaveMinutes)}</td>
                          ) : null}
                          {showOvertimeCol ? (
                            <td>{num(row.overtimeHours)}</td>
                          ) : null}
                          {showWorkCoeffCol ? (
                            <td>{num(row.workCoeff)}</td>
                          ) : null}
                          {showFineLate ? (
                            <td>{num(row.fineLateMinutes)}</td>
                          ) : null}
                          {showFineEarly ? (
                            <td>{num(row.fineEarlyMinutes)}</td>
                          ) : null}
                          {showFineAbsent ? (
                            <td>{num(row.fineAbsentHours)}</td>
                          ) : null}
                          {showWorkedPen ? (
                            <td>{num(row.workedWithPenalties)}</td>
                          ) : null}
                        </>
                      );
                      if (row.isWeekend) {
                        const rest =
                          (showFact ? (showWorkedCol ? 3 : 2) : 0) +
                          (showAbs ? 3 : 0) +
                          1 +
                          extraColCount +
                          1;
                        return (
                          <tr key={String(row.date)} className={styles.weekendRow}>
                            <td className={styles.dateLink}>
                              {fmtDateSlash(String(row.date))}
                            </td>
                            <td>{row.day}</td>
                            <td colSpan={3} className={styles.dayOffCell}>
                              Выходной день
                            </td>
                            <td colSpan={rest} />
                          </tr>
                        );
                      }
                      if (row.isNoShow) {
                        return (
                          <tr key={String(row.date)}>
                            <td className={styles.dateLink}>
                              {fmtDateSlash(String(row.date))}
                            </td>
                            <td>{row.day}</td>
                            <td>{row.planIn || ''}</td>
                            <td>{row.planOut || ''}</td>
                            <td>{numOrZero(row.planNorm)}</td>
                            {showFact ? (
                              <td
                                colSpan={showWorkedCol ? 3 : 2}
                                className={styles.noShowCell}
                              >
                                Не пришел
                              </td>
                            ) : null}
                            {showAbs ? <td>{row.absenceReason || ''}</td> : null}
                            <td />
                            {showAbs ? (
                              <>
                                <td>{num(row.absenceWithReason)}</td>
                                <td>{numOrZero(row.absenceWithoutReason)}</td>
                              </>
                            ) : null}
                            {extras}
                            <td />
                          </tr>
                        );
                      }
                      return (
                        <tr key={String(row.date)}>
                          <td className={styles.dateLink}>
                            {fmtDateSlash(String(row.date))}
                          </td>
                          <td>{row.day}</td>
                          <td>{row.planIn || ''}</td>
                          <td>{row.planOut || ''}</td>
                          <td>{numOrZero(row.planNorm)}</td>
                          {showFact ? (
                            <>
                              <td className={styles.factCell}>
                                {fmtHm(row.factIn as string)}
                              </td>
                              <td className={styles.factCell}>
                                {row.isIncomplete
                                  ? 'xx:xx'
                                  : fmtHm(row.factOut as string)}
                              </td>
                              {showWorkedCol ? (
                                <td className={styles.factCell}>
                                  {row.isIncomplete ? '' : num(row.hoursWorked)}
                                </td>
                              ) : null}
                            </>
                          ) : null}
                          {showAbs ? <td>{row.absenceReason || ''}</td> : null}
                          <td>{num(row.onTimeHours)}</td>
                          {showAbs ? (
                            <>
                              <td>{num(row.absenceWithReason)}</td>
                              <td>{numOrZero(row.absenceWithoutReason)}</td>
                            </>
                          ) : null}
                          {extras}
                          <td>{num(row.total)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {data.totals ? (
                  <tfoot>
                    <tr className={styles.totalRow}>
                      <td colSpan={2}>
                        <strong>Итого</strong>
                      </td>
                      <td colSpan={2} />
                      <td>
                        <strong>{numOrZero(data.totals.planNorm)}</strong>
                      </td>
                      {showFact ? (
                        <>
                          <td className={styles.factCell} colSpan={2} />
                          {showWorkedCol ? (
                            <td className={styles.factCell}>
                              <strong>{num(data.totals.hoursWorked)}</strong>
                            </td>
                          ) : null}
                        </>
                      ) : null}
                      {showAbs ? <td /> : null}
                      <td>
                        <strong>{num(data.totals.onTimeHours)}</strong>
                      </td>
                      {showAbs ? (
                        <>
                          <td>
                            <strong>{num(data.totals.absenceWithReason)}</strong>
                          </td>
                          <td>
                            <strong>
                              {numOrZero(data.totals.absenceWithoutReason)}
                            </strong>
                          </td>
                        </>
                      ) : null}
                      {showLateCol ? (
                        <td>
                          <strong>{num(data.totals.lateMinutes)}</strong>
                        </td>
                      ) : null}
                      {showEarlyCol ? (
                        <td>
                          <strong>{num(data.totals.earlyLeaveMinutes)}</strong>
                        </td>
                      ) : null}
                      {showOvertimeCol ? (
                        <td>
                          <strong>{num(data.totals.overtimeHours)}</strong>
                        </td>
                      ) : null}
                      {showWorkCoeffCol ? <td /> : null}
                      {showFineLate ? (
                        <td>
                          <strong>{num(data.totals.fineLateMinutes)}</strong>
                        </td>
                      ) : null}
                      {showFineEarly ? (
                        <td>
                          <strong>{num(data.totals.fineEarlyMinutes)}</strong>
                        </td>
                      ) : null}
                      {showFineAbsent ? (
                        <td>
                          <strong>{num(data.totals.fineAbsentHours)}</strong>
                        </td>
                      ) : null}
                      {showWorkedPen ? <td /> : null}
                      <td>
                        <strong>{num(data.totals.total)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            ) : (
              <p className={styles.legend}>
                Ежедневные строки скрыты (настройка «по строкам» выключена). Включите
                в Настройках или смотрите сводку выше.
              </p>
            )
          ) : (
            <div className={styles.panel}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.rows ?? []).length === 0 ? (
                    <tr>
                      <td className={styles.empty} colSpan={Math.max(1, columns.length)}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    (data.rows ?? []).map((row, i) => (
                      <tr key={i}>
                        {columns.map((c) => (
                          <td key={c}>
                            {c === 'status' && typeof row[c] === 'string'
                              ? statusRu(String(row[c]))
                              : cell(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {settings.showMarkDetails && (data.marksSample?.length ?? 0) > 0 ? (
            <div className={styles.panel}>
              <div className={styles.panelHead}>Детали отметок</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Направление</th>
                    <th>Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {data.marksSample!.map((m, i) => (
                    <tr key={i}>
                      <td>{cell(m.occurredAt)}</td>
                      <td>{cell(m.direction)}</td>
                      <td>{cell(m.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {settings.showColorLegend && isAttendance ? (
            <p className={styles.legend}>
              Легенда: жёлтый — факт · голубой — выходной · розовый — не пришёл
            </p>
          ) : null}
        </div>
        )
      ) : null}
    </div>
  );
}
