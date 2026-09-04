'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import empS from '../employees/page.module.css';
import att from '../attendance-overview/page.module.css';
import s from './page.module.css';
import SettingsPanel from './SettingsPanel';
import {
  DEFAULT_SETTINGS,
  FILTER_TPL_KEY,
  SETTINGS_KEY,
  SETTINGS_TPL_KEY,
  normalizeSettings,
  type GroupedSettings,
} from './settings';

type Tab = 'filter' | 'view' | 'settings';
type ViewTab = 'main' | 'byDiv' | 'divs';
type PosType = 'all' | 'primary' | 'secondary';
type Opt = {
  id: string;
  label: string;
  tabNumber?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  employmentType?: string;
  name?: string;
};
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Row = {
  n: number;
  employee: string;
  divisionGroup: string;
  divisionCode: string;
  division: string;
  orgUnit: string;
  position: string;
  positionType: string;
  tabNumber: string;
  grade: string;
  schedule: string;
  bankAccount: string;
  pinfl: string;
  inps: string;
  salary: number;
  planDays: number;
  planHours: number;
  workedDays: number | null;
  workedHours: number | null;
  overtimeDays: number | null;
  overtimeHours: number | null;
  schedulePlan: number | null;
  scheduleFact: number | null;
  loan: number;
  advance: number;
  travelAdvance: number;
  ndfl: number;
  inpsAmount: number;
  deductionTotal: number;
  toPay: number;
  sheet: number;
  difference: number;
  periodFrom?: string;
  periodTo?: string;
};
type DivRow = {
  n: number;
  divisionGroup: string;
  divisionCode: string;
  division: string;
  salary: number;
  planDays: number;
  planHours: number;
  workedDays: number;
  workedHours: number;
  overtimeDays: number;
  overtimeHours: number;
  schedulePlan: number;
  scheduleFact: number;
  loan: number;
  advance: number;
  travelAdvance: number;
  ndfl: number;
  inpsAmount: number;
  deductionTotal: number;
  toPay: number;
  sheet: number;
  difference: number;
};
type Payload = {
  title: string;
  year: number;
  month: number;
  periodLine: string;
  positionTypeLabel: string;
  dataSource?: string;
  generatedAt?: string;
  dynamicColumns?: { key: string; label: string; group: string; money: boolean }[];
  rows: Row[];
  byDivisionRows: Row[];
  divisionRows: DivRow[];
};
type SettingsTpl = { id: string; name: string; settings: GroupedSettings };
type FilterTpl = {
  id: string;
  name: string;
  year: number;
  month: number;
  divisionIds: string[];
  positionIds: string[];
  employeeIds: string[];
  positionType: PosType;
};

const TITLE = 'Итоговый отчет по начислениям с группировками';
const FILE_BASE = 'Итоговый-отчет-по-начислениям-с-группировками';
const MONTHS_LONG = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];
const MONTHS_SHORT = [
  'янв.', 'февр.', 'март', 'апр.', 'май', 'июнь',
  'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
];
const EXTRA_POSITIONS: Opt[] = [
  { id: 'ANALITIK', label: 'ANALITIK' },
  { id: 'AUDIT OPERATOR', label: 'AUDIT OPERATOR' },
  { id: 'AUDITOR', label: 'AUDITOR' },
  { id: 'BIZNES ANALITIK', label: 'BIZNES ANALITIK' },
  { id: 'BIZNES TRENER', label: 'BIZNES TRENER' },
  { id: 'BRAND MANAGER', label: 'BRAND MANAGER' },
  { id: 'BUXGALTER', label: 'BUXGALTER' },
  { id: 'CEO', label: 'CEO' },
];

