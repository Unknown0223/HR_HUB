'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AttSettings } from './settings';
import local from './page.module.css';

type Opt = { id: string; label: string };

function Check({
  on,
  label,
  onChange,
  disabled = false,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`${local.t13Check}${disabled ? ` ${local.dim}` : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={local.t13Box} aria-hidden />
      <span>{label}</span>
    </label>
  );
}

function GroupPick({
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
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n)) : options;
  }, [options, q]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={local.t13Reveal}>
      <p className={local.t13Hint}>Показать руководителя из группы подразделений</p>
      <div className={`${local.dropWrap}${open ? ` ${local.dropOpen}` : ''}`} ref={wrapRef}>
        <input
          className={local.t13Search}
          placeholder="Поиск..."
          value={open ? q : selected.length ? `Выбрано: ${selected.length}` : ''}
          onFocus={() => {
            setOpen(true);
            setQ('');
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
        <div className={local.dropPanel} hidden={!open}>
          {open ? (
            <>
              {filtered.length === 0 ? <div className={local.pickHint}>Нет данных</div> : null}
              {filtered.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    className={on ? `${local.listRow} ${local.listOn}` : local.listRow}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(o.id)}
                  >
                    <span className={`${local.t13Box}${on ? ` ${local.t13BoxOn}` : ''}`} aria-hidden />
                    <span>{o.label}</span>
                  </button>
                );
              })}
              {options.length > 1 ? (
                <button
                  type="button"
                  className={local.showAll}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onChange(selected.length === options.length ? [] : options.map((o) => o.id))}
                >
                  {selected.length === options.length ? 'Снять все' : 'Показать все'}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function T13SettingsPanel({
  settings,
  setSettings,
  divisionGroups,
}: {
  settings: AttSettings;
  setSettings: (next: AttSettings) => void;
  divisionGroups: Opt[];
}) {
  const set = (patch: Partial<AttSettings>) => setSettings({ ...settings, ...patch });
  const managerGroups = settings.managerGroupId ? settings.managerGroupId.split(',').filter(Boolean) : [];
  return (
    <div className={local.t13Settings}>
      <div className={local.t13Col}>
        <h3>Информация о сотруднике</h3>
        <Check on={settings.tabNumber} onChange={(v) => set({ tabNumber: v })} label="Табельный номер" />
        <Check on={settings.staffPos} onChange={(v) => set({ staffPos: v })} label="Позиция" />
        <Check on={settings.position} onChange={(v) => set({ position: v })} label="Должность" />
        <Check on={settings.grade} onChange={(v) => set({ grade: v })} label="Разряд" />
        <Check on={settings.division} onChange={(v) => set({ division: v })} label="Подразделение" />
        <Check on={settings.department} onChange={(v) => set({ department: v })} label="Отдел" />
        <Check on={settings.location} onChange={(v) => set({ location: v })} label="Локации" />
        <Check on={settings.schedule} onChange={(v) => set({ schedule: v })} label="График работы" />
        <Check
          on={settings.manager}
          onChange={(v) => set({ manager: v, managerGroupId: v ? settings.managerGroupId : '' })}
          label="Руководитель"
        />
        {settings.manager ? (
          <GroupPick
            options={divisionGroups}
            selected={managerGroups}
            onChange={(ids) => set({ managerGroupId: ids.join(',') })}
          />
        ) : null}
      </div>
      <div className={local.t13Col}>
        <h3>Информация о посещениях</h3>
        <Check on={settings.late} onChange={(v) => set({ late: v })} label="Опоздание" />
        <Check on={settings.early} onChange={(v) => set({ early: v })} label="Ранний уход" />
        <Check on={settings.overtime} onChange={(v) => set({ overtime: v })} label="Сверхурочно" />
        <Check on={settings.offSchedule} onChange={(v) => set({ offSchedule: v })} label="Вне графика (не учтено)" />
        <Check on={settings.hoursWorked} onChange={(v) => set({ hoursWorked: v })} label="Отработано часов" />
        <Check on={settings.daysWorked} onChange={(v) => set({ daysWorked: v })} label="Отработано дней" />
        <Check on={settings.customNormDays} onChange={(v) => set({ customNormDays: v })} label="Настройка пользовательской нормы дней" />
        <Check on={settings.customNormHours} onChange={(v) => set({ customNormHours: v })} label="Настройка пользовательской нормы часов" />
        <Check
          on={settings.showMinutes}
          onChange={(v) => set({ showMinutes: v, showHhMm: v ? settings.showHhMm : false })}
          label="Показать минуты"
        />
        <Check
          on={settings.showHhMm}
          onChange={(v) => set({ showHhMm: v })}
          disabled={!settings.showMinutes}
          label="Показать (чч, мин)"
        />
        <Check
          on={settings.showArrival}
          onChange={(v) => set({ showArrival: v, arrivalTime: v })}
          label="Время прихода и ухода"
        />
        <Check on={settings.checkMarks} onChange={(v) => set({ checkMarks: v })} label="Проверить отметки" />
        <Check on={settings.markSchedule} onChange={(v) => set({ markSchedule: v })} label="Показать расписание отметок" />
        <Check
          on={settings.showDismissed}
          onChange={(v) => set({ showDismissed: v })}
          label="Отображать уволенных либо еще не принятых на работу"
        />
      </div>
    </div>
  );
}
