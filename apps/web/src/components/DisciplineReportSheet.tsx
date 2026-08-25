'use client';

import { useMemo, useState } from 'react';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import styles from './DisciplineReportSheet.module.css';

export type DisciplineRow = {
  employeeId?: string;
  tabNumber?: string;
  fullName?: string;
  division?: string;
  position?: string;
  grade?: string;
  lateCount?: number;
  lateAvgMinutes?: number;
  lateMaxMinutes?: number;
  absentCount?: number;
  onTimeCount?: number;
  earlyCount?: number;
  earlyAvgMinutes?: number;
  earlyMaxMinutes?: number;
  dayOffCount?: number;
  [key: string]: unknown;
};

export type DisciplineTab =
  | 'late'
  | 'absent'
  | 'onTime'
  | 'early'
  | 'dayOff'
  | 'total';

export const DISCIPLINE_TABS: { id: DisciplineTab; label: string }[] = [
  { id: 'late', label: 'Опоздания' },
  { id: 'absent', label: 'Отсутствия' },
  { id: 'onTime', label: 'Вовремя' },
  { id: 'early', label: 'Ранние уходы' },
  { id: 'dayOff', label: 'Выходные' },
  { id: 'total', label: 'Итого' },
];
const TABS = DISCIPLINE_TABS;

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

export function fmtPeriodRu(from?: string | null, to?: string | null) {
  const one = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
  };
  return `${one(from)} - ${one(to)}`;
}