function money(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt(v: number | null | undefined, asMoney = false) {
  if (v == null || Number.isNaN(Number(v))) return '';
  return asMoney ? money(Number(v)) : String(v);
}
function fileStamp(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}+${hh}_${mi}_${ss}`;
}
function escapeHtml(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function empName(o: Opt) {
  const name = [o.lastName, o.firstName, o.middleName].filter(Boolean).join(' ').trim();
  return (name || o.label || '').toUpperCase();
}
function empKind(t?: string) {
  if (!t) return 'Основное место работы';
  const x = t.toLowerCase();
  if (x === 'gph') return 'ГПХ';
  if (x.includes('совм') || x === 'part_time' || x === 'secondary') return 'Совместительство';
  return 'Основное место работы';
}
function mergeOpts(base: Opt[], extra: Opt[]) {
  const seen = new Set(base.map((o) => o.label.toLowerCase()));
  const out = [...base];
  for (const o of extra) {
    if (!seen.has(o.label.toLowerCase())) {
      seen.add(o.label.toLowerCase());
      out.push(o);
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}
function flattenTree(nodes: TreeNode[], q: string): TreeNode[] {
  const qq = q.trim().toLowerCase();
  const walk = (list: TreeNode[]): TreeNode[] =>
    list
      .map((n) => {
        const kids = walk(n.children || []);
        if (!qq || n.name.toLowerCase().includes(qq) || kids.length) return { ...n, children: kids };
        return null;
      })
      .filter(Boolean) as TreeNode[];
  return walk(nodes);
}
function collectIds(node: TreeNode): string[] {
  return [node.id, ...(node.children || []).flatMap(collectIds)];
}

function MonthPicker({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  useEffect(() => {
    if (open) setViewYear(year);
  }, [open, year]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className={s.monthWrap} ref={wrapRef}>
      <button type="button" className={s.monthBtn} onClick={() => setOpen((v) => !v)}>
        <span>{MONTHS_LONG[month - 1]} {year}</span>
        <i className="fa fa-calendar" aria-hidden />
      </button>
      {open ? (
        <div className={s.monthPopup}>
          <div className={s.monthYear}>
            <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="Предыдущий год">‹</button>
            <span>{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label="Следующий год">›</button>
          </div>
          <div className={s.monthGrid}>
            {MONTHS_SHORT.map((label, i) => {
              const m = i + 1;
              const on = viewYear === year && m === month;
              return (
                <button
                  type="button"
                  key={label}
                  className={on ? `${s.monthCell} ${s.monthOn}` : s.monthCell}
                  onClick={() => {
                    onChange(viewYear, m);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DivisionPick({
  nodes,
  selected,
  onChange,
}: {
  nodes: TreeNode[];
  selected: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = useMemo(() => flattenTree(nodes, q), [nodes, q]);
  function toggleNode(node: TreeNode, checked: boolean) {
    const next = new Set(selected);
    for (const id of collectIds(node)) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  }
  function renderNode(node: TreeNode, depth = 0): ReactNode {
    const kids = node.children || [];
    const isOpen = expanded.has(node.id) || !!q.trim() || depth === 0;
    const allIds = collectIds(node);
    const checked = allIds.every((id) => selected.has(id));
    return (
      <div key={node.id}>
        <div className={`${extra.treeRow} ${checked ? att.treeOn : ''}`} style={{ paddingLeft: depth * 14 }}>
          {kids.length ? (
            <button
              type="button"
              className={extra.exp}
              onClick={() =>
                setExpanded((prev) => {
                  const n = new Set(prev);
                  if (n.has(node.id)) n.delete(node.id);
                  else n.add(node.id);
                  return n;
                })
              }
            >
              {isOpen ? '−' : '+'}
            </button>
          ) : (
            <span className={extra.exp} />
          )}
          <input type="checkbox" className={att.box} checked={checked} onChange={(e) => toggleNode(node, e.target.checked)} />
          <button type="button" className={checked ? `${att.treeName} ${att.treeNameOn}` : att.treeName} onClick={() => toggleNode(node, !checked)}>
            {node.name}
          </button>
          {kids.length ? (
            <button type="button" className={treeS.selectAll} onClick={() => toggleNode(node, true)}>
              выбрать все
            </button>
          ) : null}
        </div>
        {isOpen ? kids.map((c) => renderNode(c, depth + 1)) : null}
      </div>
    );
  }
  return (
    <div className={`${att.dropWrap}${open ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button type="button" className={`${att.dropField}${selected.size ? '' : ` ${att.dropEmpty}`}`} onClick={() => setOpen((v) => !v)}>
        {selected.size ? `Выбрано: ${selected.size}` : 'Поиск...'}
      </button>
      <div className={att.dropPanel} hidden={!open}>
        {open ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            {filtered.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : filtered.map((n) => renderNode(n))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function FilterPick({
  options,
  selected,
  onChange,
}: {
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    return showAll || needle ? list : list.slice(0, 8);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={`${att.dropWrap}${open ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button type="button" className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`} onClick={() => setOpen((v) => !v)}>
        {selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
      </button>
      <div className={att.dropPanel} hidden={!open}>
        {open ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            {filtered.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${att.listRow} ${att.listOn}` : att.listRow} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={att.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.label}</span>
                </button>
              );
            })}
            {!showAll && !q.trim() && options.length > 8 ? (
              <button type="button" className={att.showAll} onClick={() => setShowAll(true)}>Показать все</button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmpPick({
  options,
  selected,
  onChange,
}: {
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? options.filter((o) => `${o.tabNumber || ''} ${empName(o)} ${empKind(o.employmentType)}`.toLowerCase().includes(needle))
      : options;
    return showAll || needle ? list : list.slice(0, 8);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={`${att.dropWrap}${open ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button type="button" className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`} onClick={() => setOpen((v) => !v)}>
        {selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
      </button>
      <div className={`${att.dropPanel} ${att.empWide}`} hidden={!open}>
        {open ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className={att.empHead} style={{ gridTemplateColumns: '28px 140px 1fr 1fr' }}>
              <span />
              <span>Табельный номер</span>
              <span>Сотрудник</span>
              <span>Вид занятости</span>
            </div>
            {filtered.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${att.empRow} ${att.empOn}` : att.empRow} style={{ gridTemplateColumns: '28px 140px 1fr 1fr' }} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={att.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.tabNumber || '—'}</span>
                  <span>{empName(o)}</span>
                  <span>{empKind(o.employmentType)}</span>
                </button>
              );
            })}
            {!showAll && !q.trim() && options.length > 8 ? (
              <button type="button" className={att.showAll} onClick={() => setShowAll(true)}>Показать все</button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

type ColDef = { key: string; label: string; group?: string; money?: boolean; name?: boolean };

const MAIN_COLS: ColDef[] = [
  { key: 'n', label: '№' },
  { key: 'employee', label: 'Сотрудник', name: true },
  { key: 'divisionGroup', label: 'Группа подразделений' },
  { key: 'divisionCode', label: 'Код подразделения' },
  { key: 'division', label: 'Подразделение', name: true },
  { key: 'orgUnit', label: 'Отдел', name: true },
  { key: 'position', label: 'Должность', name: true },
  { key: 'positionType', label: 'Тип позиции' },
  { key: 'tabNumber', label: 'Табельный номер' },
  { key: 'grade', label: 'Разряд' },
  { key: 'schedule', label: 'График работы' },
  { key: 'bankAccount', label: 'Расчетный счет' },
  { key: 'pinfl', label: 'ПИНФЛ' },
  { key: 'inps', label: 'номер ИНПС' },
  { key: 'salary', label: 'Оклад', money: true },
  { key: 'planDays', label: 'дней', group: 'План' },
  { key: 'planHours', label: 'часов', group: 'План' },
  { key: 'workedDays', label: 'дней', group: 'Отработано' },
  { key: 'workedHours', label: 'часов', group: 'Отработано' },
  { key: 'overtimeDays', label: 'дней', group: 'Сверхурочно' },
  { key: 'overtimeHours', label: 'часов', group: 'Сверхурочно' },
  { key: 'schedulePlan', label: 'План по расписанию', group: 'Расписание' },
  { key: 'scheduleFact', label: 'Факт по расписанию', group: 'Расписание' },
  { key: 'loan', label: 'Заем', group: 'ИТОГО', money: true },
  { key: 'advance', label: 'Аванс', group: 'ИТОГО', money: true },
  { key: 'travelAdvance', label: 'Командировочный аванс', group: 'ИТОГО', money: true },
  { key: 'ndfl', label: 'НДФЛ', group: 'ИТОГО', money: true },
  { key: 'inpsAmount', label: 'ИНПС', group: 'ИТОГО', money: true },
  { key: 'deductionTotal', label: 'Итого удержано', group: 'ИТОГО', money: true },
  { key: 'toPay', label: 'Начислено − Удержано', group: 'ИТОГО', money: true },
  { key: 'sheet', label: 'Ведомость', group: 'ИТОГО', money: true },
  { key: 'difference', label: 'Разница', group: 'ИТОГО', money: true },
];

const BYDIV_COLS: ColDef[] = [
  { key: 'n', label: '№' },
  { key: 'employee', label: 'Сотрудник', name: true },
  { key: 'positionType', label: 'Тип позиции' },
  { key: 'tabNumber', label: 'Табельный номер' },
  { key: 'bankAccount', label: 'Расчетный счет' },
  { key: 'pinfl', label: 'ПИНФЛ' },
  { key: 'inps', label: 'номер ИНПС' },
  { key: 'salary', label: 'Оклад', money: true },
  { key: 'loan', label: 'Заем', money: true },
  { key: 'advance', label: 'Аванс', money: true },
  { key: 'travelAdvance', label: 'Командировочный аванс', money: true },
  { key: 'sheet', label: 'Ведомость', money: true },
  { key: 'periodFrom', label: 'Начало периода' },
  { key: 'periodTo', label: 'Конец периода' },
  { key: 'divisionGroup', label: 'Группа подразделений' },
  { key: 'divisionCode', label: 'Код подразделения' },
  { key: 'division', label: 'Подразделение', name: true },
  { key: 'orgUnit', label: 'Отдел', name: true },
  { key: 'position', label: 'Должность', name: true },
  { key: 'grade', label: 'Разряд' },
  { key: 'schedule', label: 'График работы' },
  { key: 'planDays', label: 'дней', group: 'План' },
  { key: 'planHours', label: 'часов', group: 'План' },
  { key: 'workedDays', label: 'дней', group: 'Отработано' },
  { key: 'workedHours', label: 'часов', group: 'Отработано' },
  { key: 'overtimeDays', label: 'дней', group: 'Сверхурочно' },
  { key: 'overtimeHours', label: 'часов', group: 'Сверхурочно' },
  { key: 'schedulePlan', label: 'План по расписанию', group: 'Расписание' },
  { key: 'scheduleFact', label: 'Факт по расписанию', group: 'Расписание' },
  { key: 'ndfl', label: 'НДФЛ', group: 'Удержано', money: true },
  { key: 'inpsAmount', label: 'ИНПС', group: 'Удержано', money: true },
  { key: 'deductionTotal', label: 'Итого удержано', group: 'Удержано', money: true },
  { key: 'toPay', label: 'Начислено − Удержано', group: 'ИТОГО', money: true },
];

const DIV_COLS: ColDef[] = [
  { key: 'n', label: '№' },
  { key: 'divisionGroup', label: 'Группа подразделений' },
  { key: 'divisionCode', label: 'Код подразделения' },
  { key: 'division', label: 'Подразделение', name: true },
  { key: 'salary', label: 'Оклад', money: true },
  { key: 'planDays', label: 'дней', group: 'План' },
  { key: 'planHours', label: 'часов', group: 'План' },
  { key: 'workedDays', label: 'дней', group: 'Отработано' },
  { key: 'workedHours', label: 'часов', group: 'Отработано' },
  { key: 'overtimeDays', label: 'дней', group: 'Сверхурочно' },
  { key: 'overtimeHours', label: 'часов', group: 'Сверхурочно' },
  { key: 'schedulePlan', label: 'План по расписанию', group: 'Расписание' },
  { key: 'scheduleFact', label: 'Факт по расписанию', group: 'Расписание' },
  { key: 'loan', label: 'Заем', group: 'ИТОГО', money: true },
  { key: 'advance', label: 'Аванс', group: 'ИТОГО', money: true },
  { key: 'travelAdvance', label: 'Командировочный аванс', group: 'ИТОГО', money: true },
  { key: 'ndfl', label: 'НДФЛ', group: 'ИТОГО', money: true },
  { key: 'inpsAmount', label: 'ИНПС', group: 'ИТОГО', money: true },
  { key: 'deductionTotal', label: 'Итого удержано', group: 'ИТОГО', money: true },
  { key: 'toPay', label: 'Начислено − Удержано', group: 'ИТОГО', money: true },
  { key: 'sheet', label: 'Ведомость', group: 'ИТОГО', money: true },
  { key: 'difference', label: 'Разница', group: 'ИТОГО', money: true },
];

function settingAllows(key: string, settings: GroupedSettings): boolean {
  if (key === 'n' || key === 'employee' || key === 'periodFrom' || key === 'periodTo') return true;
  if (key.startsWith('dyn:') || key.startsWith('ag:') || key.startsWith('dg:') || key.startsWith('tg:')) return true;
  if (key === 'depositStart') return !!settings.depositStart;
  if (key === 'depositEnd') return !!settings.depositEnd;
  if (key === 'plannedSalary') return !!settings.plannedSalary;
  if (key === 'planDays' || key === 'planHours') return !!settings.plannedTime && !!(settings as Record<string, unknown>)[key];
  if (key === 'workedDays' || key === 'workedHours') return !!settings.workedTime && !!(settings as Record<string, unknown>)[key];
  if (key === 'overtimeDays' || key === 'overtimeHours') return !!settings.overtime && !!(settings as Record<string, unknown>)[key];
  const map: Record<string, keyof GroupedSettings> = {
    divisionGroup: 'divisionGroup',
    divisionCode: 'divisionCode',
    division: 'division',
    orgUnit: 'orgUnit',
    position: 'position',
    positionType: 'positionType',
    tabNumber: 'tabNumber',
    grade: 'grade',
    schedule: 'schedule',
    bankAccount: 'bankAccount',
    pinfl: 'pinfl',
    inps: 'inps',
    salary: 'salary',
    schedulePlan: 'schedulePlan',
    scheduleFact: 'scheduleFact',
    loan: 'loan',
    advance: 'advance',
    travelAdvance: 'travelAdvance',
    ndfl: 'ndfl',
    inpsAmount: 'inpsAmount',
    deductionTotal: 'deductionTotal',
    toPay: 'toPay',
    sheet: 'sheet',
    difference: 'difference',
  };
  const sk = map[key];
  if (!sk) return true;
  if (['loan', 'advance', 'travelAdvance', 'ndfl', 'inpsAmount', 'deductionTotal'].includes(key) && !settings.showDeductions) {
    return false;
  }
  if (['toPay', 'sheet', 'difference'].includes(key) && !settings.showTotals) return false;
  return !!settings[sk];
}

function visibleCols(defs: ColDef[], settings: GroupedSettings) {
  return defs.filter((c) => settingAllows(c.key, settings));
}

function dualHeader(cols: ColDef[]) {
  const top: { label: string; span: number }[] = [];
  for (const c of cols) {
    const g = c.group || c.label;
    const last = top[top.length - 1];
    if (last && last.label === g) last.span += 1;
    else top.push({ label: g, span: 1 });
  }
  return top;
}

function cellValue(row: Record<string, unknown>, col: ColDef) {
  const v = row[col.key];
  if (col.money) return fmt(v as number, true);
  if (typeof v === 'number') return fmt(v);
  return v == null ? '' : String(v);
}

export default function PayrollGroupedReportPage() {
  const now = new Date();
  const [tab, setTab] = useState<Tab>('filter');
  const [viewTab, setViewTab] = useState<ViewTab>('main');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [divisionIds, setDivisionIds] = useState<Set<string>>(new Set());
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [positionType, setPositionType] = useState<PosType>('all');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<GroupedSettings>(DEFAULT_SETTINGS);
  const [savedFlash, setSavedFlash] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [tplNew, setTplNew] = useState(false);
  const [tplName, setTplName] = useState('');
  const [templates, setTemplates] = useState<FilterTpl[]>([]);
  const [settingsTpls, setSettingsTpls] = useState<SettingsTpl[]>([]);
  const [accrualOpts, setAccrualOpts] = useState<Opt[]>([]);
  const [deductionOpts, setDeductionOpts] = useState<Opt[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings(normalizeSettings(JSON.parse(raw)));
      const tpls = localStorage.getItem(FILTER_TPL_KEY);
      if (tpls) setTemplates(JSON.parse(tpls) as FilterTpl[]);
      const st = localStorage.getItem(SETTINGS_TPL_KEY);
      if (st) setSettingsTpls(JSON.parse(st) as SettingsTpl[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [lookups, divisions] = await Promise.all([
          apiFetch<{
            positions?: Opt[];
            employees?: Opt[];
            accrualTypes?: Opt[];
            deductionTypes?: Opt[];
          }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setTree(divisions);
        setPositions(
          mergeOpts(
            (lookups.positions || []).map((p) => ({ id: p.id, label: (p.label || p.name || p.id).toUpperCase() })),
            EXTRA_POSITIONS,
          ),
        );
        setAccrualOpts((lookups.accrualTypes || []).map((a) => ({ id: a.id, label: a.label || a.name || a.id })));
        setDeductionOpts((lookups.deductionTypes || []).map((d) => ({ id: d.id, label: d.label || d.name || d.id })));
        let emps = lookups.employees || [];
        if (!emps.length) {
          const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/employees?limit=500').catch(() => [] as Opt[]);
          emps = Array.isArray(raw) ? raw : raw.items || [];
        }
        setEmployees(
          emps
            .map((e) => ({ ...e, tabNumber: e.tabNumber || '', label: empName(e) }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
        );
      } catch {
        /* optional */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('year', String(year));
    p.set('month', String(month));
    if (divisionIds.size) p.set('divisionIds', [...divisionIds].join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    if (positionType !== 'all') p.set('positionType', positionType);
    p.set('cfg', JSON.stringify(settings));
    return p.toString();
  }, [year, month, divisionIds, positionIds, employeeIds, positionType, settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/payroll-grouped?${queryQs}`);
      setReport(data);
      setLoadedQs(queryQs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [queryQs]);

  async function generate(e?: FormEvent) {
    e?.preventDefault();
    await load();
    setTab('view');
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSavedFlash('Настройки сохранены');
    window.setTimeout(() => setSavedFlash(''), 2000);
    if (tab === 'view' || report) void load();
  }
  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    setSavedFlash('Настройки сброшены');
    window.setTimeout(() => setSavedFlash(''), 2000);
  }

  function saveTemplate() {
    const name = tplName.trim();
    if (!name) return;
    const next = [
      ...templates,
      {
        id: `${Date.now()}`,
        name,
        year,
        month,
        divisionIds: [...divisionIds],
        positionIds,
        employeeIds,
        positionType,
      },
    ];
    setTemplates(next);
    localStorage.setItem(FILTER_TPL_KEY, JSON.stringify(next));
    setTplName('');
    setTplNew(false);
    setTplOpen(false);
  }

  function saveSettingsTemplate() {
    const name = window.prompt('Название шаблона настроек');
    if (!name?.trim()) return;
    const next = [...settingsTpls, { id: `${Date.now()}`, name: name.trim(), settings: JSON.parse(JSON.stringify(settings)) as GroupedSettings }];
    setSettingsTpls(next);
    localStorage.setItem(SETTINGS_TPL_KEY, JSON.stringify(next));
  }

  const activeCols = useMemo(() => {
    const base =
      viewTab === 'divs' ? DIV_COLS : viewTab === 'byDiv' ? BYDIV_COLS : MAIN_COLS;
    const cols = visibleCols(base, settings);
    const dyn = (report?.dynamicColumns || []).map(
      (c): ColDef => ({ key: c.key, label: c.label, group: c.group, money: c.money }),
    );
    const extra: ColDef[] = [];
    if (settings.plannedSalary && !cols.some((c) => c.key === 'plannedSalary')) {
      extra.push({ key: 'plannedSalary', label: 'Плановый оклад', money: true });
    }
    if (settings.depositStart) extra.push({ key: 'depositStart', label: 'Депозит на начало', money: true });
    if (settings.depositEnd) extra.push({ key: 'depositEnd', label: 'Депозит на конец', money: true });
    if (settings.emptyDateCol) extra.push({ key: 'emptyDate', label: 'Дата' });
    if (settings.emptySignCol) extra.push({ key: 'emptySign', label: 'Подпись' });
    return [...cols, ...dyn, ...extra];
  }, [viewTab, settings, report?.dynamicColumns]);

  const activeRows: Record<string, unknown>[] = useMemo(() => {
    if (!report) return [];
    if (viewTab === 'divs') return report.divisionRows as unknown as Record<string, unknown>[];
    if (viewTab === 'byDiv') return report.byDivisionRows as unknown as Record<string, unknown>[];
    return report.rows as unknown as Record<string, unknown>[];
  }, [report, viewTab]);

  function ensureReport() {
    if (!report || loadedQs !== queryQs) return load().then(() => true);
    return Promise.resolve(true);
  }

  async function exportExcel() {
    await ensureReport();
    const data = report;
    if (!data) return;
    const cols = activeCols;
    const header1 = dualHeader(cols);
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(data.generatedAt)}).xlsx`,
      title: TITLE,
      preamble: [data.periodLine, data.positionTypeLabel, ''],
      topHeader: header1.flatMap((h) => Array.from({ length: h.span }, (_, i) => (i === 0 ? h.label : ''))),
      columns: cols.map((c) => (c.group ? c.label : '')),
      rows: activeRows.map((r) => cols.map((c) => cellValue(r, c))),
    });
  }

  function exportCsv() {
    if (!report) return;
    const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const cols = activeCols;
    const top = dualHeader(cols).flatMap((h) => Array.from({ length: h.span }, () => h.label));
    const lines = [
      `${q(report.periodLine)};${';'.repeat(Math.max(0, cols.length - 1))}`,
      `${q(report.positionTypeLabel)};${';'.repeat(Math.max(0, cols.length - 1))}`,
      top.map(q).join(';'),
      cols.map((c) => q(c.group ? c.label : c.label)).join(';'),
      ...activeRows.map((r) => cols.map((c) => q(cellValue(r, c))).join(';')),
    ];
    downloadBlob(`${FILE_BASE}(${fileStamp(report.generatedAt)}).csv`, new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
  }

  function exportXml() {
    if (!report) return;
    const cols = activeCols;
    const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
    const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
    const top = dualHeader(cols).flatMap((h) => Array.from({ length: h.span }, () => h.label));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<t>
${row([report.periodLine, ...Array(Math.max(0, cols.length - 1)).fill('')])}
${row([report.positionTypeLabel, ...Array(Math.max(0, cols.length - 1)).fill('')])}
${row(top)}
${row(cols.map((c) => (c.group ? c.label : '')))}
${activeRows.map((r) => row(cols.map((c) => cellValue(r, c)))).join('\n')}
</t>
`;
    downloadBlob(`${FILE_BASE}(${fileStamp(report.generatedAt)}).xml`, new Blob([xml], { type: 'application/xml;charset=utf-8' }));
  }

  function exportHtml() {
    if (!report) return;
    const cols = activeCols;
    const top = dualHeader(cols);
    const head1 = top.map((g) => `<th colspan="${g.span}">${escapeHtml(g.label)}</th>`).join('');
    const head2 = cols.map((c) => `<th>${escapeHtml(c.group ? c.label : '')}</th>`).join('');
    const body = activeRows
      .map((r) => `<tr>${cols.map((c) => `<td class="${c.name ? 'name' : c.money ? 'num' : ''}">${escapeHtml(cellValue(r, c))}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(TITLE)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#0a85e2;font-weight:700;margin-right:10px}
table{border-collapse:collapse;font-size:10px}
th,td{border:1px solid #cfd3da;padding:2px 4px;text-align:center}
th{background:#eef0f4}
.name{text-align:left;white-space:normal}.num{text-align:right}
</style></head><body>
<div class="top"><div><span class="brand">HR Hub</span><strong>${escapeHtml(TITLE)}</strong></div></div>
<div style="padding:10px 16px">${escapeHtml(report.periodLine)}<br/>${escapeHtml(report.positionTypeLabel)}</div>
<div style="padding:0 16px 16px;overflow:auto"><table><thead><tr>${head1}</tr><tr>${head2}</tr></thead>
<tbody>${body || `<tr><td colspan="${cols.length}">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  const exportBtns = (icons: boolean) => (
    <>
      <button type="button" className={icons ? layout.iconBtn : layout.linkBtn} disabled={busy} onClick={() => void exportHtml()}>HTML</button>
      <button type="button" className={icons ? layout.iconBtn : layout.linkBtn} disabled={busy} onClick={() => void exportExcel()}>EXCEL</button>
      <button type="button" className={icons ? layout.iconBtn : layout.linkBtn} disabled={busy} onClick={() => void exportCsv()}>CSV</button>
      <button type="button" className={icons ? layout.iconBtn : layout.linkBtn} disabled={busy} onClick={() => void exportXml()}>XML</button>
    </>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>{TITLE}</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>ФИЛЬТР</button>
        <button
          type="button"
          className={tab === 'view' ? layout.tabOn : layout.tab}
          onClick={() => {
            setTab('view');
            if (!report) void generate();
          }}
        >
          ПРОСМОТР
        </button>
        <button type="button" className={tab === 'settings' ? layout.tabOn : layout.tab} onClick={() => setTab('settings')}>НАСТРОЙКИ</button>
        {tab === 'settings' ? (
          <>
            <button type="button" className={layout.tab} onClick={saveSettings}>СОХРАНИТЬ</button>
            <button type="button" className={layout.tab} onClick={resetSettings}>СБРОСИТЬ</button>
            <button type="button" className={layout.linkBtn} onClick={saveSettingsTemplate}>Шаблон настроек</button>
            {settingsTpls.length ? (
              <select
                className={s.groupName}
                style={{ maxWidth: 180, marginLeft: 4 }}
                defaultValue=""
                onChange={(e) => {
                  const t = settingsTpls.find((x) => x.id === e.target.value);
                  if (t) setSettings(normalizeSettings(t.settings));
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Загрузить шаблон…
                </option>
                {settingsTpls.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        ) : null}
        {tab === 'view' ? (
          <>
            <button type="button" className={layout.iconBtn} disabled={busy} aria-label="Обновить" onClick={() => void load()}>
              <i className="fas fa-sync-alt" aria-hidden />
            </button>
            {exportBtns(true)}
          </>
        ) : null}
      </div>
      {error ? <p className={layout.error}>{error}</p> : null}

      {tab === 'filter' ? (
        <form className={`${layout.card} ${s.card}`} onSubmit={(e) => void generate(e)}>
          <div className={s.filterGrid}>
            <div className={layout.field}>
              <label>Месяц <span className={s.req}>*</span></label>
              <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
            </div>
            <div className={layout.field}>
              <label>Шаблоны</label>
              <div className={s.tplWrap}>
                <button type="button" className={s.tplBtn} onClick={() => { setTplOpen((v) => !v); setTplNew(false); }}>
                  Создать шаблон
                </button>
                {tplOpen ? (
                  <div className={s.tplPanel}>
                    {!tplNew ? (
                      <>
                        {templates.map((t) => (
                          <button
                            type="button"
                            key={t.id}
                            className={att.listRow}
                            onClick={() => {
                              setYear(t.year);
                              setMonth(t.month);
                              setDivisionIds(new Set(t.divisionIds));
                              setPositionIds(t.positionIds);
                              setEmployeeIds(t.employeeIds);
                              setPositionType(t.positionType);
                              setTplOpen(false);
                            }}
                          >
                            {t.name}
                          </button>
                        ))}
                        <button type="button" className={layout.linkBtn} onClick={() => setTplNew(true)}>+ Новый шаблон</button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Новый шаблон</div>
                        <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Название" />
                        <div className={s.tplActions}>
                          <button type="button" className="save" onClick={saveTemplate}>Сохранить</button>
                          <button type="button" onClick={() => { setTplNew(false); setTplName(''); }}>Отменить</button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className={layout.field}>
            <label>Подразделения</label>
            <DivisionPick nodes={tree} selected={divisionIds} onChange={setDivisionIds} />
          </div>
          <div className={layout.field}>
            <label>Должности</label>
            <FilterPick options={positions} selected={positionIds} onChange={setPositionIds} />
          </div>
          <div className={layout.field}>
            <label>Сотрудники</label>
            <EmpPick options={employees} selected={employeeIds} onChange={setEmployeeIds} />
          </div>
          <div className={layout.field}>
            <label>Тип позиции</label>
            <div className={s.radios}>
              <label><input type="radio" name="posType" checked={positionType === 'all'} onChange={() => setPositionType('all')} /> Все</label>
              <label><input type="radio" name="posType" checked={positionType === 'primary'} onChange={() => setPositionType('primary')} /> Основной</label>
              <label><input type="radio" name="posType" checked={positionType === 'secondary'} onChange={() => setPositionType('secondary')} /> Не основной</label>
            </div>
          </div>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            {exportBtns(false)}
          </div>
        </form>
      ) : null}

      {tab === 'view' ? (
        <div className={layout.viewArea}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Нет данных. Откройте фильтр и нажмите «Составить отчет».</p>
          ) : (
            <>
              <div className={s.subTabs}>
                <button type="button" className={viewTab === 'main' ? `${s.subTab} ${s.subOn}` : s.subTab} onClick={() => setViewTab('main')}>
                  Итоговый отчет по начислениям с группировками
                </button>
                <button type="button" className={viewTab === 'byDiv' ? `${s.subTab} ${s.subOn}` : s.subTab} onClick={() => setViewTab('byDiv')}>
                  Сотрудники по подразделениям
                </button>
                <button type="button" className={viewTab === 'divs' ? `${s.subTab} ${s.subOn}` : s.subTab} onClick={() => setViewTab('divs')}>
                  Подразделения
                </button>
              </div>
              <p className={s.meta}>{report.periodLine}</p>
              <p className={s.meta}>{report.positionTypeLabel}</p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      {dualHeader(activeCols).map((h, i) => (
                        <th key={`${h.label}-${i}`} colSpan={h.span}>{h.label}</th>
                      ))}
                    </tr>
                    <tr>
                      {activeCols.map((c, i) => (
                        <th key={`${c.key}-${i}`}>{c.group ? c.label : ''}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.length === 0 ? (
                      <tr><td className={s.empty} colSpan={activeCols.length}>Нет данных</td></tr>
                    ) : (
                      activeRows.map((r, idx) => (
                        <tr key={String(r.n ?? idx)}>
                          {activeCols.map((c, i) => (
                            <td key={`${c.key}-${i}`} className={c.name ? s.name : c.money ? s.num : undefined}>
                              {cellValue(r, c)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <>
          {savedFlash ? <p className={s.savedOk}>{savedFlash}</p> : null}
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            accrualOptions={accrualOpts}
            deductionOptions={deductionOpts}
          />
        </>
      ) : null}
    </div>
  );
}
