'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

export type UserSettings = {
  login: string;
  roles: string[];
  systemAccess: boolean;
  accessAllEmployees: boolean;
  accessAllOrgEmployees: boolean;
  fullEfficiencyAccess: boolean;
  marksEnabled: boolean;
  marks: {
    autoDetectType: boolean;
    arrival: boolean;
    departure: boolean;
    mark: boolean;
    breakStart: boolean;
    breakEnd: boolean;
    stageGps: boolean;
    stageFace: boolean;
    emotionEyes: boolean;
    emotionSmile: boolean;
  };
  gpsEnabled: boolean;
  gps: {
    trackLocation: boolean;
    autoLeaveByGps: boolean;
    trackByArrivalDeparture: boolean;
    quality: string;
  };
  photoUploadEnabled: boolean;
  photoUpload: { allowUpload: boolean };
  absenceReqEnabled: boolean;
  absenceReq: { allow: boolean; changeStateOnConfirm: boolean };
  scheduleChangeEnabled: boolean;
  scheduleChange: {
    allow: boolean;
    allowDayExchange: boolean;
    changeStateOnConfirm: boolean;
  };
  markReqEnabled: boolean;
  markReq: { allow: boolean };
  dismissReqEnabled: boolean;
  dismissReq: { allow: boolean };
  locationReqEnabled: boolean;
  locationReq: { allow: boolean };
  overtimeReqEnabled: boolean;
  overtimeReq: { allow: boolean };
  vacationReqEnabled: boolean;
  vacationReq: { allow: boolean };
  scheduleLimitEnabled: boolean;
  scheduleLimit: { timeLimit: boolean; monthlyLimit: boolean };
  salaryShowEnabled: boolean;
  salaryShow: { show: boolean };
  markLimitEnabled: boolean;
  markLimit: { monthlyLimit: boolean };
};

const ROLE_OPTS = [
  'Сотрудник',
  'Руководитель',
  'HR',
  'Администратор',
  'Бухгалтер',
];

export function defaultUserSettings(): UserSettings {
  return {
    login: '',
    roles: ['Сотрудник'],
    systemAccess: true,
    accessAllEmployees: false,
    accessAllOrgEmployees: false,
    fullEfficiencyAccess: false,
    marksEnabled: false,
    marks: {
      autoDetectType: false,
      arrival: true,
      departure: true,
      mark: true,
      breakStart: false,
      breakEnd: false,
      stageGps: false,
      stageFace: false,
      emotionEyes: false,
      emotionSmile: false,
    },
    gpsEnabled: false,
    gps: {
      trackLocation: false,
      autoLeaveByGps: false,
      trackByArrivalDeparture: false,
      quality: 'high',
    },
    photoUploadEnabled: false,
    photoUpload: { allowUpload: false },
    absenceReqEnabled: false,
    absenceReq: { allow: false, changeStateOnConfirm: false },
    scheduleChangeEnabled: false,
    scheduleChange: {
      allow: false,
      allowDayExchange: false,
      changeStateOnConfirm: false,
    },
    markReqEnabled: false,
    markReq: { allow: false },
    dismissReqEnabled: false,
    dismissReq: { allow: false },
    locationReqEnabled: false,
    locationReq: { allow: false },
    overtimeReqEnabled: false,
    overtimeReq: { allow: false },
    vacationReqEnabled: false,
    vacationReq: { allow: false },
    scheduleLimitEnabled: false,
    scheduleLimit: { timeLimit: false, monthlyLimit: false },
    salaryShowEnabled: false,
    salaryShow: { show: true },
    markLimitEnabled: false,
    markLimit: { monthlyLimit: false },
  };
}

function mergeSettings(raw: unknown): UserSettings {
  const base = defaultUserSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const src = raw as Partial<UserSettings>;
  return {
    ...base,
    ...src,
    roles: Array.isArray(src.roles) ? src.roles.map(String) : base.roles,
    marks: { ...base.marks, ...(src.marks || {}) },
    gps: { ...base.gps, ...(src.gps || {}) },
    photoUpload: { ...base.photoUpload, ...(src.photoUpload || {}) },
    absenceReq: { ...base.absenceReq, ...(src.absenceReq || {}) },
    scheduleChange: { ...base.scheduleChange, ...(src.scheduleChange || {}) },
    markReq: { ...base.markReq, ...(src.markReq || {}) },
    dismissReq: { ...base.dismissReq, ...(src.dismissReq || {}) },
    locationReq: { ...base.locationReq, ...(src.locationReq || {}) },
    overtimeReq: { ...base.overtimeReq, ...(src.overtimeReq || {}) },
    vacationReq: { ...base.vacationReq, ...(src.vacationReq || {}) },
    scheduleLimit: { ...base.scheduleLimit, ...(src.scheduleLimit || {}) },
    salaryShow: { ...base.salaryShow, ...(src.salaryShow || {}) },
    markLimit: { ...base.markLimit, ...(src.markLimit || {}) },
  };
}