export function fmtGen(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Minutes → HH:MM */
export function fmtMinutesHm(mins?: number | null) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function filterRows(rows: DisciplineRow[], tab: DisciplineTab) {
  const list = (() => {
    switch (tab) {
      case 'late':
        return rows.filter((r) => (r.lateCount ?? 0) > 0);
      case 'absent':
        return rows.filter((r) => (r.absentCount ?? 0) > 0);
      case 'onTime':
        return rows.filter((r) => (r.onTimeCount ?? 0) > 0);
      case 'early':
        return rows.filter((r) => (r.earlyCount ?? 0) > 0);
      case 'dayOff':
        return rows.filter((r) => (r.dayOffCount ?? 0) > 0);
      case 'total':
        return rows.filter(
          (r) =>
            (r.lateCount ?? 0) +
              (r.absentCount ?? 0) +
              (r.onTimeCount ?? 0) +
              (r.earlyCount ?? 0) +
              (r.dayOffCount ?? 0) >
            0,
        );
      default:
        return rows;
    }
  })();
  const metric = (r: DisciplineRow) => {
    if (tab === 'late') return r.lateCount ?? 0;
    if (tab === 'absent') return r.absentCount ?? 0;
    if (tab === 'onTime') return r.onTimeCount ?? 0;
    if (tab === 'early') return r.earlyCount ?? 0;
    if (tab === 'dayOff') return r.dayOffCount ?? 0;
    return (r.lateCount ?? 0) + (r.absentCount ?? 0) + (r.earlyCount ?? 0);
  };
  return [...list].sort((a, b) => metric(b) - metric(a) || (a.fullName || '').localeCompare(b.fullName || '', 'ru'));
}

export type DisciplineCol = {
  key: string;
  label: string;
  render: (row: DisciplineRow) => string | number;
};
type Col = DisciplineCol;

export function columnsFor(tab: DisciplineTab): Col[] {
  const base: Col[] = [
    {
      key: 'tabNumber',
      label: 'Табельный номер',
      render: (r) => r.tabNumber || '—',
    },
    {
      key: 'fullName',
      label: 'Сотрудник',
      render: (r) => r.fullName || '—',
    },
    {
      key: 'division',
      label: 'Подразделение',
      render: (r) => r.division || '—',
    },
    {
      key: 'position',
      label: 'Должность',
      render: (r) => r.position || '—',
    },
    {
      key: 'grade',
      label: 'Разряд',
      render: (r) => r.grade || '—',
    },
  ];

  if (tab === 'late') {
    return [
      ...base,
      {
        key: 'lateCount',
        label: 'Кол-во опозданий',
        render: (r) => r.lateCount ?? 0,
      },
      {
        key: 'lateAvg',
        label: 'Опоздание (сред.)',
        render: (r) => fmtMinutesHm(r.lateAvgMinutes),
      },
      {
        key: 'lateMax',
        label: 'Опоздание (макс.)',
        render: (r) => fmtMinutesHm(r.lateMaxMinutes),
      },
    ];
  }
  if (tab === 'absent') {
    return [
      ...base,
      {
        key: 'absentCount',
        label: 'Кол-во отсутствий',
        render: (r) => r.absentCount ?? 0,
      },
    ];
  }
  if (tab === 'onTime') {
    return [
      ...base,
      {
        key: 'onTimeCount',
        label: 'Кол-во приходов вовремя',
        render: (r) => r.onTimeCount ?? 0,
      },
    ];
  }
  if (tab === 'early') {
    return [
      ...base,
      {
        key: 'earlyCount',
        label: 'Кол-во ранних уходов',
        render: (r) => r.earlyCount ?? 0,
      },
      {
        key: 'earlyAvg',
        label: 'Ранний уход (сред.)',
        render: (r) => fmtMinutesHm(r.earlyAvgMinutes),
      },
      {
        key: 'earlyMax',
        label: 'Ранний уход (макс.)',
        render: (r) => fmtMinutesHm(r.earlyMaxMinutes),
      },
    ];
  }
  if (tab === 'dayOff') {
    return [
      ...base,
      {
        key: 'dayOffCount',
        label: 'Выходные дни',
        render: (r) => r.dayOffCount ?? 0,
      },
    ];
  }
  return [
    ...base,
    {
      key: 'lateCount',
      label: 'Кол-во опозданий',
      render: (r) => r.lateCount ?? 0,
    },
    {
      key: 'absentCount',
      label: 'Кол-во отсутствий',
      render: (r) => r.absentCount ?? 0,
    },
    {
      key: 'onTimeCount',
      label: 'Кол-во приходов вовремя',
      render: (r) => r.onTimeCount ?? 0,
    },
    {
      key: 'earlyCount',
      label: 'Кол-во ранних уходов',
      render: (r) => r.earlyCount ?? 0,
    },
    {
      key: 'dayOffCount',
      label: 'Выходные дни',
      render: (r) => r.dayOffCount ?? 0,
    },
  ];
}

type Props = {
  title?: string;
  generatedAt?: string | null;
  from?: string | null;
  to?: string | null;
  rows: DisciplineRow[];
  onPrint?: () => void;
  onExcel?: () => void;
  excelBusy?: boolean;
  initialTab?: DisciplineTab;
  onEmployeeClick?: (row: DisciplineRow) => void;
};

export function DisciplineReportSheet({
  title = 'Отчет по дисциплине посещений',
  generatedAt,
  from,
  to,
  rows,
  onPrint,
  onExcel,
  excelBusy,
  initialTab = 'late',
  onEmployeeClick,
}: Props) {
  const [tab, setTab] = useState<DisciplineTab>(initialTab);
  const cols = useMemo(() => columnsFor(tab), [tab]);
  const visible = useMemo(() => filterRows(rows, tab), [rows, tab]);
  const gen = fmtGen(generatedAt);

  async function exportXlsx() {
    const header = ['№', ...cols.map((c) => c.label)];
    const dataRows = visible.map((row, i) => [
      i + 1,
      ...cols.map((c) => c.render(row)),
    ]);
    await downloadStyledXlsx({
      filename: `Отчет-по-дисциплине-${tab}.xlsx`,
      sheetName: TABS.find((t) => t.id === tab)?.label || 'Дисциплина',
      title,
      subtitle: `Период: ${fmtPeriodRu(from, to)}${gen ? ` · ${gen}` : ''}`,
      columns: header,
      rows: dataRows,
      colWidths: [6, 14, 28, 18, 16, 10, 14, 14, 14, 14, 12],
    });
  }

  return (
    <div className={styles.sheet}>
      <div className={styles.top}>
        <div className={styles.brandRow}>
          <span className={styles.brand}>HR Hub</span>
          <h1 className={styles.title}>
            {title}
            {gen ? ` (${gen})` : ''}
          </h1>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => (onPrint ? onPrint() : window.print())}
          >
            <i className="fas fa-print" aria-hidden /> Печать
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            disabled={excelBusy}
            onClick={() => (onExcel ? onExcel() : void exportXlsx())}
          >
            <i className="fas fa-cloud-download-alt" aria-hidden /> Excel
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.period}>
        <strong>Период:</strong> {fmtPeriodRu(from, to)}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>№</th>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={cols.length + 1}>
                  Нет данных
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr key={String(row.employeeId || row.tabNumber || i)}>
                  <td className={styles.num}>{i + 1}</td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={
                        c.key === 'fullName' ? styles.name : styles.num
                      }
                    >
                      {c.key === 'fullName' && onEmployeeClick && row.employeeId ? (
                        <button
                          type="button"
                          className={styles.nameLink}
                          onClick={() => onEmployeeClick(row)}
                        >
                          {c.render(row)}
                        </button>
                      ) : (
                        c.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
