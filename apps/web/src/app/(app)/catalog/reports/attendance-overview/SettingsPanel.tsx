'use client';

import { useMemo, useState } from 'react';
import {
  AttSettings,
  DIV_DYN_FIELDS,
  EMP_DYN_FIELDS,
  RoundType,
} from './settings';
import local from './page.module.css';

type Opt = { id: string; label: string };

function Check({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={local.opt}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={local.toggle}>
      <span>{label}</span>
      <span className={on ? local.switchOn : local.switchOff}>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
        {on ? 'Да' : 'Нет'}
      </span>
    </label>
  );
}

function OneOf({
  checked,
  label,
  onPick,
}: {
  checked: boolean;
  label: string;
  onPick: () => void;
}) {
  return (
    <label className={local.opt}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {
          if (!checked) onPick();
        }}
      />
      {label}
    </label>
  );
}

function MiniPick({
  options,
  selected,
  onChange,
  placeholder = 'Поиск...',
}: {
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n)) : options;
  }, [options, q]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={local.reveal}>
      <input
        className={local.dropSearch}
        style={{ border: '1px solid #d1d5db', borderRadius: 4 }}
        placeholder={placeholder}
        value={open ? q : selected.length ? `Выбрано: ${selected.length}` : ''}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {open ? (
        <div className={local.miniList}>
          {filtered.length === 0 ? <div className={local.pickHint}>Нет данных</div> : null}
          {filtered.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button type="button" key={o.id} className={on ? `${local.listRow} ${local.listOn}` : local.listRow} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(o.id)}>
                <input type="checkbox" className={local.box} readOnly checked={on} tabIndex={-1} />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SinglePick({
  options,
  value,
  onChange,
}: {
  options: Opt[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n)) : options;
  }, [options, q]);
  const label = options.find((o) => o.id === value)?.label || '';
  return (
    <div className={local.reveal}>
      <input
        className={local.dropSearch}
        style={{ border: '1px solid #d1d5db', borderRadius: 4 }}
        placeholder="Поиск..."
        value={open ? q : label}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {open ? (
        <div className={local.miniList}>
          <button
            type="button"
            className={local.listRow}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            — не выбран —
          </button>
          {filtered.map((o) => (
            <button
              type="button"
              key={o.id}
              className={o.id === value ? `${local.listRow} ${local.listOn}` : local.listRow}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPanel({
  settings,
  setSettings,
  divisionGroups,
  timeTypes,
}: {
  settings: AttSettings;
  setSettings: (next: AttSettings) => void;
  divisionGroups: Opt[];
  timeTypes: Opt[];
}) {
  const set = (patch: Partial<AttSettings>) => setSettings({ ...settings, ...patch });
  return (
    <div className={local.settings}>
      <div className={local.card}>
        <h3>Информация о сотруднике</h3>
        <Check on={settings.tabNumber} onChange={(v) => set({ tabNumber: v })} label="Табельный номер" />
        <Check on={settings.position} onChange={(v) => set({ position: v })} label="Должность" />
        <Check on={settings.pinfl} onChange={(v) => set({ pinfl: v })} label="ПИНФЛ" />
        <Check on={settings.grade} onChange={(v) => set({ grade: v })} label="Разряд" />
        <Check on={settings.hireDate} onChange={(v) => set({ hireDate: v })} label="Установка даты приема" />
        <Check on={settings.altName} onChange={(v) => set({ altName: v })} label="Альтернативное имя сотрудника" />
        <Check on={settings.schedule} onChange={(v) => set({ schedule: v })} label="График работы" />
        <Check on={settings.manager} onChange={(v) => set({ manager: v, managerGroupId: v ? settings.managerGroupId : '' })} label="Руководитель" />
        {settings.manager ? (
          <div className={local.reveal}>
            <p className={local.hint}>Показать руководителя из группы подразделений</p>
            <SinglePick options={divisionGroups} value={settings.managerGroupId} onChange={(id) => set({ managerGroupId: id })} />
          </div>
        ) : null}

        <h3>Организационная структура</h3>
        <Check on={settings.division} onChange={(v) => set({ division: v })} label="Подразделение" />
        <Check on={settings.sortByDivision} onChange={(v) => set({ sortByDivision: v })} label="Сортировка по подразделениям" />
        <Check on={settings.deptCode} onChange={(v) => set({ deptCode: v })} label="Код подразделения" />
        <Check on={settings.deptGroup} onChange={(v) => set({ deptGroup: v })} label="Группа подразделений" />
        <Check on={settings.region} onChange={(v) => set({ region: v })} label="Регион" />
        <Check on={settings.location} onChange={(v) => set({ location: v })} label="Локация" />

        <h3>Фильтры и динамические поля</h3>
        <Check on={settings.showDismissed} onChange={(v) => set({ showDismissed: v })} label="Отображать уволенных либо еще не принятых на работу" />
        <Check on={settings.empDynFields} onChange={(v) => set({ empDynFields: v, empDynFieldIds: v ? settings.empDynFieldIds : [] })} label="Показать динамические поля сотрудника" />
        {settings.empDynFields ? (
          <MiniPick options={EMP_DYN_FIELDS} selected={settings.empDynFieldIds} onChange={(ids) => set({ empDynFieldIds: ids })} />
        ) : null}
        <Check on={settings.divDynFields} onChange={(v) => set({ divDynFields: v, divDynFieldIds: v ? settings.divDynFieldIds : [] })} label="Показать динамические поля подразделений" />
        {settings.divDynFields ? (
          <MiniPick options={DIV_DYN_FIELDS} selected={settings.divDynFieldIds} onChange={(ids) => set({ divDynFieldIds: ids })} />
        ) : null}
      </div>

      <div className={local.card}>
        <h3>Информация о посещениях</h3>
        <Check on={settings.late} onChange={(v) => set({ late: v })} label="Опоздание" />
        <Check on={settings.early} onChange={(v) => set({ early: v })} label="Ранний уход" />
        <Check on={settings.overtime} onChange={(v) => set({ overtime: v })} label="Сверхурочно" />
        <Check on={settings.offSchedule} onChange={(v) => set({ offSchedule: v })} label="Вне графика (не учтено)" />
        <Check on={settings.hoursWorked} onChange={(v) => set({ hoursWorked: v })} label="Отработано часов" />
        <Check on={settings.workCoeff} onChange={(v) => set({ workCoeff: v })} label="Отработанный коэффициент" />
        <Check on={settings.daysWorked} onChange={(v) => set({ daysWorked: v })} label="Отработано дней" />
        <Check on={settings.plannedDays} onChange={(v) => set({ plannedDays: v })} label="Дни по плану" />
        <Check on={settings.customNormDays} onChange={(v) => set({ customNormDays: v })} label="Пользовательская норма дней" />
        <Check on={settings.customNormHours} onChange={(v) => set({ customNormHours: v })} label="Пользовательская норма часов" />
        <Check on={settings.daysCoeff} onChange={(v) => set({ daysCoeff: v })} label="Коэффициент отработанных дней" />
        <Check on={settings.consecutiveAbsent} onChange={(v) => set({ consecutiveAbsent: v })} label="Дни отсутствия подряд" />
        <Check on={settings.hoursPerDay} onChange={(v) => set({ hoursPerDay: v })} label="Отработано часов (за день)" />
        <Check on={settings.dailyFacts} onChange={(v) => set({ dailyFacts: v })} label="Факты по дням" />
        <Check on={settings.requestTime} onChange={(v) => set({ requestTime: v })} label="Время запроса" />
        <Toggle on={settings.showArrival} onChange={(v) => set({ showArrival: v, arrivalTime: v ? settings.arrivalTime || true : false, infoByRows: false, infoByCols: false })} label="Отображать приход и уход" />
        {settings.showArrival ? (
          <div className={local.reveal}>
            <Check on={settings.arrivalTime} onChange={(v) => set({ arrivalTime: v })} label="Время прихода и ухода" />
            <div className={local.exclusive}>
              <p className={local.hint}>Только один вариант</p>
              <OneOf
                checked={settings.infoByRows}
                label="Показывать входящую информацию по строкам"
                onPick={() => set({ infoByRows: true, infoByCols: false })}
              />
              <OneOf
                checked={settings.infoByCols}
                label="Показывать входящую информацию по столбцам"
                onPick={() => set({ infoByRows: false, infoByCols: true })}
              />
              <Check
                on={!settings.infoByRows && !settings.infoByCols}
                onChange={(v) => {
                  if (v) set({ infoByRows: false, infoByCols: false });
                }}
                label="Не разделять"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className={local.card}>
        <h3>Формат и отображение</h3>
        <Toggle on={settings.timeDisplay} onChange={(v) => set({ timeDisplay: v, timeFormat: v ? settings.timeFormat || 'clock' : settings.timeFormat })} label="Отображение времени" />
        {settings.timeDisplay ? (
          <div className={local.exclusive}>
            <p className={local.hint}>Только один формат времени</p>
            <OneOf checked={settings.timeFormat === 'clock'} label="Показать минуты (8:30)" onPick={() => set({ timeFormat: 'clock' })} />
            <OneOf checked={settings.timeFormat === 'text'} label="Показать текстом (8 ч 30 мин)" onPick={() => set({ timeFormat: 'text' })} />
            <OneOf checked={settings.timeFormat === 'minutes'} label="Показывать только минуты (480)" onPick={() => set({ timeFormat: 'minutes' })} />
          </div>
        ) : null}
        <Check on={settings.showColorDesc} onChange={(v) => set({ showColorDesc: v })} label="Показывать описание цветов" />
        <Check on={settings.hideCodes} onChange={(v) => set({ hideCodes: v })} label="Скрыть буквенные коды" />
        <Check on={settings.hideHours} onChange={(v) => set({ hideHours: v })} label="Скрыть отработанные часы" />
        <Check on={settings.absenceByType} onChange={(v) => set({ absenceByType: v, timeTypeIds: v ? settings.timeTypeIds : [] })} label="Отсутствие по виду времени" />
        {settings.absenceByType ? (
          <div className={local.reveal}>
            <p className={local.hint}>Виды рабочего времени</p>
            <MiniPick options={timeTypes} selected={settings.timeTypeIds} onChange={(ids) => set({ timeTypeIds: ids })} />
          </div>
        ) : null}
        <Check on={settings.internalTrip} onChange={(v) => set({ internalTrip: v })} label="Внутренние командировки" />
        <Check on={settings.checkMarks} onChange={(v) => set({ checkMarks: v })} label="Проверить отметки" />
        <Check on={settings.markSchedule} onChange={(v) => set({ markSchedule: v })} label="Расписание отметок" />
        <Check on={settings.markDetails} onChange={(v) => set({ markDetails: v })} label="Детали отметок" />
        <Check on={settings.dayMarkDetails} onChange={(v) => set({ dayMarkDetails: v })} label="Детали отметки за день" />
        <Check on={settings.splitByDivision} onChange={(v) => set({ splitByDivision: v, sortByDivision: v || settings.sortByDivision })} label="Разделять по подразделениям" />
        <Check on={settings.roundHours} onChange={(v) => set({ roundHours: v })} label="Округлять часы" />
        {settings.roundHours ? (
          <div className={local.reveal}>
            <label className={local.hint}>Тип округления</label>
            <select className={local.select} value={settings.roundType} onChange={(e) => set({ roundType: e.target.value as RoundType })}>
              <option value="nearest">До ближайшего</option>
              <option value="up">В большую сторону</option>
              <option value="down">В меньшую сторону</option>
            </select>
            <label className={local.hint}>Округление</label>
            <select className={local.select} value={settings.roundStep} onChange={(e) => set({ roundStep: e.target.value })}>
              <option value="0.25">±0.2500000</option>
              <option value="0.5">±0.5000000</option>
              <option value="1">±1.0000000</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className={local.card}>
        <h3>Расчет</h3>
        <Toggle on={settings.customWorked} onChange={(v) => set({ customWorked: v })} label="Пользовательские настройки отработанного времени" />
        {settings.customWorked ? (
          <div className={local.reveal}>
            <Check on={settings.countEarlyIn} onChange={(v) => set({ countEarlyIn: v })} label="Учитывать ранний приход" />
            <Check on={settings.countLateOut} onChange={(v) => set({ countLateOut: v })} label="Учитывать поздний уход" />
            <Check on={settings.lunch} onChange={(v) => set({ lunch: v })} label="Учитывать обеденное время" />
            <Check on={settings.weekendTime} onChange={(v) => set({ weekendTime: v })} label="Учитывать время в выходные дни" />
            <Check on={settings.missedAsAbsent} onChange={(v) => set({ missedAsAbsent: v })} label="Учитывать пропущенные отметки как отсутствие" />
            <Check on={settings.hourlyFacts} onChange={(v) => set({ hourlyFacts: v })} label="Расчет почасовых фактов" />
            {settings.hourlyFacts ? (
              <div className={local.timeRow}>
                <label className={local.hint}>
                  Начало
                  <input type="time" value={settings.workStart} onChange={(e) => set({ workStart: e.target.value })} />
                </label>
                <label className={local.hint}>
                  Конец
                  <input type="time" value={settings.workEnd} onChange={(e) => set({ workEnd: e.target.value })} />
                </label>
              </div>
            ) : null}
            <Check on={settings.monthlyPlan} onChange={(v) => set({ monthlyPlan: v })} label="Месячный план" />
            <Check on={settings.absenceWithCoeff} onChange={(v) => set({ absenceWithCoeff: v })} label="Отсутствие по причине с учетом коэффициента" />
            <Check on={settings.weekendCoeff} onChange={(v) => set({ weekendCoeff: v })} label="Коэффициент работы в выходные дни" />
            {settings.weekendCoeff ? (
              <label className={local.hint}>
                Работа в выходные дни
                <input className={local.num} type="number" min="0" step="0.1" value={settings.weekendK} onChange={(e) => set({ weekendK: e.target.value })} />
              </label>
            ) : null}
          </div>
        ) : null}

        <h3>Показатели штрафов</h3>
        <Check on={settings.fineLate} onChange={(v) => set({ fineLate: v })} label="Штрафное время за опоздание" />
        <Check on={settings.fineTime} onChange={(v) => set({ fineTime: v })} label="Штрафное время" />
        <Check on={settings.workedWithFines} onChange={(v) => set({ workedWithFines: v })} label="Отработанное время с учетом штрафов" />
        <Check on={settings.fineEarly} onChange={(v) => set({ fineEarly: v })} label="Штрафное время за ранний уход" />
        <Check on={settings.fineAbsent} onChange={(v) => set({ fineAbsent: v })} label="Штрафное время за отсутствие" />
        <Check on={settings.fineOnlyPeriod} onChange={(v) => set({ fineOnlyPeriod: v })} label="Считать штрафное время только за период" />

        <h3>Исходные штрафы</h3>
        <Check on={settings.origFineLate} onChange={(v) => set({ origFineLate: v })} label="Исходное штрафное время за опоздание" />
        <Check on={settings.origFineEarly} onChange={(v) => set({ origFineEarly: v })} label="Исходное штрафное время за ранний уход" />
        <Check on={settings.origFineAbsent} onChange={(v) => set({ origFineAbsent: v })} label="Исходное штрафное время за отсутствие" />
        <Check on={settings.origFine} onChange={(v) => set({ origFine: v })} label="Исходное штрафное время" />
      </div>
    </div>
  );
}