type Props = {
  employeeId: string;
  initial?: unknown;
  loginSuffix?: string;
  onSaved?: () => void;
};

export function UserSettingsPanel({
  employeeId,
  initial,
  loginSuffix = 'lalaku',
  onSaved,
}: Props) {
  const [form, setForm] = useState<UserSettings>(() => mergeSettings(initial));
  const [savedSnap, setSavedSnap] = useState(() => JSON.stringify(mergeSettings(initial)));
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    const next = mergeSettings(initial);
    setForm(next);
    setSavedSnap(JSON.stringify(next));
    setPassword('');
  }, [initial]);

  const dirty = useMemo(() => {
    return JSON.stringify(form) !== savedSnap || password.trim().length > 0;
  }, [form, savedSnap, password]);

  function setFlag<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    if (viewOnly) return;
    setForm((f) => ({ ...f, [key]: value }));
  }

  function patchNested<K extends 'marks' | 'gps' | 'photoUpload' | 'absenceReq' | 'scheduleChange' | 'markReq' | 'dismissReq' | 'locationReq' | 'overtimeReq' | 'vacationReq' | 'scheduleLimit' | 'salaryShow' | 'markLimit'>(
    key: K,
    patch: Partial<UserSettings[K]>,
  ) {
    if (viewOnly) return;
    setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));
  }

  function toggleRole(role: string) {
    if (viewOnly) return;
    setForm((f) => {
      const has = f.roles.includes(role);
      return {
        ...f,
        roles: has ? f.roles.filter((r) => r !== role) : [...f.roles, role],
      };
    });
  }

  async function save() {
    setBusy(true);
    setErr('');
    setOkMsg('');
    try {
      await apiFetch(`/api/employees/${employeeId}/user-settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          settings: form,
          password: password.trim() || null,
        }),
      });
      setSavedSnap(JSON.stringify(form));
      setPassword('');
      setOkMsg('Сохранено');
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function Toggle({
    on,
    label,
    onToggle,
  }: {
    on: boolean;
    label: string;
    onToggle: () => void;
  }) {
    return (
      <div className={styles.usToggleRow}>
        <button
          type="button"
          className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
          aria-pressed={on}
          disabled={viewOnly}
          onClick={onToggle}
        />
        <span>{label}</span>
      </div>
    );
  }

  function Check({
    checked,
    label,
    onChange,
    indent,
  }: {
    checked: boolean;
    label: string;
    onChange: () => void;
    indent?: number;
  }) {
    return (
      <label
        className={styles.usCheck}
        style={indent ? { paddingLeft: `${indent * 1.25}rem` } : undefined}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={viewOnly}
          onChange={onChange}
        />
        <span>{label}</span>
      </label>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.locHead}>
        <h3 className={styles.locTitle}>Настройки пользователя</h3>
        <div className={styles.usActions}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setViewOnly((v) => !v)}
          >
            {viewOnly ? 'Редактировать' : 'Просмотр'}
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={busy || viewOnly || !dirty}
            onClick={() => void save()}
          >
            Сохранить
          </button>
        </div>
      </div>
      {err ? <p className={styles.errorText}>{err}</p> : null}
      {okMsg ? <p className={styles.okText}>{okMsg}</p> : null}

      <div className={styles.usGrid}>
        <div className={styles.usCol}>
          <div className={styles.modalField}>
            <label>Логин</label>
            <div className={styles.usLoginWrap}>
              <span className={styles.usLoginIcon} aria-hidden>
                ⌕
              </span>
              <input
                value={form.login}
                disabled={viewOnly}
                onChange={(e) => setFlag('login', e.target.value)}
                placeholder=""
              />
              <span className={styles.usLoginSuffix}>@{loginSuffix}</span>
            </div>
          </div>
          <div className={styles.modalField}>
            <label>Пароль</label>
            <div className={styles.usPassWrap}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                disabled={viewOnly}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className={styles.usEyeBtn}
                title={showPass ? 'Скрыть' : 'Показать'}
                onClick={() => setShowPass((v) => !v)}
              >
                {showPass ? '◉' : '◎'}
              </button>
            </div>
          </div>
          <div className={styles.modalField}>
            <label>Роли</label>
            <div className={styles.usRoles}>
              <div className={styles.usRoleTags}>
                {form.roles.map((r) => (
                  <span key={r} className={styles.usRoleTag}>
                    {r}
                    {!viewOnly ? (
                      <button
                        type="button"
                        className={styles.usRoleX}
                        onClick={() => toggleRole(r)}
                        aria-label={`Убрать ${r}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
                <button
                  type="button"
                  className={styles.usRoleAdd}
                  disabled={viewOnly}
                  onClick={() => setRoleOpen((o) => !o)}
                >
                  +
                </button>
              </div>
              {roleOpen && !viewOnly ? (
                <ul className={styles.usRoleList}>
                  {ROLE_OPTS.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        className={styles.docTypeOption}
                        onClick={() => {
                          toggleRole(r);
                          setRoleOpen(false);
                        }}
                      >
                        {form.roles.includes(r) ? '✓ ' : ''}
                        {r}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <Toggle
            on={form.systemAccess}
            label={
              form.systemAccess
                ? 'Доступ к системе включен'
                : 'Доступ к системе отключен'
            }
            onToggle={() => setFlag('systemAccess', !form.systemAccess)}
          />
          <Toggle
            on={form.accessAllEmployees}
            label={
              form.accessAllEmployees
                ? 'Доступ ко всем сотрудникам включен'
                : 'Доступ ко всем сотрудникам отключен'
            }
            onToggle={() => setFlag('accessAllEmployees', !form.accessAllEmployees)}
          />
          <Toggle
            on={form.accessAllOrgEmployees}
            label={
              form.accessAllOrgEmployees
                ? 'Доступ ко всем сотрудникам организации включен'
                : 'Доступ ко всем сотрудникам организации выключен'
            }
            onToggle={() =>
              setFlag('accessAllOrgEmployees', !form.accessAllOrgEmployees)
            }
          />
          <Toggle
            on={form.fullEfficiencyAccess}
            label={
              form.fullEfficiencyAccess
                ? 'Полный доступ к модулю эффективности включен'
                : 'Полный доступ к модулю эффективности отключен'
            }
            onToggle={() =>
              setFlag('fullEfficiencyAccess', !form.fullEfficiencyAccess)
            }
          />
        </div>

        <div className={styles.usCol}>
          <Toggle
            on={form.marksEnabled}
            label={
              form.marksEnabled
                ? 'Настройки отметок'
                : 'Настройки отметок (глобальные)'
            }
            onToggle={() => setFlag('marksEnabled', !form.marksEnabled)}
          />
          {form.marksEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.marks.autoDetectType}
                label="Автоматическое определение типа отметки"
                onChange={() =>
                  patchNested('marks', {
                    autoDetectType: !form.marks.autoDetectType,
                  })
                }
              />
              <div className={styles.usSubHead}>Типы отметок</div>
              <Check
                checked={form.marks.arrival}
                label="Приход"
                onChange={() =>
                  patchNested('marks', { arrival: !form.marks.arrival })
                }
              />
              <Check
                checked={form.marks.departure}
                label="Уход"
                onChange={() =>
                  patchNested('marks', { departure: !form.marks.departure })
                }
              />
              <Check
                checked={form.marks.mark}
                label="Отметка"
                onChange={() => patchNested('marks', { mark: !form.marks.mark })}
              />
              <Check
                checked={form.marks.breakStart}
                label="Начало перерыва"
                onChange={() =>
                  patchNested('marks', { breakStart: !form.marks.breakStart })
                }
              />
              <Check
                checked={form.marks.breakEnd}
                label="Конец перерыва"
                onChange={() =>
                  patchNested('marks', { breakEnd: !form.marks.breakEnd })
                }
              />
              <div className={styles.usSubHead}>Этапы отметки</div>
              <Check
                checked={form.marks.stageGps}
                label="Определение GPS координат"
                onChange={() =>
                  patchNested('marks', { stageGps: !form.marks.stageGps })
                }
              />
              <Check
                checked={form.marks.stageFace}
                label="Распознавание лица"
                onChange={() =>
                  patchNested('marks', { stageFace: !form.marks.stageFace })
                }
              />
              {form.marks.stageFace ? (
                <>
                  <Check
                    indent={1}
                    checked={form.marks.emotionEyes}
                    label="Проверка эмоций - закрытие глаз"
                    onChange={() =>
                      patchNested('marks', {
                        emotionEyes: !form.marks.emotionEyes,
                      })
                    }
                  />
                  <Check
                    indent={1}
                    checked={form.marks.emotionSmile}
                    label="Проверка эмоций - улыбка"
                    onChange={() =>
                      patchNested('marks', {
                        emotionSmile: !form.marks.emotionSmile,
                      })
                    }
                  />
                </>
              ) : null}
            </div>
          ) : null}

          <Toggle
            on={form.gpsEnabled}
            label={
              form.gpsEnabled
                ? 'Настройки GPS отслеживания'
                : 'Настройки GPS отслеживания (глобальные)'
            }
            onToggle={() => setFlag('gpsEnabled', !form.gpsEnabled)}
          />
          {form.gpsEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.gps.trackLocation}
                label="Отслеживать местоположение"
                onChange={() =>
                  patchNested('gps', {
                    trackLocation: !form.gps.trackLocation,
                  })
                }
              />
              <Check
                checked={form.gps.autoLeaveByGps}
                label="Автоматический уход по GPS"
                onChange={() =>
                  patchNested('gps', {
                    autoLeaveByGps: !form.gps.autoLeaveByGps,
                  })
                }
              />
              <Check
                checked={form.gps.trackByArrivalDeparture}
                label="Отслеживание местоположения по времени прихода и ухода"
                onChange={() =>
                  patchNested('gps', {
                    trackByArrivalDeparture: !form.gps.trackByArrivalDeparture,
                  })
                }
              />
              <div className={styles.modalField}>
                <label>Качество GPS отслеживания</label>
                <select
                  value={form.gps.quality}
                  disabled={viewOnly}
                  onChange={(e) =>
                    patchNested('gps', { quality: e.target.value })
                  }
                >
                  <option value="low">Низкий</option>
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                </select>
              </div>
            </div>
          ) : null}

          <Toggle
            on={form.photoUploadEnabled}
            label={
              form.photoUploadEnabled
                ? 'Настройки загрузки фото для распознавания'
                : 'Настройки загрузки фото для распознавания (глобальные)'
            }
            onToggle={() =>
              setFlag('photoUploadEnabled', !form.photoUploadEnabled)
            }
          />
          {form.photoUploadEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.photoUpload.allowUpload}
                label="Разрешить загрузку фото для распознавания"
                onChange={() =>
                  patchNested('photoUpload', {
                    allowUpload: !form.photoUpload.allowUpload,
                  })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.absenceReqEnabled}
            label={
              form.absenceReqEnabled
                ? 'Настройки запросов на отсутствие'
                : 'Настройки запросов на отсутствие (глобальные)'
            }
            onToggle={() =>
              setFlag('absenceReqEnabled', !form.absenceReqEnabled)
            }
          />
          {form.absenceReqEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.absenceReq.allow}
                label="Разрешить запросы на отсутствие"
                onChange={() =>
                  patchNested('absenceReq', {
                    allow: !form.absenceReq.allow,
                  })
                }
              />
              <Check
                checked={form.absenceReq.changeStateOnConfirm}
                label="Изменить состояние при подтверждении (если руководитель)"
                onChange={() =>
                  patchNested('absenceReq', {
                    changeStateOnConfirm: !form.absenceReq.changeStateOnConfirm,
                  })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.scheduleChangeEnabled}
            label={
              form.scheduleChangeEnabled
                ? 'Настройки запросов на изменение рабочего графика'
                : 'Настройки запросов на изменение рабочего графика (глобальные)'
            }
            onToggle={() =>
              setFlag('scheduleChangeEnabled', !form.scheduleChangeEnabled)
            }
          />
          {form.scheduleChangeEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.scheduleChange.allow}
                label="Разрешить запросы на изменение графика"
                onChange={() =>
                  patchNested('scheduleChange', {
                    allow: !form.scheduleChange.allow,
                  })
                }
              />
              <Check
                checked={form.scheduleChange.allowDayExchange}
                label="Разрешить запросы на обмен днями"
                onChange={() =>
                  patchNested('scheduleChange', {
                    allowDayExchange: !form.scheduleChange.allowDayExchange,
                  })
                }
              />
              <Check
                checked={form.scheduleChange.changeStateOnConfirm}
                label="Изменить состояние при подтверждении (если руководитель)"
                onChange={() =>
                  patchNested('scheduleChange', {
                    changeStateOnConfirm:
                      !form.scheduleChange.changeStateOnConfirm,
                  })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.markReqEnabled}
            label={
              form.markReqEnabled
                ? 'Настройки запросов на отметки'
                : 'Настройки запросов на отметки (глобальные)'
            }
            onToggle={() => setFlag('markReqEnabled', !form.markReqEnabled)}
          />
          {form.markReqEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.markReq.allow}
                label="Разрешить запросы на отметки"
                onChange={() =>
                  patchNested('markReq', { allow: !form.markReq.allow })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.dismissReqEnabled}
            label={
              form.dismissReqEnabled
                ? 'Настройки заявок на увольнение'
                : 'Настройки заявок на увольнение (глобальные)'
            }
            onToggle={() =>
              setFlag('dismissReqEnabled', !form.dismissReqEnabled)
            }
          />
          {form.dismissReqEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.dismissReq.allow}
                label="Разрешить заявки на увольнение"
                onChange={() =>
                  patchNested('dismissReq', { allow: !form.dismissReq.allow })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.locationReqEnabled}
            label={
              form.locationReqEnabled
                ? 'Настройки запросов на локацию'
                : 'Настройки запросов на локацию (глобальные)'
            }
            onToggle={() =>
              setFlag('locationReqEnabled', !form.locationReqEnabled)
            }
          />
          {form.locationReqEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.locationReq.allow}
                label="Разрешить запросы на локацию"
                onChange={() =>
                  patchNested('locationReq', {
                    allow: !form.locationReq.allow,
                  })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.overtimeReqEnabled}
            label={
              form.overtimeReqEnabled
                ? 'Настройки запросов на сверхурочные'
                : 'Настройки запросов на сверхурочные (глобальные)'
            }
            onToggle={() =>
              setFlag('overtimeReqEnabled', !form.overtimeReqEnabled)
            }
          />
          {form.overtimeReqEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.overtimeReq.allow}
                label="Разрешить запросы на сверхурочные"
                onChange={() =>
                  patchNested('overtimeReq', {
                    allow: !form.overtimeReq.allow,
                  })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.vacationReqEnabled}
            label={
              form.vacationReqEnabled
                ? 'Настройки заявок на отпуск'
                : 'Настройки заявок на отпуск (глобальные)'
            }
            onToggle={() =>
              setFlag('vacationReqEnabled', !form.vacationReqEnabled)
            }
          />
          {form.vacationReqEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.vacationReq.allow}
                label="Разрешить заявки на отпуск"
                onChange={() =>
                  patchNested('vacationReq', {
                    allow: !form.vacationReq.allow,
                  })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.scheduleLimitEnabled}
            label={
              form.scheduleLimitEnabled
                ? 'Настройки ограничений запросов на изменение графика'
                : 'Настройки ограничений запросов на изменение графика (глобальные)'
            }
            onToggle={() =>
              setFlag('scheduleLimitEnabled', !form.scheduleLimitEnabled)
            }
          />
          {form.scheduleLimitEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.scheduleLimit.timeLimit}
                label="Ограничение времени запроса на изменение графика"
                onChange={() =>
                  patchNested('scheduleLimit', {
                    timeLimit: !form.scheduleLimit.timeLimit,
                  })
                }
              />
              <Check
                checked={form.scheduleLimit.monthlyLimit}
                label="Ограничение кол-во запросов на изменение графика в месяц"
                onChange={() =>
                  patchNested('scheduleLimit', {
                    monthlyLimit: !form.scheduleLimit.monthlyLimit,
                  })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.salaryShowEnabled}
            label={
              form.salaryShowEnabled
                ? 'Настройки показа зарплаты'
                : 'Настройки показа зарплаты (глобальные)'
            }
            onToggle={() =>
              setFlag('salaryShowEnabled', !form.salaryShowEnabled)
            }
          />
          {form.salaryShowEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.salaryShow.show}
                label="Показывать зарплату"
                onChange={() =>
                  patchNested('salaryShow', { show: !form.salaryShow.show })
                }
              />
            </div>
          ) : null}

          <Toggle
            on={form.markLimitEnabled}
            label={
              form.markLimitEnabled
                ? 'Настройки ограничений запросов на отметки'
                : 'Настройки ограничений запросов на отметки (глобальные)'
            }
            onToggle={() =>
              setFlag('markLimitEnabled', !form.markLimitEnabled)
            }
          />
          {form.markLimitEnabled ? (
            <div className={styles.usNested}>
              <Check
                checked={form.markLimit.monthlyLimit}
                label="Ограничение кол-во запросов на отметки в месяц"
                onChange={() =>
                  patchNested('markLimit', {
                    monthlyLimit: !form.markLimit.monthlyLimit,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
